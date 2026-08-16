import './setup.js';
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, disconnect, prisma } from './helpers.js';

// Premier démarrage : l'administrateur se crée depuis l'interface. La porte
// doit se refermer définitivement dès qu'un compte existe — sans quoi
// n'importe qui pourrait se déclarer admin sur une base en service.

let api;

before(async () => {
  api = await startServer();
});

after(async () => {
  await api.close();
  await disconnect();
});

beforeEach(async () => {
  await resetDb();
});

const valide = { name: 'Léa Martin', email: 'Lea.Martin@Entreprise.fr', password: 'motdepasse1' };

describe('installation initiale', () => {
  test('base vierge : l’installation est requise', async () => {
    const res = await api.get('/api/setup/status');
    assert.equal(res.status, 200);
    assert.equal(res.data.needsSetup, true);
  });

  test('crée le premier administrateur et renvoie un jeton utilisable', async () => {
    const res = await api.post('/api/setup', { body: valide });
    assert.equal(res.status, 201);
    assert.equal(res.data.user.role, 'admin');
    assert.equal(res.data.user.email, 'lea.martin@entreprise.fr', 'email normalisé en minuscules');
    assert.equal(res.data.user.passwordHash, undefined, 'le hachage ne sort jamais de l’API');

    // Le jeton renvoyé ouvre bien une session d'administrateur.
    const moi = await api.get('/api/auth/me', { token: res.data.token });
    assert.equal(moi.status, 200);
    assert.equal(moi.data.role, 'admin');
  });

  test('pose une catégorie et une équipe, sans quoi aucun ticket n’est ouvrable', async () => {
    await api.post('/api/setup', { body: valide });
    assert.ok((await prisma.category.count()) > 0);
    assert.ok((await prisma.team.count()) > 0);
  });

  test('le mot de passe choisi permet de se connecter', async () => {
    await api.post('/api/setup', { body: valide });
    const res = await api.post('/api/auth/login', {
      body: { email: 'lea.martin@entreprise.fr', password: 'motdepasse1' },
    });
    assert.equal(res.status, 200);
  });

  test('une fois installé : status passe à false et l’appel est refusé', async () => {
    await api.post('/api/setup', { body: valide });

    const status = await api.get('/api/setup/status');
    assert.equal(status.data.needsSetup, false);

    const rejoue = await api.post('/api/setup', {
      body: { name: 'Intrus', email: 'intrus@ailleurs.fr', password: 'motdepasse1' },
    });
    assert.equal(rejoue.status, 409);
    assert.equal(await prisma.user.count(), 1, 'aucun compte supplémentaire créé');
  });

  test('base déjà peuplée sans passer par l’installation : refusée', async () => {
    await seedBasics();
    const status = await api.get('/api/setup/status');
    assert.equal(status.data.needsSetup, false);

    const res = await api.post('/api/setup', {
      body: { name: 'Intrus', email: 'intrus@ailleurs.fr', password: 'motdepasse1' },
    });
    assert.equal(res.status, 409);
  });

  test('deux installations simultanées : une seule aboutit', async () => {
    const [a, b] = await Promise.all([
      api.post('/api/setup', { body: { ...valide, email: 'a@entreprise.fr' } }),
      api.post('/api/setup', { body: { ...valide, email: 'b@entreprise.fr' } }),
    ]);
    const codes = [a.status, b.status].sort();
    assert.deepEqual(codes, [201, 409]);
    assert.equal(await prisma.user.count(), 1);
  });

  describe('champs refusés', () => {
    const cas = [
      ['nom manquant', { ...valide, name: '   ' }],
      ['email manquant', { ...valide, email: '' }],
      ['mot de passe trop court', { ...valide, password: 'court' }],
      ['mot de passe non textuel', { ...valide, password: 12345678 }],
    ];
    for (const [nom, body] of cas) {
      test(nom, async () => {
        const res = await api.post('/api/setup', { body });
        assert.equal(res.status, 400);
        assert.equal(await prisma.user.count(), 0);
      });
    }
  });
});
