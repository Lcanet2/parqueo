import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { getAppSettings } from '../lib/appSettings.js';

const router = Router();

router.use(authRequired);

// Écriture : admin toujours ; techniciens seulement si le paramètre l'autorise.
async function canWriteKb(req, res, next) {
  if (req.user.role === 'admin') return next();
  if (req.user.role === 'technician' && (await getAppSettings()).kbTechniciansWrite) return next();
  res.status(403).json({ error: 'Accès réservé' });
}

const articleInclude = {
  category: true,
  author: { select: { id: true, name: true } },
};

// Liste + recherche (?q=&categoryId=&take=). La recherche découpe la requête en
// mots et matche titre OU corps — c'est ce qui alimente aussi les suggestions
// à la création de ticket. Les brouillons ne sont visibles que du staff.
router.get('/', async (req, res) => {
  const { q, categoryId, take } = req.query;
  const where = {};

  if (req.user.role === 'user') where.published = true;
  if (categoryId) where.categoryId = Number(categoryId) || undefined;
  if (q?.trim()) {
    const words = q.trim().split(/\s+/).filter((w) => w.length >= 3).slice(0, 8);
    if (words.length) {
      where.OR = words.flatMap((w) => [
        { title: { contains: w, mode: 'insensitive' } },
        { body: { contains: w, mode: 'insensitive' } },
      ]);
    }
  }

  const articles = await prisma.kbArticle.findMany({
    where,
    include: articleInclude,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Number(take) || 50, 50),
  });
  res.json(articles);
});

router.get('/:id', async (req, res) => {
  const article = await prisma.kbArticle.findFirst({
    where: {
      id: Number(req.params.id) || 0,
      ...(req.user.role === 'user' ? { published: true } : {}),
    },
    include: articleInclude,
  });
  if (!article) return res.status(404).json({ error: 'Article introuvable' });
  res.json(article);
});

router.post('/', canWriteKb, async (req, res) => {
  const { title, body, categoryId, published } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Titre et contenu requis' });
  }
  const article = await prisma.kbArticle.create({
    data: {
      title: title.trim(),
      body: body.trim(),
      categoryId: categoryId ? Number(categoryId) : null,
      published: published !== false,
      authorId: req.user.sub,
    },
    include: articleInclude,
  });
  res.status(201).json(article);
});

router.patch('/:id', canWriteKb, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Article introuvable' });

  const { title, body, categoryId, published } = req.body;
  const data = {};
  if (title !== undefined && title.trim()) data.title = title.trim();
  if (body !== undefined && body.trim()) data.body = body.trim();
  if (categoryId !== undefined) data.categoryId = categoryId === null ? null : Number(categoryId);
  if (published !== undefined) data.published = Boolean(published);

  const article = await prisma.kbArticle.update({ where: { id }, data, include: articleInclude });
  res.json(article);
});

router.delete('/:id', canWriteKb, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.kbArticle.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Article introuvable' });
  await prisma.kbArticle.delete({ where: { id } });
  res.status(204).end();
});

export default router;
