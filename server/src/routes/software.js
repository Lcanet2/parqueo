import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

// Catalogue de logiciels : vue transversale du parc (qui a quoi, en quelles
// versions). Réservé au support (technicien/admin) — les utilisateurs finals
// n'ont pas à voir l'inventaire logiciel de toute l'entreprise.

const router = Router();

router.use(authRequired, requireRole('admin', 'technician'));

// Liste du catalogue avec le nombre d'installations. ?q= filtre sur le nom.
router.get('/', async (req, res) => {
  const { q } = req.query;
  const list = await prisma.software.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
    include: { _count: { select: { installs: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(
    list.map((s) => ({ id: s.id, name: s.name, publisher: s.publisher, installs: s._count.installs }))
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
