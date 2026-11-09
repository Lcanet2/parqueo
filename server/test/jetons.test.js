import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';
import { trustProxy } from '../src/app.js';

// Jetons : seul un jeton de session ouvre l'API, et il tombe dès que le compte
// change (suppression, rôle, mot de passe). Voir src/lib/session.js.

let api, ctx, t, ticket;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = {
    admin: await login(api, ctx.admin.email),
    user: await login(api, ctx.user.email),
  };
  ticket = (
    await api.post('/api/tickets', {
      token: t.user,
      body: { title: 'Écran noir', description: 'Plus rien', categoryId: ctx.category.id },
    })
  ).data;
});
after(async () => { await api.close(); await disconnect(); });

// Routes qu'un jeton détourné visait : tickets (tous, par filtre ignoré),
// inventaire et base de connaissances (contrôle « role !== 'user' »).
const ROUTES_SENSIBLES = ['/api/tickets', '/api/tickets/stats', '/api/assets', '/api/kb', '/api/auth/me'];

async function refuseePartout(token) {
  for (const route of ROUTES_SENSIBLES) {
    const res = await api.get(route, { token });
    assert.equal(res.status, 401, `${route} devrait refuser ce jeton`);
  }
}

describe('jetons qui ne sont pas des sessions', () => {
  test('le state du SSO (public, sans sub) n’ouvre rien', async () => {
    // Forme exacte de celui émis par GET /api/auth/sso/login.
    const state = jwt.sign(
      { nonce: crypto.randomBytes(16).toString('hex'), purpose: 'sso' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    await refuseePartout(state);
  });

  test('le lien de satisfaction d’un email n’ouvre rien', async () => {
    const lien = jwt.sign({ sub: ticket.id, purpose: 'satisfaction' }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });
    await refuseePartout(lien);
  });

  test('un jeton d’avant la 0.3.8 (sans type) est refusé', async () => {
    const ancien = jwt.sign(
      { sub: ctx.admin.id, role: 'admin', teamId: null },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    await refuseePartout(ancien);
  });

  test('un sub non entier est refusé', async () => {
    for (const sub of ['1', null, 1.5, 0, -3]) {
      const forge = jwt.sign({ typ: 'session', sub, ver: 0 }, process.env.JWT_SECRET);
      assert.equal((await api.get('/api/tickets', { token: forge })).status, 401, `sub=${sub}`);
    }
  });

  test('le lien de satisfaction fonctionne toujours pour voter', async () => {
    const lien = jwt.sign({ sub: ticket.id, purpose: 'satisfaction' }, process.env.JWT_SECRET);
    const res = await api.post('/api/tickets/satisfaction', {
      raw: new URLSearchParams({ token: lien, value: 'up' }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(res.status, 200);
    assert.equal((await prisma.ticket.findUnique({ where: { id: ticket.id } })).satisfaction, 1);
  });
});

describe('révocation', () => {
  test('un compte supprimé perd l’accès immédiatement', async () => {
    const passager = await prisma.user.create({
      data: { email: 'passager@test.local', name: 'Passager', role: 'user', passwordHash: ctx.user.passwordHash },
    });
    const jeton = await login(api, passager.email);
    assert.equal((await api.get('/api/auth/me', { token: jeton })).status, 200);

    assert.equal((await api.del(`/api/users/${passager.id}`, { token: t.admin })).status, 204);
    assert.equal((await api.get('/api/auth/me', { token: jeton })).status, 401);
  });

  test('un administrateur rétrogradé perd ses droits sans se reconnecter', async () => {
    const second = await prisma.user.create({
      data: { email: 'admin2@test.local', name: 'Admin 2', role: 'admin', passwordHash: ctx.user.passwordHash },
    });
    const jeton = await login(api, second.email);
    assert.equal((await api.get('/api/users', { token: jeton })).status, 200);

    await api.patch(`/api/users/${second.id}`, { token: t.admin, body: { role: 'user' } });
    assert.equal((await api.get('/api/users', { token: jeton })).status, 403);
  });

  test('changer son mot de passe ferme les autres sessions et en rouvre une', async () => {
    const autreNavigateur = await login(api, ctx.user.email);
    const res = await api.patch('/api/auth/password', {
      token: t.user,
      body: { currentPassword: ctx.password, newPassword: 'nouveau-mdp-2026' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.token, 'un nouveau jeton est renvoyé');

    assert.equal((await api.get('/api/auth/me', { token: autreNavigateur })).status, 401);
    assert.equal((await api.get('/api/auth/me', { token: t.user })).status, 401);
    assert.equal((await api.get('/api/auth/me', { token: res.data.token })).status, 200);
    t.user = res.data.token;
  });

  test('un mot de passe réinitialisé par l’admin ferme les sessions du compte', async () => {
    const tech = await login(api, ctx.tech.email);
    await api.patch(`/api/users/${ctx.tech.id}`, { token: t.admin, body: { password: 'reinit-2026-xyz' } });
    assert.equal((await api.get('/api/auth/me', { token: tech })).status, 401);
    await login(api, ctx.tech.email, 'reinit-2026-xyz');
  });
});

describe('frein du login derrière un proxy', () => {
  test('les échecs d’un client ne bloquent pas les autres', async () => {
    const tenter = (ip, password) =>
      api.post('/api/auth/login', {
        body: { email: ctx.admin.email, password },
        headers: { 'X-Forwarded-For': ip },
      });

    for (let i = 0; i < 20; i++) await tenter('203.0.113.7', 'mauvais');
    assert.equal((await tenter('203.0.113.7', 'mauvais')).status, 429, 'l’attaquant est freiné');
    assert.equal((await tenter('198.51.100.4', ctx.password)).status, 200, 'un collègue se connecte');
  });

  test('TRUST_PROXY : défaut sur les adresses privées, valeurs explicites respectées', () => {
    assert.equal(trustProxy(undefined), 'loopback, linklocal, uniquelocal');
    assert.equal(trustProxy(''), 'loopback, linklocal, uniquelocal');
    assert.equal(trustProxy('false'), false);
    assert.equal(trustProxy('true'), true);
    assert.equal(trustProxy('2'), 2);
    assert.equal(trustProxy('10.0.0.0/8'), '10.0.0.0/8');
  });
});
