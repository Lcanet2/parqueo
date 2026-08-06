import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { text, tropLong, LIMITS } from '../lib/input.js';

// Catégories et équipes : lecture pour tous (formulaires), écriture admin.
const router = Router();

router.use(authRequired);

router.get('/categories', async (req, res) => {
  res.json(await prisma.category.findMany({ orderBy: { name: 'asc' } }));
});

router.post('/categories', requireRole('admin'), async (req, res) => {
  const name = text(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const trop = tropLong({ Nom: [name, LIMITS.nom] });
  if (trop) return res.status(400).json({ error: trop });
  res.status(201).json(await prisma.category.create({ data: { name } }));
});

router.get('/teams', async (req, res) => {
  res.json(await prisma.team.findMany({ orderBy: { name: 'asc' } }));
});

router.post('/teams', requireRole('admin'), async (req, res) => {
  const name = text(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const trop = tropLong({ Nom: [name, LIMITS.nom] });
  if (trop) return res.status(400).json({ error: trop });
  res.status(201).json(await prisma.team.create({ data: { name } }));
});

// Suppression d'un référentiel : refusée tant qu'il est utilisé, pour ne pas
// laisser de tickets ou de formulaires sans catégorie.
router.delete('/categories/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true, forms: true, kbArticles: true } } },
  });
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });

  const { tickets, forms, kbArticles } = category._count;
  if (tickets || forms || kbArticles) {
    const usages = [
      tickets && `${tickets} ticket${tickets > 1 ? 's' : ''}`,
      forms && `${forms} formulaire${forms > 1 ? 's' : ''}`,
      kbArticles && `${kbArticles} article${kbArticles > 1 ? 's' : ''}`,
    ].filter(Boolean);
    return res.status(409).json({ error: `Catégorie utilisée par ${usages.join(', ')}.` });
  }

  await prisma.category.delete({ where: { id } });
  res.status(204).end();
});

router.delete('/teams/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const team = await prisma.team.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true, members: true } } },
  });
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });

  const { tickets, members } = team._count;
  if (tickets || members) {
    const usages = [
      tickets && `${tickets} ticket${tickets > 1 ? 's' : ''}`,
      members && `${members} compte${members > 1 ? 's' : ''}`,
    ].filter(Boolean);
    return res.status(409).json({ error: `Équipe utilisée par ${usages.join(', ')}.` });
  }

  await prisma.team.delete({ where: { id } });
  res.status(204).end();
});

export default router;
