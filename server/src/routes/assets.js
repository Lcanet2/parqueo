import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { getAppSettings } from '../lib/appSettings.js';
import { text, tropLong, LIMITS } from '../lib/input.js';

const router = Router();

const TYPES = ['pc', 'printer', 'server', 'software'];
const STATUSES = ['in_service', 'in_repair', 'retired'];

const assetInclude = {
  assignedUser: { select: { id: true, name: true, email: true } },
};

router.use(authRequired);

// L'accès des utilisateurs finals à l'inventaire est débrayable dans Paramètres.
router.use(async (req, res, next) => {
  if (req.user.role !== 'user') return next();
  if ((await getAppSettings()).assetsVisibleToUsers) return next();
  res.status(403).json({ error: "L'inventaire n'est pas accessible" });
});

// Utilisateur final : uniquement ses actifs. Tech/admin : tout.
function visibilityWhere(user) {
  if (user.role === 'user') return { assignedUserId: user.sub };
  return {};
}

router.get('/', async (req, res) => {
  const { type, status, q } = req.query;
  const where = { ...visibilityWhere(req.user) };

  if (type && TYPES.includes(type)) where.type = type;
  if (status && STATUSES.includes(status)) where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } },
    ];
  }

  const assets = await prisma.asset.findMany({
    where,
    include: assetInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(assets);
});

router.get('/:id', async (req, res) => {
  const asset = await prisma.asset.findFirst({
    where: { id: Number(req.params.id), ...visibilityWhere(req.user) },
    include: {
      ...assetInclude,
      tickets: {
        select: { id: true, title: true, status: true, priority: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      software: { include: { software: true }, orderBy: { software: { name: 'asc' } } },
    },
  });
  if (!asset) return res.status(404).json({ error: 'Actif introuvable' });
  res.json(asset);
});

function parseAssetBody(body, { partial = false } = {}) {
  const { name, type, location, purchaseDate, status, assignedUserId } = body;
  const errors = [];
  const data = {};

  if (!partial || name !== undefined) {
    if (!text(name)) errors.push('Nom requis');
    else data.name = text(name);
  }
  if (!partial || type !== undefined) {
    if (!TYPES.includes(type)) errors.push(`Type invalide (${TYPES.join(', ')})`);
    else data.type = type;
  }
  if (status !== undefined) {
    if (!STATUSES.includes(status)) errors.push(`Statut invalide (${STATUSES.join(', ')})`);
    else data.status = status;
  }
  if (location !== undefined) data.location = text(location) || null;
  if (purchaseDate !== undefined) {
    if (purchaseDate === null || purchaseDate === '') data.purchaseDate = null;
    else {
      const d = new Date(purchaseDate);
      if (Number.isNaN(d.getTime())) errors.push('Date d’achat invalide');
      else data.purchaseDate = d;
    }
  }
  if (assignedUserId !== undefined) {
    data.assignedUserId = assignedUserId === null ? null : Number(assignedUserId);
  }

  const trop = tropLong({ Nom: [data.name, LIMITS.nom], Emplacement: [data.location, LIMITS.libelle] });
  if (trop) errors.push(trop);

  return { data, errors };
}

router.post('/', requireRole('admin', 'technician'), async (req, res) => {
  const { data, errors } = parseAssetBody(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ; ') });

  if (data.assignedUserId) {
    const user = await prisma.user.findUnique({ where: { id: data.assignedUserId } });
    if (!user) return res.status(400).json({ error: 'Utilisateur assigné inconnu' });
  }

  const asset = await prisma.asset.create({ data, include: assetInclude });
  res.status(201).json(asset);
});

router.patch('/:id', requireRole('admin', 'technician'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Actif introuvable' });

  const { data, errors } = parseAssetBody(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(' ; ') });

  if (data.assignedUserId) {
    const user = await prisma.user.findUnique({ where: { id: data.assignedUserId } });
    if (!user) return res.status(400).json({ error: 'Utilisateur assigné inconnu' });
  }

  const asset = await prisma.asset.update({ where: { id }, data, include: assetInclude });
  res.json(asset);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.asset.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Actif introuvable' });
  if (existing._count.tickets > 0) {
    return res.status(409).json({
      error: 'Des tickets référencent cet actif. Passez-le en "retiré" plutôt que de le supprimer.',
    });
  }

  await prisma.asset.delete({ where: { id } });
  res.status(204).end();
});

export default router;
