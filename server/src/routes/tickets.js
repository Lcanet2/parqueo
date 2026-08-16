import { Router } from '../lib/router.js';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { visibilityWhere } from '../lib/visibility.js';
import { getAppSettings } from '../lib/appSettings.js';
import { text, tropLong, LIMITS, entierBorne } from '../lib/input.js';
import { statutApresAssignation } from '../lib/statut.js';
import { ticketStats, ticketListes } from '../lib/stats.js';
import { onTicketCreated, onTicketUpdated } from '../services/workflowEngine.js';
import { describeGate } from '../lib/workflowUtils.js';
import { STATUS_LABELS } from '../lib/labels.js';
import {
  notifyTicketCreated,
  notifyStatusChanged,
  notifyAssigned,
  notifyCommentAdded,
} from '../services/mailer.js';

const router = Router();

const STATUSES = ['new', 'in_progress', 'waiting', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high'];

// « Ouvert » n'est pas un statut mais un regroupement : nouveau, en cours et en
// attente — soit « ce qu'il reste à traiter ». C'est le filtre le plus utile au
// quotidien, et il n'était pas exprimable : la liste ne prenait qu'un statut
// unique. D'où des tuiles de tableau de bord qui comptaient les tickets ouverts
// mais renvoyaient vers la liste complète.
const OPEN = ['new', 'in_progress', 'waiting'];

function statusWhere(status) {
  if (status === 'open') return { status: { in: OPEN } };
  if (STATUSES.includes(status)) return { status };
  return null;
}

// Tri par colonne demandé depuis l'en-tête du tableau, au format « colonne-direction »
// (ex. status-asc). status et priority sont des enums Postgres : ils se trient dans
// l'ordre de définition (new→closed, low→high), pas alphabétiquement.
const SORT_COLUMNS = {
  id: (dir) => ({ id: dir }),
  status: (dir) => ({ status: dir }),
  priority: (dir) => ({ priority: dir }),
  category: (dir) => ({ category: { name: dir } }),
  assignee: (dir) => ({ assignee: { name: dir } }),
  updated: (dir) => ({ updatedAt: dir }),
};

function resolveOrderBy(sort) {
  // Présélections historiques (menu déroulant de la liste).
  if (sort === 'oldest') return { createdAt: 'asc' };
  if (sort === 'priority') return [{ priority: 'desc' }, { updatedAt: 'desc' }];
  const [col, dir] = String(sort ?? '').split('-');
  if (SORT_COLUMNS[col] && (dir === 'asc' || dir === 'desc')) return SORT_COLUMNS[col](dir);
  return { updatedAt: 'desc' }; // défaut : activité récente
}

const ALLOWED_FILES = /\.(png|jpe?g|gif|webp|pdf|txt|log|csv|zip|docx?|xlsx?|pptx?)$/i;

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_FILES.test(file.originalname)),
});

const ticketInclude = {
  category: true,
  author: { select: { id: true, name: true, email: true, avatar: true } },
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
  team: true,
  asset: { select: { id: true, name: true, type: true } },
};

async function findVisibleTicket(id, user) {
  return prisma.ticket.findFirst({
    where: { id, ...visibilityWhere(user) },
    include: ticketInclude,
  });
}

// Réponse HTML minimale pour l'enquête de satisfaction (ouverte depuis un email).
function satisfactionPage(res, status, title, detail) {
  res.status(status).send(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>Parqueo</title>
    <body style="font-family:system-ui,sans-serif;background:#f7f7f8;color:#1c1c21;display:flex;justify-content:center;padding-top:15vh">
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:32px 40px;text-align:center;max-width:420px">
    <h1 style="font-size:18px;margin:0 0 8px">${title}</h1>
    <p style="font-size:14px;color:#6b6b76;margin:0">${detail}</p>
    </div></body></html>`
  );
}

// Enquête un clic depuis l'email de résolution — lien signé, sans authentification.
// Déclarée avant authRequired ; le chemin ne peut pas entrer en collision avec /:id (non numérique).
router.get('/satisfaction', async (req, res) => {
  const { token, value } = req.query;
  if (!['up', 'down'].includes(value)) {
    return satisfactionPage(res, 400, 'Lien invalide', 'Ce lien de satisfaction est incomplet.');
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'satisfaction') throw new Error('bad purpose');
  } catch {
    return satisfactionPage(res, 400, 'Lien invalide ou expiré', 'Ce lien de satisfaction n\'est plus valable.');
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: payload.sub } });
  if (!ticket) {
    return satisfactionPage(res, 404, 'Ticket introuvable', 'Ce ticket n\'existe plus.');
  }
  if (ticket.satisfaction !== null) {
    return satisfactionPage(res, 200, 'Retour déjà enregistré', `Votre avis sur le ticket #${ticket.id} a déjà été pris en compte.`);
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { satisfaction: value === 'up' ? 1 : 0, satisfactionAt: new Date() },
  });
  satisfactionPage(
    res,
    200,
    'Merci pour votre retour !',
    `Votre avis ${value === 'up' ? '👍' : '👎'} sur le ticket #${ticket.id} a bien été enregistré.`
  );
});

