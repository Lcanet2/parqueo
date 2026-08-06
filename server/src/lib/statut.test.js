import test from 'node:test';
import assert from 'node:assert/strict';
import { statutApresAssignation } from './statut.js';

test('assigner un ticket « Nouveau » le fait passer « En cours »', () => {
  assert.equal(statutApresAssignation('new', 7), 'in_progress');
});

test('les autres statuts ne bougent pas', () => {
  // Assigner un ticket résolu ou fermé ne le rouvre pas ; « En attente »
  // renseigne sur un blocage, pas sur la prise en charge.
  for (const statut of ['in_progress', 'waiting', 'resolved', 'closed']) {
    assert.equal(statutApresAssignation(statut, 7), null, statut);
  }
});

test('retirer l’assignation ne change pas le statut', () => {
  assert.equal(statutApresAssignation('new', null), null);
  assert.equal(statutApresAssignation('in_progress', null), null);
});
