import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibilityWhere } from './visibility.js';

test('admin voit tout', () => {
  assert.deepEqual(visibilityWhere({ sub: 1, role: 'admin', teamId: 3 }), {});
});

test('utilisateur ne voit que ses propres tickets', () => {
  assert.deepEqual(visibilityWhere({ sub: 42, role: 'user', teamId: null }), { authorId: 42 });
});

test('utilisateur avec équipe ne voit pas les tickets de son équipe', () => {
  // Le teamId d'un simple utilisateur ne doit jamais élargir sa visibilité.
  assert.deepEqual(visibilityWhere({ sub: 42, role: 'user', teamId: 3 }), { authorId: 42 });
});

test('technicien sans équipe : ses tickets assignés + les non assignés', () => {
  assert.deepEqual(visibilityWhere({ sub: 7, role: 'technician', teamId: null }), {
    OR: [{ assigneeId: 7 }, { assigneeId: null }],
  });
});

test('technicien avec équipe : assignés + non assignés + équipe', () => {
  assert.deepEqual(visibilityWhere({ sub: 7, role: 'technician', teamId: 3 }), {
    OR: [{ assigneeId: 7 }, { assigneeId: null }, { teamId: 3 }],
  });
});

test('rôle inconnu retombe sur la visibilité la plus restrictive', () => {
  assert.deepEqual(visibilityWhere({ sub: 9, role: 'superviseur', teamId: 1 }), { authorId: 9 });
});
