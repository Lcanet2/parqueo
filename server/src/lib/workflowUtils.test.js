import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesConditions,
  renderTemplate,
  isGate,
  isGateSatisfied,
  describeGate,
  evaluateCondition,
} from './workflowUtils.js';

const ticket = {
  id: 12,
  title: 'PC en panne',
  status: 'new',
  priority: 'high',
  categoryId: 3,
  formId: 5,
  author: { name: 'Marie', email: 'marie@x.fr' },
  assignee: null,
  category: { name: 'Matériel' },
};

test('sans condition, tout ticket correspond', () => {
  assert.equal(matchesConditions({}, ticket), true);
  assert.equal(matchesConditions(undefined, ticket), true);
});

test('les conditions se cumulent (ET)', () => {
  assert.equal(matchesConditions({ categoryId: 3, priority: 'high' }, ticket), true);
  assert.equal(matchesConditions({ categoryId: 3, priority: 'low' }, ticket), false);
  assert.equal(matchesConditions({ categoryId: 4 }, ticket), false);
});

test('ciblage par formulaire', () => {
  assert.equal(matchesConditions({ formId: 5 }, ticket), true);
  assert.equal(matchesConditions({ formId: 6 }, ticket), false);
  assert.equal(matchesConditions({ formId: 5 }, { ...ticket, formId: null }), false);
});

test('toStatus compare au nouveau statut du contexte', () => {
  assert.equal(matchesConditions({ toStatus: 'resolved' }, ticket, { newStatus: 'resolved' }), true);
  assert.equal(matchesConditions({ toStatus: 'resolved' }, ticket, { newStatus: 'closed' }), false);
});

test('renderTemplate remplace les variables', () => {
  assert.equal(
    renderTemplate('Ticket #{{ticket.id}} « {{ticket.title}} » de {{author.name}}', ticket),
    'Ticket #12 « PC en panne » de Marie'
  );
});

test('renderTemplate vide les variables inconnues ou absentes', () => {
  assert.equal(renderTemplate('[{{assignee.name}}][{{foo.bar}}]', ticket), '[][]');
});

test('isGate distingue attentes et actions', () => {
  assert.equal(isGate('wait_assigned'), true);
  assert.equal(isGate('wait_status'), true);
  assert.equal(isGate('assign_team'), false);
  assert.equal(isGate('send_email'), false);
});

test('wait_assigned : franchi seulement si le ticket a un assigné', () => {
  const node = { type: 'wait_assigned' };
  assert.equal(isGateSatisfied(node, { ...ticket, assigneeId: null }), false);
  assert.equal(isGateSatisfied(node, { ...ticket, assigneeId: 7 }), true);
});

test('wait_status : franchi seulement au statut cible', () => {
  const node = { type: 'wait_status', config: { status: 'resolved' } };
  assert.equal(isGateSatisfied(node, { ...ticket, status: 'in_progress' }), false);
  assert.equal(isGateSatisfied(node, { ...ticket, status: 'resolved' }), true);
});

test('une action n\'est jamais bloquante', () => {
  assert.equal(isGateSatisfied({ type: 'assign_team' }, ticket), true);
});

test('evaluateCondition teste le bon champ', () => {
  assert.equal(evaluateCondition({ field: 'priority', value: 'high' }, ticket), true);
  assert.equal(evaluateCondition({ field: 'priority', value: 'low' }, ticket), false);
  assert.equal(evaluateCondition({ field: 'category', value: '3' }, ticket), true);
  assert.equal(evaluateCondition({ field: 'category', value: 3 }, ticket), true);
  assert.equal(evaluateCondition({ field: 'status', value: 'new' }, ticket), true);
});

test('evaluateCondition « assigné » teste la présence d\'un assigné', () => {
  assert.equal(evaluateCondition({ field: 'assigned' }, { ...ticket, assigneeId: null }), false);
  assert.equal(evaluateCondition({ field: 'assigned' }, { ...ticket, assigneeId: 7 }), true);
});

test('evaluateCondition sans champ connu renvoie false', () => {
  assert.equal(evaluateCondition({}, ticket), false);
  assert.equal(evaluateCondition({ field: 'inconnu' }, ticket), false);
});

test('describeGate produit un libellé lisible', () => {
  assert.equal(describeGate({ type: 'wait_assigned' }), 'en attente de prise en charge');
  assert.equal(
    describeGate({ type: 'wait_status', config: { status: 'resolved' } }, (s) => s.toUpperCase()),
    'en attente du statut « RESOLVED »'
  );
});
