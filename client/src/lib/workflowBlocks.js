// Catalogue de blocs et déclencheurs partagé entre la liste et le canvas.
import { TICKET_STATUS, TICKET_PRIORITY } from './labels.js';

export const TRIGGERS = {
  ticket_created: { label: 'Un ticket est créé', short: 'Ticket créé' },
  status_changed: { label: 'Le statut change', short: 'Statut changé' },
};

// type → libellé, icône, couleur. `gate` = bloc d'attente (le ticket s'y parque).
export const STEP_CATALOG = {
  assign_team: { label: 'Affecter à une équipe', icon: '👥', accent: 'var(--color-status-waiting)' },
  assign_user: { label: 'Assigner à une personne', icon: '🙋', accent: 'var(--color-accent)' },
  set_priority: { label: 'Changer la priorité', icon: '⚑', accent: 'var(--color-status-progress)' },
  set_status: { label: 'Changer le statut', icon: '🔄', accent: 'var(--color-status-new)' },
  add_note: { label: 'Ajouter une note', icon: '📝', accent: 'var(--color-ink-soft)' },
  send_email: { label: 'Envoyer un email', icon: '✉️', accent: 'var(--color-status-resolved)' },
  webhook: { label: 'Webhook (n8n, Zapier…)', icon: '🔗', accent: 'var(--color-status-closed)' },
  condition: { label: 'Condition (oui / non)', icon: '❓', accent: 'var(--color-status-new)', branch: true },
  wait_assigned: { label: 'Attendre la prise en charge', icon: '⏳', accent: 'var(--color-status-progress)', gate: true },
  wait_status: { label: 'Attendre un statut', icon: '⏳', accent: 'var(--color-status-progress)', gate: true },
};

// Blocs proposés selon le déclencheur : les attentes seulement à la création.
export function catalogFor(trigger) {
  return Object.entries(STEP_CATALOG).filter(([, spec]) => !spec.gate || trigger === 'ticket_created');
}

export const defaultStepConfig = {
  assign_team: { teamId: '' },
  assign_user: { userId: '' },
  set_priority: { priority: 'high' },
  set_status: { status: 'in_progress' },
  add_note: { body: '' },
  send_email: { to: 'author', email: '', subject: '', body: '' },
  webhook: { url: '', secret: '' },
  condition: { field: 'priority', value: 'high' },
  wait_assigned: {},
  wait_status: { status: 'resolved' },
};

// Champs testables par un bloc « condition ».
export const CONDITION_FIELDS = [
  { value: 'priority', label: 'La priorité est' },
  { value: 'status', label: 'Le statut est' },
  { value: 'category', label: 'La catégorie est' },
  { value: 'form', label: 'Le formulaire est' },
  { value: 'assigned', label: 'Le ticket est déjà pris en charge' },
];

// Résumé lisible des conditions pour la liste.
export function conditionsSummary(conditions = {}, refs) {
  const parts = [];
  if (conditions.categoryId) {
    parts.push(refs.categories.find((c) => c.id === Number(conditions.categoryId))?.name ?? 'catégorie');
  }
  if (conditions.formId) {
    parts.push(`formulaire « ${refs.forms.find((f) => f.id === Number(conditions.formId))?.name ?? '?'} »`);
  }
  if (conditions.priority) parts.push(`priorité ${TICKET_PRIORITY[conditions.priority]?.label.toLowerCase()}`);
  if (conditions.toStatus) parts.push(`→ ${TICKET_STATUS[conditions.toStatus]?.label.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'tous les tickets';
}
