import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { WORKFLOW_TRIGGERS, STEP_TYPES } from '../services/workflowEngine.js';
import { text } from '../lib/input.js';

const router = Router();

router.use(authRequired, requireRole('admin'));

const workflowInclude = { steps: { orderBy: { position: 'asc' } } };

// Seules ces clés de conditions sont acceptées ; une valeur vide retire la condition.
const CONDITION_KEYS = ['categoryId', 'formId', 'priority', 'toStatus'];

function cleanConditions(raw = {}) {
  const out = {};
  for (const key of CONDITION_KEYS) {
    const v = raw[key];
    if (v !== undefined && v !== null && v !== '') out[key] = v;
  }
  return out;
}

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length > 30) return 'Liste d\'étapes invalide';
  const keys = new Set();
  for (const s of steps) {
    if (!STEP_TYPES.includes(s.type)) return `Type d'étape inconnu : ${s.type}`;
    if (typeof (s.config ?? {}) !== 'object') return 'Configuration d\'étape invalide';
    if (!s.key || typeof s.key !== 'string') return 'Bloc sans identifiant';
    if (keys.has(s.key)) return 'Identifiants de blocs en double';
    keys.add(s.key);
  }
  return null;
}

// N'accepte que les fils entre blocs existants (source `trigger` autorisée).
// Un bloc « condition » a deux sorties { yes, no } ; les autres une seule (clé).
function cleanEdges(raw = {}, steps) {
  const keys = new Set(steps.map((s) => s.key));
  const isCondition = Object.fromEntries(steps.map((s) => [s.key, s.type === 'condition']));
  const out = {};
  for (const [from, val] of Object.entries(raw ?? {})) {
    if (from !== 'trigger' && !keys.has(from)) continue;
    if (from !== 'trigger' && isCondition[from]) {
      const branch = {};
      if (val && typeof val === 'object') {
        if (keys.has(val.yes)) branch.yes = val.yes;
        if (keys.has(val.no)) branch.no = val.no;
      }
      if (branch.yes || branch.no) out[from] = branch;
    } else if (typeof val === 'string' && keys.has(val)) {
      out[from] = val;
    }
  }
  return out;
}

router.get('/', async (req, res) => {
  const workflows = await prisma.workflow.findMany({
    include: workflowInclude,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  res.json(workflows);
});

router.post('/', async (req, res) => {
  const { trigger } = req.body;
  const name = text(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  if (!WORKFLOW_TRIGGERS.includes(trigger)) return res.status(400).json({ error: 'Déclencheur invalide' });

  const last = await prisma.workflow.findFirst({ orderBy: { position: 'desc' } });
  const workflow = await prisma.workflow.create({
    data: { name, trigger, position: (last?.position ?? 0) + 1 },
    include: workflowInclude,
  });
  res.status(201).json(workflow);
});

// Mise à jour complète (builder) : le workflow et toutes ses étapes d'un bloc.
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Workflow introuvable' });

  const { active, trigger, conditions, steps, layout } = req.body;
  const name = text(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  if (!WORKFLOW_TRIGGERS.includes(trigger)) return res.status(400).json({ error: 'Déclencheur invalide' });
  const stepError = validateSteps(steps ?? []);
  if (stepError) return res.status(400).json({ error: stepError });

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const cleanSteps = steps ?? [];

  const [workflow] = await prisma.$transaction([
    prisma.workflow.update({
      where: { id },
      data: {
        name,
        active: active !== false,
        trigger,
        conditions: cleanConditions(conditions),
        layout: layout && typeof layout === 'object' ? layout : {},
        edges: cleanEdges(req.body.edges, cleanSteps),
      },
    }),
    prisma.workflowStep.deleteMany({ where: { workflowId: id } }),
    prisma.workflowStep.createMany({
      data: cleanSteps.map((s, i) => ({
        workflowId: id,
        position: i,
        key: s.key,
        type: s.type,
        config: s.config ?? {},
        x: num(s.x),
        y: num(s.y),
      })),
    }),
  ]);
  res.json(await prisma.workflow.findUnique({ where: { id: workflow.id }, include: workflowInclude }));
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Workflow introuvable' });
  await prisma.workflow.delete({ where: { id } });
  res.status(204).end();
});

export default router;
