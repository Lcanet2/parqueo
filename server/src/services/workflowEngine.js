import { prisma } from '../lib/prisma.js';
import {
  matchesConditions,
  renderTemplate,
  isGate,
  isGateSatisfied,
  evaluateCondition,
} from '../lib/workflowUtils.js';
import { sendMail } from './mailer.js';
import { statutApresAssignation } from '../lib/statut.js';

// Moteur de workflows : parcours de graphe à états. Un ticket qui correspond à
// un workflow « ticket créé » entre au bloc du déclencheur et suit les fils
// (edges). Une action s'exécute et passe au suivant ; un bloc « condition »
// suit sa branche oui/non ; un bloc « attente » parque le ticket tant que sa
// condition n'est pas remplie — les changements ultérieurs (assignation,
// statut) relancent le parcours depuis ce bloc. Les workflows « statut changé »
// sont réactifs : mêmes règles mais sans parking. Une action en échec est
// loggée et sautée. Les modifications faites par une étape ne re-déclenchent
// jamais d'autre workflow (anti-boucle par construction).

export const WORKFLOW_TRIGGERS = ['ticket_created', 'status_changed'];
export const ACTION_TYPES = [
  'assign_team',
  'assign_user',
  'set_priority',
  'set_status',
  'add_note',
  'send_email',
  'webhook',
];
export const STEP_TYPES = [...ACTION_TYPES, 'wait_assigned', 'wait_status', 'condition'];

const STATUSES = ['new', 'in_progress', 'waiting', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high'];

const ticketInclude = {
  category: true,
  author: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  team: true,
  asset: { select: { id: true, name: true, type: true } },
};

const withGraph = { steps: true };

// --- Points d'entrée appelés par les routes ---

export async function onTicketCreated(ticket) {
  const workflows = await prisma.workflow.findMany({
    where: { trigger: 'ticket_created', active: true },
    include: withGraph,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });

  let current = ticket;
  for (const wf of workflows) {
    if (!matchesConditions(wf.conditions, current)) continue;
    current = await startRun(wf, current);
  }
  return current;
}

export async function onTicketUpdated(ticket, ctx = {}) {
  let current = ticket;

  if (ctx.statusChanged) {
    const workflows = await prisma.workflow.findMany({
      where: { trigger: 'status_changed', active: true },
      include: withGraph,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    for (const wf of workflows) {
      if (matchesConditions(wf.conditions, current, ctx)) current = await traverse(wf, wf.edges?.trigger, current, null);
    }
  }

  return resumeRuns(current);
}

// --- Machine à états sur le graphe ---

async function startRun(wf, ticket) {
  const existing = await prisma.workflowRun.findUnique({
    where: { ticketId_workflowId: { ticketId: ticket.id, workflowId: wf.id } },
  });
  if (existing) return ticket; // déjà entré dans ce workflow

  const run = await prisma.workflowRun.create({ data: { ticketId: ticket.id, workflowId: wf.id } });
  return traverse(wf, wf.edges?.trigger, ticket, run);
}

async function resumeRuns(ticket) {
  const runs = await prisma.workflowRun.findMany({
    where: { ticketId: ticket.id, status: 'running' },
    include: { workflow: { include: withGraph } },
  });
  let current = ticket;
  for (const run of runs) {
    // On repart du bloc d'attente où le ticket est parqué (revérifié au passage).
    current = await traverse(run.workflow, run.nodeKey ?? run.workflow.edges?.trigger, current, run);
  }
  return current;
}

// Parcourt le graphe depuis startKey. Si run est fourni, un bloc d'attente non
// satisfait parque le ticket (nodeKey mémorisé) ; sinon (réactif) on s'arrête.
async function traverse(wf, startKey, ticket, run) {
  const edges = wf.edges ?? {};
  const byKey = Object.fromEntries(wf.steps.map((s) => [s.key, s]));
  const visited = new Set();
  let key = startKey;
  let current = ticket;

  while (key && byKey[key] && !visited.has(key)) {
    visited.add(key);
    const node = byKey[key];

    if (isGate(node.type)) {
      if (isGateSatisfied(node, current)) {
        key = nextKey(edges, key);
        continue;
      }
      if (run) {
        await prisma.workflowRun.update({ where: { id: run.id }, data: { nodeKey: key, status: 'running' } });
      }
      return current; // parqué (run) ou stoppé (réactif)
    }

    if (node.type === 'condition') {
      const yes = evaluateCondition(node.config, current);
      const branch = edges[key];
      key = branch && typeof branch === 'object' ? branch[yes ? 'yes' : 'no'] : undefined;
      continue;
    }

    try {
      current = (await applyAction(node, current, wf)) ?? current;
    } catch (err) {
      console.error(`[workflow « ${wf.name} »] action ${node.type} en échec :`, err.message);
    }
    key = nextKey(edges, key);
  }

  if (run) await prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'done', nodeKey: null } });
  return current;
}

