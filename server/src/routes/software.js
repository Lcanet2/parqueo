import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { id } from '../lib/input.js';

// Catalogue de logiciels : vue transversale du parc (qui a quoi, en quelles
// versions). Réservé au support (technicien/admin) — les utilisateurs finals
// n'ont pas à voir l'inventaire logiciel de toute l'entreprise.

const router = Router();

router.use(authRequired, requireRole('admin', 'technician'));

// Liste du catalogue avec le nombre d'installations. ?q= filtre sur le nom ;
// ?assetId= ne garde que les logiciels installés sur ce poste, avec la version
// qui y est installée (« qu'y a-t-il sur ce PC ? »).
router.get('/', async (req, res) => {
  const { q } = req.query;
  const assetId = req.query.assetId !== undefined ? id(req.query.assetId) : undefined;
  if (assetId === null) return res.status(400).json({ error: 'Poste invalide' });

  const where = {};
  if (q) where.name = { contains: String(q), mode: 'insensitive' };
  if (assetId) where.installs = { some: { assetId } };

  const list = await prisma.software.findMany({
    where,
    include: {
      _count: { select: { installs: true } },
      ...(assetId ? { installs: { where: { assetId }, select: { version: true } } } : {}),
    },
    orderBy: { name: 'asc' },
  });
  res.json(
    list.map((s) => ({
      id: s.id,
      name: s.name,
      publisher: s.publisher,
      installs: s._count.installs,
      // Plusieurs versions d'un même logiciel peuvent cohabiter sur un poste.
      ...(assetId ? { versions: [...new Set(s.installs.map((i) => i.version).filter(Boolean))] } : {}),
    }))
  );
});

// Détail d'un logiciel : les actifs où il est installé, avec leur version.
router.get('/:id', async (req, res) => {
  const software = await prisma.software.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      installs: {
        include: { asset: { select: { id: true, name: true, type: true, status: true } } },
        orderBy: { asset: { name: 'asc' } },
      },
    },
  });
  if (!software) return res.status(404).json({ error: 'Logiciel introuvable' });
  res.json(software);
});

export default router;