router.use(authRequired);

// Liste + filtres (?status=&priority=&assigneeId=(id|none)&categoryId=&teamId=&q=&sort=)
// Avec ?page=&pageSize= : réponse { items, total, counts } où counts donne le nombre
// de tickets par statut (hors filtre statut) pour les chips de la liste.
// Sans ?page : tableau complet (dashboard, compatibilité).
router.get('/', async (req, res) => {
  const { status, priority, assigneeId, authorId, categoryId, teamId, q, sort, page, pageSize } = req.query;
  const where = { ...visibilityWhere(req.user) };

  if (priority && PRIORITIES.includes(priority)) where.priority = priority;
  if (assigneeId === 'none') where.assigneeId = null;
  else if (assigneeId) where.assigneeId = Number(assigneeId) || undefined;
  if (categoryId) where.categoryId = Number(categoryId) || undefined;
  if (teamId) where.teamId = Number(teamId) || undefined;

  // Conditions cumulées dans AND, pour qu'elles ne puissent que **restreindre**
  // la visibilité. `authorId` porte la même clé que la visibilité d'un
  // utilisateur final ({ authorId: soi }) : l'affecter directement l'écrasait
  // et ouvrait les tickets d'autrui. Le AND conserve les deux conditions.
  const et = [];
  if (authorId) {
    const n = Number(authorId);
    if (Number.isInteger(n) && n > 0) et.push({ authorId: n });
  }
  if (q) {
    et.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (et.length) where.AND = et;

  const orderBy = resolveOrderBy(sort);

  const filtreStatut = statusWhere(status);
  const whereListe = { ...where, ...filtreStatut };

  if (page === undefined) {
    const tickets = await prisma.ticket.findMany({
      where: whereListe,
      include: ticketInclude,
      orderBy,
    });
    return res.json(tickets);
  }

  // pageSize peut valoir « all » (tout afficher) ou un nombre borné à 500.
  const all = pageSize === 'all';
  const take = all ? undefined : entierBorne(pageSize, { defaut: 25, min: 1, max: 500 });
  const skip = all ? 0 : (entierBorne(page) - 1) * take;

  // counts est calculé hors filtre statut : les chips affichent toujours tous les statuts.
  const grouped = await prisma.ticket.groupBy({ by: ['status'], where, _count: true });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count;
  counts.open = OPEN.reduce((n, s) => n + counts[s], 0);

  const total = filtreStatut
    ? counts[status === 'open' ? 'open' : status]
    : grouped.reduce((sum, g) => sum + g._count, 0);
  const items = await prisma.ticket.findMany({
    where: whereListe,
    include: ticketInclude,
    orderBy,
    ...(all ? {} : { skip, take }),
  });
  res.json({ items, total, counts });
});

// Agrégats du tableau de bord : tout est compté en SQL, dans les limites de
// visibilité du demandeur. Remplace le téléchargement intégral des tickets.
router.get('/stats', async (req, res) => {
  const where = visibilityWhere(req.user);
  const [stats, listes] = await Promise.all([
    ticketStats(where, req.user),
    ticketListes(where, req.user),
  ]);
  res.json({ ...stats, listes });
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...visibilityWhere(req.user) },
    include: {
      ...ticketInclude,
      comments: {
        include: { author: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'asc' },
      },
      attachments: { include: { uploader: { select: { id: true, name: true, avatar: true } } } },
      workflowRuns: {
        where: { status: 'running' },
        include: { workflow: { include: { steps: true } } },
      },
    },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });

  // État lisible de chaque workflow en cours : sur quel bloc d'attente le ticket
  // est parqué (retrouvé par sa clé dans le graphe).
  ticket.workflows = ticket.workflowRuns.map((run) => {
    const node = run.workflow.steps.find((s) => s.key === run.nodeKey);
    return {
      name: run.workflow.name,
      waiting: describeGate(node, (s) => STATUS_LABELS[s] ?? s),
    };
  });
  delete ticket.workflowRuns;

  res.json(ticket);
});

