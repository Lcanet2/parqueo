import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Changement de mot de passe en libre-service : chaque compte doit pouvoir
// changer le sien sans passer par un administrateur.

let api;
let ctx;
let t;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = { user: await login(api, ctx.user.email), admin: await login(api, ctx.admin.email) };
});

after(async () => {
  await api.close();
  await disconnect();
});

const changer = (token, body) => api.patch('/api/auth/password', { token, body });

describe('changement de mot de passe', () => {
  test('sans authentification : 401', async () => {
    const res = await changer(null, { currentPassword: 'x', newPassword: 'motdepasse2' });
    assert.equal(res.status, 401);
  });

  test('mot de passe actuel incorrect : 400 et aucun changement', async () => {
    const res = await changer(t.user, { currentPassword: 'faux', newPassword: 'motdepasse2' });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /actuel incorrect/i);
    // L'ancien fonctionne toujours.
    assert.ok(await login(api, ctx.user.email, ctx.password));
  });

  test('nouveau mot de passe trop court : 400', async () => {
    const res = await changer(t.user, { currentPassword: ctx.password, newPassword: 'court' });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /8 caractères/);
  });

  test('nouveau mot de passe identique à l’ancien : 400', async () => {
    const res = await changer(t.user, { currentPassword: ctx.password, newPassword: ctx.password });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /différent/i);
  });

  test('champs manquants ou de mauvais type : 400 sans crash', async () => {
    for (const body of [{}, { currentPassword: 1, newPassword: 2 }, { newPassword: ['a'] }, null]) {
      const res = await changer(t.user, body ?? {});
      assert.equal(res.status, 400);
    }
    assert.equal((await api.get('/api/health')).status, 200);
  });

  test('changement réussi : l’ancien mot de passe ne marche plus, le nouveau oui', async () => {
    const nouveau = 'nouveau-mot-de-passe-2026';
    const res = await changer(t.user, { currentPassword: ctx.password, newPassword: nouveau });
    assert.equal(res.status, 200);

    const ancien = await api.post('/api/auth/login', {
      body: { email: ctx.user.email, password: ctx.password },
    });
    assert.equal(ancien.status, 401);

    const ok = await api.post('/api/auth/login', {
      body: { email: ctx.user.email, password: nouveau },
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.token);
  });

  test('le hachage est bien renouvelé en base', async () => {
    const avant = (await prisma.user.findUnique({ where: { id: ctx.admin.id } })).passwordHash;
    const res = await changer(t.admin, { currentPassword: ctx.password, newPassword: 'admin-2026-secure' });
    assert.equal(res.status, 200);
    const apres = (await prisma.user.findUnique({ where: { id: ctx.admin.id } })).passwordHash;
    assert.notEqual(avant, apres);
    assert.match(apres, /^\$2[aby]\$/, 'doit rester un hachage bcrypt');
  });

  test('un compte SSO est orienté vers Microsoft', async () => {
    const sso = await prisma.user.create({
      data: { email: 'sso@test.local', name: 'Compte SSO', role: 'user', provider: 'entra', passwordHash: null },
    });
    // Jeton émis comme le ferait le retour SSO.
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign({ sub: sso.id, role: 'user', teamId: null }, process.env.JWT_SECRET);

    const res = await changer(token, { currentPassword: 'peu-importe', newPassword: 'motdepasse2' });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /Microsoft/);
  });

  test('le mot de passe n’est jamais renvoyé par /auth/me', async () => {
    const res = await api.get('/api/auth/me', { token: t.admin });
    assert.equal(res.status, 200);
    assert.equal(res.data.passwordHash, undefined);
    assert.equal(res.data.email, ctx.admin.email);
  });
});
