import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { verifierEnv } from './env.js';

const bon = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/parqueo?schema=public',
  JWT_SECRET: 'un-secret-suffisamment-long',
};

describe('contrôle des variables au démarrage', () => {
  test('configuration complète : aucune erreur', () => {
    assert.deepEqual(verifierEnv(bon), []);
  });

  test('DATABASE_URL manquant', () => {
    const erreurs = verifierEnv({ ...bon, DATABASE_URL: undefined });
    assert.equal(erreurs.length, 1);
    assert.match(erreurs[0], /DATABASE_URL/);
  });

  test('JWT_SECRET manquant : le message dit comment en générer un', () => {
    const erreurs = verifierEnv({ ...bon, JWT_SECRET: undefined });
    assert.equal(erreurs.length, 1);
    assert.match(erreurs[0], /openssl rand/);
  });

  test('JWT_SECRET trop court : refusé, un secret devinable vaut pas de secret', () => {
    const erreurs = verifierEnv({ ...bon, JWT_SECRET: 'court' });
    assert.equal(erreurs.length, 1);
    assert.match(erreurs[0], /trop court/);
  });

  test('les manques se cumulent au lieu de sortir un par un', () => {
    assert.equal(verifierEnv({}).length, 2);
  });
});

import { optionsSmtp } from '../services/mailer.js';

test('optionsSmtp : TLS implicite sur 465, STARTTLS ailleurs, forçable', () => {
  assert.equal(optionsSmtp({ SMTP_HOST: 'smtp.x', SMTP_PORT: '465' }).secure, true);
  assert.equal(optionsSmtp({ SMTP_HOST: 'smtp.x', SMTP_PORT: '587' }).secure, false);
  assert.equal(optionsSmtp({ SMTP_HOST: 'smtp.x' }).port, 587);
  assert.equal(optionsSmtp({ SMTP_HOST: 'smtp.x', SMTP_PORT: '2465', SMTP_SECURE: 'true' }).secure, true);
  assert.equal(optionsSmtp({ SMTP_HOST: 'smtp.x', SMTP_PORT: '465', SMTP_SECURE: 'false' }).secure, false);
});

test('optionsSmtp : délais courts, un SMTP muet ne fige pas la création de ticket', () => {
  const o = optionsSmtp({ SMTP_HOST: 'smtp.x' });
  for (const cle of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
    assert.ok(o[cle] > 0 && o[cle] <= 30_000, `${cle} = ${o[cle]}`);
  }
  assert.equal(o.auth, undefined);
  assert.deepEqual(optionsSmtp({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }).auth, { user: 'u', pass: 'p' });
});
