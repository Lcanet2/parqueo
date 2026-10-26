import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { text, tropLong, LIMITS } from '../lib/input.js';
import { effacerFichiers } from '../services/fichiers.js';

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

// Suppression d'un référentiel. Tant qu'il est utilisé, l'API refuse (409) et
// dit par quoi ; l'interface propose alors de tout déplacer ailleurs :
// ?reassignTo=<id> reporte tickets, formulaires, comptes… et les références des
// workflows sur la cible, puis supprime, le tout dans une transaction.
// ?reassignTo=none supprime sans déplacer : une équipe laisse tickets et comptes
// sans équipe ; une catégorie, obligatoire sur les tickets et les formulaires,
// les emporte avec elle (l'interface prévient que c'est définitif).

const pluriel = (n, mot) => n && `${n} ${mot}${n > 1 ? 's' : ''}`;

// Réécrit les workflows qui visent un référentiel supprimé : la condition de
// déclenchement (conditionKey) et les blocs, via remapStep(config, type) qui
// renvoie la nouvelle config, ou null si le bloc n'est pas concerné.
async function remapWorkflows(tx, { from, to, conditionKey, remapStep }) {
  if (conditionKey) {
    const workflows = await tx.workflow.findMany({ select: { id: true, conditions: true } });
    for (const wf of workflows) {
      if (Number(wf.conditions?.[conditionKey]) !== from) continue;
      await tx.workflow.update({
        where: { id: wf.id },
        data: { conditions: { ...wf.conditions, [conditionKey]: to } },
      });
    }
  }
  for (const st of await tx.workflowStep.findMany()) {
    const config = remapStep(st.config ?? {}, st.type);
    if (config) await tx.workflowStep.update({ where: { id: st.id }, data: { config } });
  }
}

router.delete('/categories/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true, forms: true, kbArticles: true } } },
  });
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });

  const { tickets, forms, kbArticles } = category._count;
  const reassignTo = req.query.reassignTo;

  if (reassignTo === undefined) {
    if (tickets || forms || kbArticles) {
      const usages = [
        pluriel(tickets, 'ticket'),
        pluriel(forms, 'formulaire'),
        pluriel(kbArticles, 'article'),
      ];
      return res.status(409).json({ error: `Catégorie utilisée par ${usages.filter(Boolean).join(', ')}.` });
    }
    await prisma.category.delete({ where: { id } });
    return res.status(204).end();
  }

  if (reassignTo === 'none') {
    const attachments = await prisma.attachment.findMany({
      where: { ticket: { categoryId: id } },
      select: { storedPath: true },
    });
    await prisma.$transaction(async (tx) => {
      // Commentaires, pièces jointes et exécutions de workflow suivent en cascade.
      await tx.ticket.deleteMany({ where: { categoryId: id } });
      await tx.form.deleteMany({ where: { categoryId: id } });
      // Un article d'aide reste utile sans catégorie (elle y est facultative).
      await tx.kbArticle.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      await tx.category.delete({ where: { id } });
    });
    await effacerFichiers(attachments);
    console.log(
      `[catégories] « ${category.name} » supprimée avec ${tickets} ticket(s) et ${forms} formulaire(s) par l'utilisateur ${req.user.sub}`
    );
    return res.status(204).end();
  }

  const to = Number(reassignTo);
  if (!Number.isInteger(to) || to === id || !(await prisma.category.findUnique({ where: { id: to } }))) {
    return res.status(400).json({ error: 'Catégorie de destination invalide' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({ where: { categoryId: id }, data: { categoryId: to } });
    await tx.form.updateMany({ where: { categoryId: id }, data: { categoryId: to } });
    await tx.kbArticle.updateMany({ where: { categoryId: id }, data: { categoryId: to } });
    await remapWorkflows(tx, {
      from: id,
      to,
      conditionKey: 'categoryId',
      remapStep: (cfg, type) =>
        type === 'condition' && cfg.field === 'category' && Number(cfg.value) === id
          ? { ...cfg, value: typeof cfg.value === 'string' ? String(to) : to }
          : null,
    });
    await tx.category.delete({ where: { id } });
  });
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
  const reassignTo = req.query.reassignTo;

  if (reassignTo === undefined) {
    if (tickets || members) {
      const usages = [pluriel(tickets, 'ticket'), pluriel(members, 'compte')];
      return res.status(409).json({ error: `Équipe utilisée par ${usages.filter(Boolean).join(', ')}.` });
    }
    await prisma.team.delete({ where: { id } });
    return res.status(204).end();
  }

  // « none » : tickets et comptes restent sans équipe (les deux sont facultatifs).
  const to = reassignTo === 'none' ? null : Number(reassignTo);
  if (
    to !== null &&
    (!Number.isInteger(to) || to === id || !(await prisma.team.findUnique({ where: { id: to } })))
  ) {
    return res.status(400).json({ error: 'Équipe de destination invalide' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({ where: { teamId: id }, data: { teamId: to } });
    await tx.user.updateMany({ where: { teamId: id }, data: { teamId: to } });
    // Sans destination, un bloc « affecter à l'équipe » garde l'ancien id ;
    // le moteur ignore déjà une équipe introuvable.
    if (to !== null) {
      await remapWorkflows(tx, {
        from: id,
        to,
        remapStep: (cfg, type) =>
          type === 'assign_team' && Number(cfg.teamId) === id ? { ...cfg, teamId: to } : null,
      });
    }
    await tx.team.delete({ where: { id } });
  });
  res.status(204).end();
});

export default router;
