// Helpers purs du moteur de workflows — extraits pour être testables.

// Blocs « attente » : le ticket reste parqué dessus tant que la condition n'est
// pas remplie. Tous les autres blocs sont des actions (exécutées puis avance).
export const GATE_TYPES = ['wait_assigned', 'wait_status'];

export function isGate(type) {
  return GATE_TYPES.includes(type);
}

// Un bloc d'attente est-il franchissable pour ce ticket ?
export function isGateSatisfied(node, ticket) {
  switch (node.type) {
    case 'wait_assigned':
      return ticket.assigneeId != null;
    case 'wait_status':
      return ticket.status === node.config?.status;
    default:
      return true; // une action n'est jamais bloquante
  }
}

// Libellé lisible de l'attente en cours (affiché sur le ticket).
export function describeGate(node, statusLabel = (s) => s) {
  switch (node?.type) {
    case 'wait_assigned':
      return 'en attente de prise en charge';
    case 'wait_status':
      return `en attente du statut « ${statusLabel(node.config?.status)} »`;
    default:
      return 'en cours';
  }
}

// Un workflow se déclenche si TOUTES ses conditions (non vides) correspondent.
// ctx porte les infos du déclencheur (newStatus pour status_changed).
export function matchesConditions(conditions = {}, ticket, ctx = {}) {
  if (conditions.categoryId && ticket.categoryId !== Number(conditions.categoryId)) return false;
  if (conditions.formId && ticket.formId !== Number(conditions.formId)) return false;
  if (conditions.priority && ticket.priority !== conditions.priority) return false;
  if (conditions.toStatus && (ctx.newStatus ?? ticket.status) !== conditions.toStatus) return false;
  return true;
}

// Évalue un bloc « condition » sur un ticket → true (branche oui) / false (non).
export function evaluateCondition(cfg = {}, ticket) {
  switch (cfg.field) {
    case 'priority':
      return ticket.priority === cfg.value;
    case 'status':
      return ticket.status === cfg.value;
    case 'category':
      return ticket.categoryId === Number(cfg.value);
    case 'form':
      return ticket.formId === Number(cfg.value);
    case 'assigned':
      return ticket.assigneeId != null;
    default:
      return false;
  }
}

// Variables disponibles dans les notes et emails de workflow : {{ticket.title}}, etc.
export function renderTemplate(template = '', ticket) {
  const values = {
    'ticket.id': ticket.id,
    'ticket.title': ticket.title,
    'ticket.description': ticket.description,
    'ticket.status': ticket.status,
    'ticket.priority': ticket.priority,
    'author.name': ticket.author?.name,
    'author.email': ticket.author?.email,
    'assignee.name': ticket.assignee?.name,
    'assignee.email': ticket.assignee?.email,
    'category.name': ticket.category?.name,
    'team.name': ticket.team?.name,
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) =>
    values[key] === undefined || values[key] === null ? '' : String(values[key])
  );
}
