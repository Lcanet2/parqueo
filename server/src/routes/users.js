import { Router } from '../lib/router.js';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { text, tropLong, LIMITS } from '../lib/input.js';

const router = Router();

const ROLES = ['admin', 'technician', 'user'];

const publicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  teamId: true,
  team: true,
  avatar: true,
  createdAt: true,
};

router.use(authRequired);

// Liste des assignables (techniciens + admins), accessible aux technicien/admin
// pour remplir les listes d'assignation.
router.get('/assignable', requireRole('admin', 'technician'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['admin', 'technician'] } },
    select: { id: true, name: true, role: true, teamId: true, avatar: true },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});

router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({ select: publicSelect, orderBy: { name: 'asc' } });
  res.json(users);
});

router.post('/', async (req, res) => {
  const { password, role, teamId } = req.body;
  const email = text(req.body.email).toLowerCase();
  const name = text(req.body.name);

  if (!email || typeof password !== 'string' || !name) {
    return res.status(400).json({ error: 'Email, mot de passe et nom requis' });
  }
  const trop = tropLong({ Nom: [name, LIMITS.nom], Email: [email, LIMITS.libelle] });
  if (trop) return res.status(400).json({ error: trop });
  if (password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  }
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Cet email existe déjà' });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      role: role || 'user',
      teamId: teamId ? Number(teamId) : null,
    },
    select: publicSelect,
  });
  res.status(201).json(user);
});

// Import en masse (CSV parsé côté client → tableau de lignes). Chaque ligne :
// { name, email, role?, team? (nom) | teamId?, password? }. Retourne un compte
// rendu par ligne : created (avec le mot de passe généré si absent), skipped
// (email déjà présent) ou error. Ne fait jamais échouer tout le lot.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const genPassword = () => crypto.randomBytes(9).toString('base64url'); // ~12 caractères

router.post('/import', async (req, res) => {
  const rows = Array.isArray(req.body?.users) ? req.body.users : null;
  if (!rows || rows.length === 0) return res.status(400).json({ error: 'Aucune ligne à importer' });
  if (rows.length > 1000) return res.status(400).json({ error: 'Import limité à 1000 lignes' });

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.id]));

  const results = [];
  const seen = new Set(); // doublons à l'intérieur du fichier lui-même
  for (const row of rows) {
    const name = String(row.name ?? '').trim();
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!name || !EMAIL_RE.test(email)) {
      results.push({ email: row.email ?? '', status: 'error', message: 'Nom ou email invalide' });
      continue;
    }
    if (seen.has(email)) {
      results.push({ email, status: 'skipped', message: 'En double dans le fichier' });
      continue;
    }
    seen.add(email);

    const role = ROLES.includes(row.role) ? row.role : 'user';
    let teamId = null;
    if (row.teamId) teamId = Number(row.teamId) || null;
    else if (row.team) teamId = teamByName.get(String(row.team).trim().toLowerCase()) ?? null;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      results.push({ email, status: 'skipped', message: 'Compte déjà existant' });
      continue;
    }

    const provided = row.password && String(row.password).length >= 8 ? String(row.password) : null;
    const password = provided ?? genPassword();
    try {
      await prisma.user.create({
        data: { name, email, role, teamId, passwordHash: await bcrypt.hash(password, 10) },
      });
      results.push({ email, name, status: 'created', ...(provided ? {} : { password }) });
    } catch (err) {
      results.push({ email, status: 'error', message: err.message });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errors = results.filter((r) => r.status === 'error').length;
  res.json({ summary: { total: rows.length, created, skipped, errors }, results });
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const { name, email, role, teamId, password } = req.body;
  const data = {};

  if (name !== undefined && text(name)) data.name = text(name);
  if (email !== undefined) {
    const normalized = text(email).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      return res.status(400).json({ error: 'Adresse email invalide' });
    }
    const other = await prisma.user.findUnique({ where: { email: normalized } });
    if (other && other.id !== id) return res.status(409).json({ error: 'Cet email existe déjà' });
    data.email = normalized;
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
    if (existing.id === req.user.sub && role !== 'admin') {
      return res.status(400).json({ error: 'Impossible de retirer son propre rôle admin' });
    }
    data.role = role;
  }
  if (teamId !== undefined) data.teamId = teamId === null ? null : Number(teamId);
  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const user = await prisma.user.update({ where: { id }, data, select: publicSelect });
  res.json(user);
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.sub) {
    return res.status(400).json({ error: 'Impossible de supprimer son propre compte' });
  }
  const existing = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          authoredTickets: true,
          // assignedTickets manquait : un technicien qui n'avait jamais ouvert
          // de ticket se supprimait sans un mot, et tous ceux qu'il traitait
          // passaient à « non assigné » — la trace de son travail disparaissait.
          assignedTickets: true,
          ticketComments: true,
          kbArticles: true,
          attachments: true,
        },
      },
    },
  });
  if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const c = existing._count;
  const usages = [
    c.authoredTickets && `${c.authoredTickets} ticket${c.authoredTickets > 1 ? 's' : ''} créé${c.authoredTickets > 1 ? 's' : ''}`,
    c.assignedTickets && `${c.assignedTickets} ticket${c.assignedTickets > 1 ? 's' : ''} assigné${c.assignedTickets > 1 ? 's' : ''}`,
    c.ticketComments && `${c.ticketComments} commentaire${c.ticketComments > 1 ? 's' : ''}`,
    c.kbArticles && `${c.kbArticles} article${c.kbArticles > 1 ? 's' : ''}`,
    c.attachments && `${c.attachments} pièce${c.attachments > 1 ? 's' : ''} jointe${c.attachments > 1 ? 's' : ''}`,
  ].filter(Boolean);

  if (usages.length) {
    return res.status(409).json({
      error: `Cet utilisateur a ${usages.join(', ')}. Changez son rôle ou son mot de passe plutôt que de le supprimer.`,
    });
  }

  await prisma.user.delete({ where: { id } });
  res.status(204).end();
});

export default router;
