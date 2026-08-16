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
