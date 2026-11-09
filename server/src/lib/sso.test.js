import test from 'node:test';
import assert from 'node:assert/strict';
import { identiteEntra, decisionRattachement, REFUS } from './sso.js';

const TID = '11111111-1111-1111-1111-111111111111';
const AUTRE_TID = '22222222-2222-2222-2222-222222222222';

test('identiteEntra exige tid et oid', () => {
  assert.equal(identiteEntra({ email: 'a@b.fr' }), null);
  assert.equal(identiteEntra({ tid: TID, email: 'a@b.fr' }), null);
  assert.equal(identiteEntra({ tid: TID, oid: 42 }), null);
});

test('identiteEntra : membre de l’annuaire', () => {
  const id = identiteEntra({ tid: TID, oid: 'o1', email: ' Léa@Entreprise.FR ' });
  assert.deepEqual(id, { subject: `${TID}:o1`, email: 'léa@entreprise.fr', invite: false });
});

test('identiteEntra : preferred_username à défaut d’email', () => {
  assert.equal(identiteEntra({ tid: TID, oid: 'o1', preferred_username: 'x@y.fr' }).email, 'x@y.fr');
});

test('identiteEntra : invités et comptes personnels détectés par idp', () => {
  assert.equal(identiteEntra({ tid: TID, oid: 'o', idp: `https://sts.windows.net/${AUTRE_TID}/` }).invite, true);
  assert.equal(identiteEntra({ tid: TID, oid: 'o', idp: 'live.com' }).invite, true);
  assert.equal(identiteEntra({ tid: TID, oid: 'o', idp: `https://sts.windows.net/${TID}/` }).invite, false);
});

const membre = { subject: `${TID}:o1`, email: 'admin@entreprise.fr', invite: false };
const invite = { ...membre, subject: `${TID}:o2`, invite: true };

test('un compte déjà rattaché s’ouvre, même si l’email a changé', () => {
  const user = { id: 1, ssoSubject: membre.subject };
  assert.deepEqual(decisionRattachement({ identite: membre, parSujet: user, parEmail: null }), {
    action: 'ouvrir',
    user,
  });
});

test('adresse inconnue : création', () => {
  assert.equal(decisionRattachement({ identite: invite, parSujet: null, parEmail: null }).action, 'creer');
});

test('un membre se rattache au compte local de même adresse', () => {
  const local = { id: 1, ssoSubject: null, passwordHash: 'x', role: 'admin' };
  assert.deepEqual(decisionRattachement({ identite: membre, parSujet: null, parEmail: local }), {
    action: 'rattacher',
    user: local,
  });
});

test('un invité ne prend jamais un compte existant par son adresse', () => {
  const admin = { id: 1, ssoSubject: null, role: 'admin' };
  const d = decisionRattachement({ identite: invite, parSujet: null, parEmail: admin });
  assert.deepEqual(d, { action: 'refuser', raison: REFUS.invite });
});

test('une adresse déjà liée à une autre identité est refusée', () => {
  const lie = { id: 1, ssoSubject: `${TID}:quelquun-d-autre` };
  const d = decisionRattachement({ identite: membre, parSujet: null, parEmail: lie });
  assert.deepEqual(d, { action: 'refuser', raison: REFUS.dejaLie });
});
