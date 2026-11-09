import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';
import { handleIncomingEmail } from '../src/services/mailbox.js';

// Désactivation de compte : l'alternative à la suppression pour un compte qui a
// un historique (départ d'un salarié, compte compromis).

let api;
let ctx;
let tokenAdmin;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  tokenAdmin = await login(api, ctx.admin.email);
});

after(async () => {
  await api.close();
  await disconnect();
});

const desactiver = (id, active = false) => api.patch(`/api/users/${id}`, { token: tokenAdmin, body: { active } });

describe('désactivation de compte', () => {
  test('les sessions ouvertes tombent et la connexion est refusée', async () => {
    const jeton = await login(api, ctx.tech.email);
    assert.equal((await api.get('/api/auth/me', { token: jeton })).status, 200);

    const res = await desactiver(ctx.tech.id);
    assert.equal(res.status, 200);
    assert.equal(res.data.active, false);

    assert.equal((await api.get('/api/auth/me', { token: jeton })).status, 401, 'session survivante');
    const connexion = await api.post('/api/auth/login', { body: { email: ctx.tech.email, password: ctx.password } });
    assert.equal(connexion.status, 403);
    assert.match(connexion.data.error, /désactivé/);
  });

  test('un mauvais mot de passe ne révèle pas que le compte est désactivé', async () => {
    const res = await api.post('/api/auth/login', { body: { email: ctx.tech.email, password: 'mauvais-mdp' } });
    assert.equal(res.status, 401);
    assert.doesNotMatch(res.data.error, /désactivé/);
  });

  test('il disparaît des assignables et ne peut plus recevoir de ticket', async () => {
    const liste = await api.get('/api/users/assignable', { token: tokenAdmin });
    assert.ok(!liste.data.some((u) => u.id === ctx.tech.id));

    const tk = await prisma.ticket.create({
      data: { title: 'x', description: 'x', categoryId: ctx.category.id, authorId: ctx.user.id },
    });
    const res = await api.patch(`/api/tickets/${tk.id}`, { token: tokenAdmin, body: { assigneeId: ctx.tech.id } });
    assert.equal(res.status, 400);
  });

  test('ses emails sont ignorés', async () => {
    const r = await handleIncomingEmail({ fromAddress: ctx.tech.email, subject: 'Panne', text: 'x' });
    assert.equal(r.action, 'ignored');
  });

  test('réactivé, il retrouve l’accès', async () => {
    assert.equal((await desactiver(ctx.tech.id, true)).status, 200);
    assert.ok(await login(api, ctx.tech.email));
  });

  test('un administrateur ne peut pas se désactiver lui-même', async () => {
    assert.equal((await desactiver(ctx.admin.id)).status, 400);
    assert.equal((await api.patch(`/api/users/${ctx.user.id}`, { token: tokenAdmin, body: { active: 'non' } })).status, 400);
  });

  test('la suppression refusée propose la désactivation', async () => {
    await prisma.ticket.create({
      data: { title: 'hist', description: 'x', categoryId: ctx.category.id, authorId: ctx.user.id },
    });
    const res = await api.del(`/api/users/${ctx.user.id}`, { token: tokenAdmin });
    assert.equal(res.status, 409);
    assert.match(res.data.error, /Désactivez-le/);
  });
});
