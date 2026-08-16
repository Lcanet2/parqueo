import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { demoActif } from './demo.js';

describe('mode démonstration', () => {
  test('inactif par défaut', () => {
    delete process.env.DEMO_MODE;
    assert.equal(demoActif(), false);
  });

  test('actif uniquement sur la chaîne « true »', () => {
    process.env.DEMO_MODE = 'true';
    assert.equal(demoActif(), true);
    // Une variable d'environnement vaut toujours une chaîne : « false », « 0 »
    // ou « oui » ne doivent pas activer un mode qui bride l'application.
    for (const valeur of ['false', '0', '', 'oui', 'TRUE']) {
      process.env.DEMO_MODE = valeur;
      assert.equal(demoActif(), false, `DEMO_MODE=${valeur} ne doit pas activer le mode`);
    }
    delete process.env.DEMO_MODE;
  });
});
