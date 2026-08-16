import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { onTicketCreated } from '../services/workflowEngine.js';
import { notifyTicketCreated } from '../services/mailer.js';
import { text, tropLong, LIMITS } from '../lib/input.js';

const router = Router();

const FIELD_TYPES = ['text', 'textarea', 'select', 'date', 'checkbox'];

const formInclude = {
  category: true,
  fields: { orderBy: { position: 'asc' } },
};

router.use(authRequired);

// Catalogue : les formulaires actifs pour tout le monde, tous pour l'admin (?all=1).
router.get('/', async (req, res) => {
  const all = req.query.all === '1' && req.user.role === 'admin';
  const forms = await prisma.form.findMany({
    where: all ? {} : { active: true },
    include: formInclude,
    orderBy: { name: 'asc' },
  });
  res.json(forms);
});

router.get('/:id', async (req, res) => {
  const form = await prisma.form.findUnique({
    where: { id: Number(req.params.id) },
    include: formInclude,
  });
  if (!form || (!form.active && req.user.role !== 'admin')) {
    return res.status(404).json({ error: 'Formulaire introuvable' });
  }
  res.json(form);
});

// Soumission → création d'un ticket via le pipeline standard (workflow + mail).
router.post('/:id/submit', async (req, res) => {
  const form = await prisma.form.findUnique({
    where: { id: Number(req.params.id) },
    include: formInclude,
  });
  if (!form || !form.active) return res.status(404).json({ error: 'Formulaire introuvable' });

  const answers = req.body.answers ?? {};
  const lines = [];

  for (const field of form.fields) {
    const raw = answers[String(field.id)];
    const empty = raw === undefined || raw === null || raw === '' || raw === false;

    if (field.required && empty) {
      return res.status(400).json({ error: `Le champ « ${field.label} » est requis` });
    }
    if (empty) {
      lines.push(`${field.label} : —`);
      continue;
    }

    let value = String(raw);
    if (field.type === 'checkbox') {
      value = raw === true || raw === 'true' ? 'Oui' : 'Non';
    } else if (field.type === 'select') {
      const options = JSON.parse(field.options ?? '[]');
      if (!options.includes(value)) {
        return res.status(400).json({ error: `Valeur invalide pour « ${field.label} »` });
      }
    } else if (field.type === 'date') {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: `Date invalide pour « ${field.label} »` });
      }
      value = d.toLocaleDateString('fr-FR');
    } else if (value.length > 5000) {
      return res.status(400).json({ error: `Réponse trop longue pour « ${field.label} »` });
    }
    lines.push(`${field.label} : ${value}`);
  }

  let ticket = await prisma.ticket.create({
    data: {
      title: form.name,
      description: `Demande via le formulaire « ${form.name} »\n\n${lines.join('\n')}`,
      priority: form.priority,
      categoryId: form.categoryId,
      formId: form.id,
      authorId: req.user.sub,
    },
    include: {
      category: true,
      author: { select: { id: true, name: true, email: true, avatar: true } },
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      team: true,
      asset: { select: { id: true, name: true, type: true } },
    },
  });

  ticket = await onTicketCreated(ticket);
  notifyTicketCreated(ticket);

  res.status(201).json(ticket);
});

// --- Administration ---

function validateFields(fields) {
  if (!Array.isArray(fields)) return 'Liste de champs invalide';
  for (const f of fields) {
    if (!text(f?.label)) return 'Chaque champ doit avoir un libellé';
    if (text(f.label).length > LIMITS.libelle) return `Libellé de champ : ${LIMITS.libelle} caractères maximum`;
    if (!FIELD_TYPES.includes(f.type)) return `Type de champ invalide (${FIELD_TYPES.join(', ')})`;
    if (f.type === 'select') {
      const opts = Array.isArray(f.options) ? f.options.filter((o) => String(o).trim()) : [];
      if (opts.length < 2) return `Le champ « ${f.label} » (liste) doit avoir au moins 2 choix`;
    }
  }
  return null;
}

const toFieldRows = (fields, formId) =>
  fields.map((f, i) => ({
    formId,
    label: text(f.label),
    type: f.type,
    required: Boolean(f.required),
    options: f.type === 'select' ? JSON.stringify(f.options.map((o) => String(o).trim())) : null,
    position: i,
  }));

router.use(requireRole('admin'));

router.post('/', async (req, res) => {
  const { categoryId, priority, active, fields = [] } = req.body;
  const name = text(req.body.name);
  const description = text(req.body.description);

  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const trop = tropLong({ Nom: [name, LIMITS.nom], Description: [description, LIMITS.description] });
  if (trop) return res.status(400).json({ error: trop });
  const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
  if (!category) return res.status(400).json({ error: 'Catégorie inconnue' });
  if (priority && !['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ error: 'Priorité invalide' });
  }
  const fieldError = validateFields(fields);
  if (fieldError) return res.status(400).json({ error: fieldError });

  const form = await prisma.form.create({
    data: {
      name,
      description: description || null,
      categoryId: category.id,
      priority: priority || 'medium',
      active: active !== false,
    },
  });
  if (fields.length) {
    await prisma.formField.createMany({ data: toFieldRows(fields, form.id) });
  }
  res.status(201).json(await prisma.form.findUnique({ where: { id: form.id }, include: formInclude }));
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.form.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Formulaire introuvable' });

  const { name, description, categoryId, priority, active, fields } = req.body;
  const data = {};

  if (name !== undefined && text(name)) data.name = text(name);
  if (description !== undefined) data.description = text(description) || null;
  if (categoryId !== undefined) {
    const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
    if (!category) return res.status(400).json({ error: 'Catégorie inconnue' });
    data.categoryId = category.id;
  }
  if (priority !== undefined) {
    if (!['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ error: 'Priorité invalide' });
    data.priority = priority;
  }
  if (active !== undefined) data.active = Boolean(active);

  if (fields !== undefined) {
    const fieldError = validateFields(fields);
    if (fieldError) return res.status(400).json({ error: fieldError });
    // Remplacement complet — bien plus simple qu'un diff champ par champ.
    await prisma.formField.deleteMany({ where: { formId: id } });
    if (fields.length) {
      await prisma.formField.createMany({ data: toFieldRows(fields, id) });
    }
  }

  await prisma.form.update({ where: { id }, data });
  res.json(await prisma.form.findUnique({ where: { id }, include: formInclude }));
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.form.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Formulaire introuvable' });
  await prisma.form.delete({ where: { id } });
  res.status(204).end();
});

export default router;