router.post('/', async (req, res) => {
  const { priority, categoryId, assetId } = req.body;
  const title = text(req.body.title);
  const description = text(req.body.description);

  if (!title || !description || !categoryId) {
    return res.status(400).json({ error: 'Titre, description et catégorie requis' });
  }
  const trop = tropLong({ Titre: [title, LIMITS.titre], Description: [description, LIMITS.description] });
  if (trop) return res.status(400).json({ error: trop });
  if (priority && !PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Priorité invalide' });
  }

  const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
  if (!category) return res.status(400).json({ error: 'Catégorie inconnue' });

  // Actif rattaché : un utilisateur final ne peut désigner que le sien. Sans ce
  // contrôle, n'importe qui pouvait rattacher son ticket à un actif arbitraire
  // et en lire le nom dans la réponse — soit l'inventaire complet, par
  // énumération d'identifiants.
  if (assetId) {
    const asset = await prisma.asset.findFirst({
      where: {
        id: Number(assetId) || 0,
        ...(req.user.role === 'user' ? { assignedUserId: req.user.sub } : {}),
      },
      select: { id: true },
    });
    if (!asset) return res.status(400).json({ error: 'Actif inconnu' });
  }

  // La priorité choisie par un simple utilisateur n'est prise en compte que si
  // le paramètre l'autorise ; sinon c'est la priorité par défaut qui s'applique.
  const settings = await getAppSettings();
  const canSetPriority = req.user.role !== 'user' || settings.userCanSetPriority;

  let ticket = await prisma.ticket.create({
    data: {
      title,
      description,
      priority: (canSetPriority && priority) || settings.ticketDefaultPriority,
      categoryId: category.id,
      authorId: req.user.sub,
      assetId: assetId ? Number(assetId) : null,
    },
    include: ticketInclude,
  });

  ticket = await onTicketCreated(ticket);
  notifyTicketCreated(ticket);

  res.status(201).json(ticket);
});

// Mise à jour (statut, priorité, assignation, catégorie, actif)
router.patch('/:id', requireRole('admin', 'technician'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await findVisibleTicket(id, req.user);
  if (!existing) return res.status(404).json({ error: 'Ticket introuvable' });

  const { status, priority, assigneeId, categoryId, teamId, assetId, title, description } = req.body;
  const data = {};
  const events = [];

  if (status !== undefined) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
    if (status !== existing.status) {
      data.status = status;
      events.push(`Statut changé : ${existing.status} → ${status}`);
    }
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Priorité invalide' });
    if (priority !== existing.priority) {
      data.priority = priority;
      events.push(`Priorité changée : ${existing.priority} → ${priority}`);
    }
  }
  let newlyAssigned = false;
  if (assigneeId !== undefined) {
    const newAssigneeId = assigneeId === null ? null : Number(assigneeId);
    if (newAssigneeId !== null) {
      const assignee = await prisma.user.findUnique({ where: { id: newAssigneeId } });
      if (!assignee || assignee.role === 'user') {
        return res.status(400).json({ error: 'Assigné invalide (doit être technicien ou admin)' });
      }
      if (newAssigneeId !== existing.assigneeId) {
        events.push(`Assigné à ${assignee.name}`);
        // On ne prévient pas quelqu'un qui s'assigne lui-même le ticket.
        newlyAssigned = newAssigneeId !== req.user.sub;
      }
    } else if (existing.assigneeId !== null) {
      events.push('Assignation retirée');
    }
    data.assigneeId = newAssigneeId;
  }
  // Prise en charge : un ticket « Nouveau » qui reçoit un assigné passe « En
  // cours ». Un statut demandé explicitement dans la même requête l'emporte.
  if (data.status === undefined) {
    const auto = statutApresAssignation(existing.status, data.assigneeId);
    if (auto) {
      data.status = auto;
      events.push(`Statut changé : ${existing.status} → ${auto} (prise en charge)`);
    }
  }

  if (categoryId !== undefined) data.categoryId = Number(categoryId);
  if (teamId !== undefined) data.teamId = teamId === null ? null : Number(teamId);
  if (assetId !== undefined) data.assetId = assetId === null ? null : Number(assetId);
  if (title !== undefined && text(title)) data.title = text(title);
  if (description !== undefined && text(description)) data.description = text(description);

  const tropLongPatch = tropLong({
    Titre: [data.title, LIMITS.titre],
    Description: [data.description, LIMITS.description],
  });
  if (tropLongPatch) return res.status(400).json({ error: tropLongPatch });

  if (Object.keys(data).length === 0) {
    return res.json(existing);
  }

  let ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...data,
      comments: {
        create: events.map((body) => ({
          type: 'event',
          body,
          authorId: req.user.sub,
        })),
      },
    },
    include: ticketInclude,
  });

  if (data.status) {
    notifyStatusChanged(ticket, existing.status);
  }
  if (newlyAssigned) {
    notifyAssigned(ticket);
  }

  // Automatismes « statut changé » + reprise des workflows parqués : une
  // assignation débloque un « attendre prise en charge », un statut débloque un
  // « attendre statut ». On relance dès qu'un de ces deux champs change.
  if (data.status !== undefined || data.assigneeId !== undefined) {
    ticket = await onTicketUpdated(ticket, {
      statusChanged: data.status !== undefined,
      oldStatus: existing.status,
      newStatus: ticket.status,
    });
  }

  res.json(ticket);
});

