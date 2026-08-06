import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, resetDb, seedBasics, login, disconnect } from './helpers.js';

// Une requête malformée ne doit jamais tuer le processus ni rester sans réponse.
// Avant l'ajout du middleware d'erreur, chacun de ces cas provoquait un rejet
// non géré : sous Node 20+ le serveur mourait (et cette suite planterait).

let api;
let ctx;
let tokens;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  tokens = {
    admin: await login(api, ctx.admin.email),
    tech: await login(api, ctx.tech.email),
    user: await login(api, ctx.user.email),
  };
});

after(async () => {
  await api.close();
  await disconnect();
});

const vivant = async () => (await api.get('/api/health')).status === 200;

describe('corps de requête malformé', () => {
  test('login avec un email non-string répond 400 sans tuer le serveur', async () => {
    const res = await api.post('/api/auth/login', { body: { email: ['a'], password: 'x' } });
    assert.equal(res.status, 400);
    assert.ok(await vivant(), 'le serveur doit être encore debout');
  });

  test('login avec un email objet répond 400', async () => {
    const res = await api.post('/api/auth/login', { body: { email: { $ne: null }, password: 'x' } });
    assert.equal(res.status, 400);
    assert.ok(await vivant());
  });

  test('JSON illisible répond 400', async () => {
    const res = await api.post('/api/auth/login', {
      raw: '{"email":',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'JSON invalide');
    assert.ok(await vivant());
  });

  test('création de ticket avec un titre numérique répond 400', async () => {
    const res = await api.post('/api/tickets', {
      token: tokens.user,
      body: { title: 123, description: 'x', categoryId: ctx.category.id },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /requis/i);
    assert.ok(await vivant());
  });

  test('commentaire avec un corps tableau répond 400', async () => {
    const t = await api.post('/api/tickets', {
      token: tokens.user,
      body: { title: 'Test', description: 'x', categoryId: ctx.category.id },
    });
    const res = await api.post(`/api/tickets/${t.data.id}/comments`, {
      token: tokens.user,
      body: { body: ['coucou'] },
    });
    assert.equal(res.status, 400);
    assert.ok(await vivant());
  });

  test('catégorie avec un nom objet répond 400', async () => {
    const res = await api.post('/api/categories', { token: tokens.admin, body: { name: { a: 1 } } });
    assert.equal(res.status, 400);
    assert.ok(await vivant());
  });
});

describe('identifiants d’URL invalides', () => {
  for (const chemin of [
    '/api/tickets/abc',
    '/api/tickets/1e999',
    '/api/tickets/-1',
    '/api/tickets/0',
    '/api/assets/abc',
    '/api/forms/abc',
    '/api/kb/abc',
    '/api/software/abc',
  ]) {
    test(`GET ${chemin} répond 404 sans tuer le serveur`, async () => {
      const res = await api.get(chemin, { token: tokens.admin });
      assert.equal(res.status, 404);
      assert.ok(await vivant());
    });
  }

  test('pièce jointe avec un identifiant non numérique répond 404', async () => {
    const res = await api.get('/api/tickets/1/attachments/xyz', { token: tokens.admin });
    assert.equal(res.status, 404);
    assert.ok(await vivant());
  });
});

describe('contraintes de base de données', () => {
  test('ticket rattaché à une catégorie inexistante répond 400', async () => {
    const res = await api.post('/api/tickets', {
      token: tokens.user,
      body: { title: 'Test', description: 'x', categoryId: 999999 },
    });
    assert.equal(res.status, 400);
    assert.ok(await vivant());
  });

  test('ticket rattaché à un actif inexistant répond 400', async () => {
    const res = await api.post('/api/tickets', {
      token: tokens.user,
      body: { title: 'Test', description: 'x', categoryId: ctx.category.id, assetId: 999999 },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'Référence inconnue');
    assert.ok(await vivant());
  });

  test('changement de catégorie vers une catégorie inexistante répond 400', async () => {
    const t = await api.post('/api/tickets', {
      token: tokens.user,
      body: { title: 'Test', description: 'x', categoryId: ctx.category.id },
    });
    const res = await api.patch(`/api/tickets/${t.data.id}`, {
      token: tokens.admin,
      body: { categoryId: 999999 },
    });
    assert.equal(res.status, 400);
    assert.ok(await vivant());
  });

  test('email en doublon répond 409', async () => {
    const res = await api.post('/api/users', {
      token: tokens.admin,
      body: { email: ctx.tech.email, password: 'motdepasse1', name: 'Doublon' },
    });
    assert.equal(res.status, 409);
    assert.ok(await vivant());
  });
});

describe('routes inconnues', () => {
  test('une route /api inexistante répond 404 en JSON', async () => {
    const res = await api.get('/api/nexiste-pas', { token: tokens.admin });
    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'Route inconnue');
  });
});

describe('jetons rejetés (déclencheurs du 401 côté client)', () => {
  test('sans jeton : 401', async () => {
    assert.equal((await api.get('/api/tickets')).status, 401);
  });

  test('jeton illisible : 401', async () => {
    assert.equal((await api.get('/api/tickets', { token: 'pas-un-jwt' })).status, 401);
  });

  test('jeton expiré : 401', async () => {
    const expiré = jwt.sign({ sub: ctx.admin.id, role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: '-1h',
    });
    const res = await api.get('/api/tickets', { token: expiré });
    assert.equal(res.status, 401);
    assert.match(res.data.error, /expiré/i);
  });

  test('jeton signé avec un autre secret : 401', async () => {
    const forgé = jwt.sign({ sub: ctx.admin.id, role: 'admin' }, 'un-autre-secret');
    assert.equal((await api.get('/api/tickets', { token: forgé })).status, 401);
  });
});

describe('normalisation du login', () => {
  test('l’email est insensible à la casse et aux espaces', async () => {
    const res = await api.post('/api/auth/login', {
      body: { email: '  ADMIN@Test.Local ', password: ctx.password },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.email, 'admin@test.local');
  });
});
