import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { text } from '../lib/input.js';

// Catégories et équipes : lecture pour tous (formulaires), écriture admin.
const router = Router();

router.use(authRequired);

router.get('/categories', async (req, res) => {
  res.json(await prisma.category.findMany({ orderBy: { name: 'asc' } }));
});

router.post('/categories', requireRole('admin'), async (req, res) => {
  const name = text(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  res.status(201).json(await prisma.category.create({ data: { name } }));
});

router.get('/teams', async (req, res) => {
  res.json(await prisma.team.findMany({ orderBy: { name: 'asc' } }));
});

router.post('/teams', requireRole('admin'), async (req, res) => {
  const name = text(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  res.status(201).json(await prisma.team.create({ data: { name } }));
});

export default router;