router.post('/:id/comments', async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await findVisibleTicket(id, req.user);
  if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });

  const body = text(req.body.body);
  if (!body) return res.status(400).json({ error: 'Commentaire vide' });
  const tropLongCom = tropLong({ Commentaire: [body, LIMITS.commentaire] });
  if (tropLongCom) return res.status(400).json({ error: tropLongCom });

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId: id,
      authorId: req.user.sub,
      type: 'comment',
      body,
    },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  });

  notifyCommentAdded(ticket, comment);

  res.status(201).json(comment);
});

router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await findVisibleTicket(id, req.user);
  if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
  if (!req.file) {
    return res.status(400).json({ error: 'Fichier manquant ou type non autorisé (images, PDF, documents…)' });
  }

  const attachment = await prisma.attachment.create({
    data: {
      ticketId: id,
      filename: req.file.originalname,
      storedPath: req.file.path,
      size: req.file.size,
      uploadedBy: req.user.sub,
    },
  });

  res.status(201).json(attachment);
});

router.get('/:id/attachments/:attachmentId', async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await findVisibleTicket(id, req.user);
  if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });

  const attachment = await prisma.attachment.findFirst({
    where: { id: Number(req.params.attachmentId), ticketId: id },
  });
  if (!attachment) return res.status(404).json({ error: 'Pièce jointe introuvable' });

  res.download(path.resolve(attachment.storedPath), attachment.filename);
});

// Supprime les fichiers d'une liste de pièces jointes. Un fichier déjà absent
// n'est pas une erreur : la ligne en base fait foi.
async function effacerFichiers(attachments) {
  for (const a of attachments) {
    try {
      await fs.unlink(path.resolve(a.storedPath));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`[pièces jointes] ${a.storedPath} :`, err.message);
    }
  }
}

// Suppression définitive d'un ticket (droit à l'effacement). Les commentaires,
// pièces jointes et exécutions de workflow partent en cascade ; les fichiers sur
// disque sont retirés ici, sans quoi ils resteraient orphelins pour toujours.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { attachments: { select: { storedPath: true } } },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });

  await prisma.ticket.delete({ where: { id } });
  await effacerFichiers(ticket.attachments);
  console.log(`[tickets] #${id} supprimé par l'utilisateur ${req.user.sub}`);
  res.status(204).end();
});

// Suppression d'une pièce jointe : le support, ou celui qui l'a envoyée.
router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await findVisibleTicket(id, req.user);
  if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });

  const attachment = await prisma.attachment.findFirst({
    where: { id: Number(req.params.attachmentId), ticketId: id },
  });
  if (!attachment) return res.status(404).json({ error: 'Pièce jointe introuvable' });

  const estStaff = req.user.role !== 'user';
  if (!estStaff && attachment.uploadedBy !== req.user.sub) {
    return res.status(403).json({ error: 'Seul l’auteur de l’envoi peut retirer cette pièce jointe' });
  }

  await prisma.attachment.delete({ where: { id: attachment.id } });
  await effacerFichiers([attachment]);
  res.status(204).end();
});

export default router;
