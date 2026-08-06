import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { getAppSettings } from '../lib/appSettings.js';
import { text, tropLong, LIMITS } from '../lib/input.js';

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
  if (text(q)) {
    const words = text(q).split(/\s+/).filter((w) => w.length >= 3).slice(0, 8);
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
  const { categoryId, published } = req.body;
  const title = text(req.body.title);
  const body = text(req.body.body);
  if (!title || !body) {
    return res.status(400).json({ error: 'Titre et contenu requis' });
  }
  const trop = tropLong({ Titre: [title, LIMITS.articleTitre], Contenu: [body, LIMITS.articleCorps] });
  if (trop) return res.status(400).json({ error: trop });
  const article = await prisma.kbArticle.create({
    data: {
      title,
      body,
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
  if (title !== undefined && text(title)) data.title = text(title);
  if (body !== undefined && text(body)) data.body = text(body);
  const trop = tropLong({ Titre: [data.title, LIMITS.articleTitre], Contenu: [data.body, LIMITS.articleCorps] });
  if (trop) return res.status(400).json({ error: trop });
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