// Fil sortant simple d'un bloc (les conditions sont gérées à part).
function nextKey(edges, key) {
  const v = edges[key];
  return typeof v === 'string' ? v : undefined;
}

// --- Exécution d'une action (mise à jour du ticket + événement tracé) ---

function updateWithEvent(ticket, data, eventBody) {
  return prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      ...data,
      comments: { create: { type: 'event', body: eventBody, authorId: ticket.authorId } },
    },
    include: ticketInclude,
  });
}

async function applyAction(step, ticket, wf) {
  const cfg = step.config ?? {};
  const label = `workflow « ${wf.name} »`;

  switch (step.type) {
    case 'assign_team': {
      const team = await prisma.team.findUnique({ where: { id: Number(cfg.teamId) || 0 } });
      if (!team || ticket.teamId === team.id) return ticket;
      return updateWithEvent(ticket, { teamId: team.id }, `Affecté à l'équipe ${team.name} (${label})`);
    }
    case 'assign_user': {
      const user = await prisma.user.findUnique({ where: { id: Number(cfg.userId) || 0 } });
      if (!user || user.role === 'user' || ticket.assigneeId === user.id) return ticket;
      // Même invariant que l'assignation manuelle : un ticket assigné n'est
      // plus « Nouveau ». Sinon le statut dépendrait de qui a assigné.
      const auto = statutApresAssignation(ticket.status, user.id);
      return updateWithEvent(
        ticket,
        { assigneeId: user.id, ...(auto ? { status: auto } : {}) },
        `Assigné à ${user.name} (${label})`
      );
    }
    case 'set_priority': {
      if (!PRIORITIES.includes(cfg.priority) || ticket.priority === cfg.priority) return ticket;
      return updateWithEvent(
        ticket,
        { priority: cfg.priority },
        `Priorité changée : ${ticket.priority} → ${cfg.priority} (${label})`
      );
    }
    case 'set_status': {
      if (!STATUSES.includes(cfg.status) || ticket.status === cfg.status) return ticket;
      return updateWithEvent(
        ticket,
        { status: cfg.status },
        `Statut changé : ${ticket.status} → ${cfg.status} (${label})`
      );
    }
    case 'add_note': {
      if (!cfg.body?.trim()) return ticket;
      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: ticket.authorId,
          type: 'event',
          body: renderTemplate(cfg.body, ticket),
        },
      });
      return ticket;
    }
    case 'send_email': {
      const to =
        cfg.to === 'author'
          ? ticket.author?.email
          : cfg.to === 'assignee'
            ? ticket.assignee?.email
            : cfg.to === 'custom'
              ? cfg.email
              : null;
      if (!to) return ticket;
      await sendMail(
        to,
        renderTemplate(cfg.subject ?? '', ticket) || `[Parqueo] Ticket #${ticket.id}`,
        renderTemplate(cfg.body ?? '', ticket)
      );
      return ticket;
    }
    // Passerelle vers n8n, Zapier ou tout autre outil : POST JSON du ticket.
    case 'webhook': {
      if (!/^https?:\/\//.test(cfg.url ?? '')) return ticket;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(cfg.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.secret ? { 'X-Parqueo-Token': cfg.secret } : {}),
          },
          body: JSON.stringify({ event: wf.trigger, workflow: wf.name, ticket }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      return ticket;
    }
    default:
      return ticket;
  }
}
