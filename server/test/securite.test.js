import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Tests adverses : ce qu'un compte mal intentionné peut tenter.

let api, ctx, t, autreUser, autreTech, autreEquipe;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  autreEquipe = await prisma.team.create({ data: { name: 'Réseau' } });
  autreUser = await prisma.user.create({
    data: { email: 'autre@test.local', name: 'Autre', role: 'user' },
  });
  autreTech = await prisma.user.create({
    data: { email: 'tech2@test.local', name: 'Tech2', role: 'technician', teamId: autreEquipe.id },
  });
  t = {
    admin: await login(api, ctx.admin.email),
    tech: await login(api, ctx.tech.email),
    user: await login(api, ctx.user.email),
  };
});
after(async () => { await api.close(); await disconnect(); });

describe('escalade de privilèges', () => {
  test('un utilisateur ne peut pas se promouvoir admin', async () => {
    const r = await api.patch(`/api/users/${ctx.user.id}`, { token: t.user, body: { role: 'admin' } });
    assert.equal(r.status, 403);
    assert.equal((await prisma.user.findUnique({ where: { id: ctx.user.id } })).role, 'user');
  });

  test('un technicien ne peut pas créer de compte', async () => {
    const r = await api.post('/api/users', {
      token: t.tech,
      body: { email: 'pirate@test.local', password: 'motdepasse1', name: 'Pirate', role: 'admin' },
    });
    assert.equal(r.status, 403);
  });

  test('un rôle inventé dans le jeton ne donne aucun droit', async () => {
    const forge = jwt.sign({ sub: ctx.user.id, role: 'superadmin' }, process.env.JWT_SECRET);
    assert.equal((await api.get('/api/users', { token: forge })).status, 403);
    assert.equal((await api.get('/api/workflows', { token: forge })).status, 403);
  });

  test('un jeton « algorithme none » est rejeté', async () => {
    const entete = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const corps = Buffer.from(JSON.stringify({ sub: ctx.admin.id, role: 'admin' })).toString('base64url');
    assert.equal((await api.get('/api/users', { token: `${entete}.${corps}.` })).status, 401);
  });

  test('un admin ne peut pas se retirer son propre rôle ni se supprimer', async () => {
    assert.equal((await api.patch(`/api/users/${ctx.admin.id}`, { token: t.admin, body: { role: 'user' } })).status, 400);
    assert.equal((await api.del(`/api/users/${ctx.admin.id}`, { token: t.admin })).status, 400);
  });

  test('un utilisateur ne peut pas écrire dans la base de connaissances', async () => {
    const r = await api.post('/api/kb', { token: t.user, body: { title: 'x', body: 'y' } });
    assert.equal(r.status, 403);
  });

  test('un technicien ne peut pas toucher aux workflows ni aux formulaires', async () => {
    assert.equal((await api.post('/api/workflows', { token: t.tech, body: { name: 'x', trigger: 'ticket_created' } })).status, 403);
    assert.equal((await api.post('/api/forms', { token: t.tech, body: { name: 'x', categoryId: ctx.category.id } })).status, 403);
    assert.equal((await api.patch('/api/settings/app', { token: t.tech, body: { kbSuggest: false } })).status, 403);
  });
});

describe('affectation de masse (mass assignment)', () => {
  test('à la création, un ticket ne peut pas être auto-assigné ni changer d’auteur', async () => {
    const r = await api.post('/api/tickets', {
      token: t.user,
      body: {
        title: 'Tentative', description: 'x', categoryId: ctx.category.id,
        authorId: ctx.admin.id, assigneeId: ctx.tech.id, status: 'closed', teamId: ctx.team.id,
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.author.id, ctx.user.id, 'l’auteur doit rester le demandeur');
    assert.equal(r.data.assigneeId, null, 'pas d’auto-assignation');
    assert.equal(r.data.status, 'new');
    assert.equal(r.data.teamId, null);
  });

  test('un utilisateur ne peut pas forcer la priorité si le paramètre l’interdit', async () => {
    const { saveAppSettings } = await import('../src/lib/appSettings.js');
    await saveAppSettings({ userCanSetPriority: false, ticketDefaultPriority: 'low' });
    const r = await api.post('/api/tickets', {
      token: t.user, body: { title: 'Urgent', description: 'x', categoryId: ctx.category.id, priority: 'high' },
    });
    assert.equal(r.data.priority, 'low');
    // Le support garde la main.
    const s = await api.post('/api/tickets', {
      token: t.tech, body: { title: 'Vrai urgent', description: 'x', categoryId: ctx.category.id, priority: 'high' },
    });
    assert.equal(s.data.priority, 'high');
    await saveAppSettings({ userCanSetPriority: true, ticketDefaultPriority: 'medium' });
  });

  test('la satisfaction ne peut pas être écrite par l’API des tickets', async () => {
    const c = await api.post('/api/tickets', { token: t.user, body: { title: 'S', description: 'x', categoryId: ctx.category.id } });
    await api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { satisfaction: 1, satisfactionAt: new Date() } });
    assert.equal((await prisma.ticket.findUnique({ where: { id: c.data.id } })).satisfaction, null);
  });
});

describe('accès horizontal (IDOR)', () => {
  test('un utilisateur ne lit pas le ticket d’un autre', async () => {
    const autre = await prisma.ticket.create({
      data: { title: 'Confidentiel', description: 'secret', categoryId: ctx.category.id, authorId: autreUser.id },
    });
    assert.equal((await api.get(`/api/tickets/${autre.id}`, { token: t.user })).status, 404);
    assert.equal((await api.post(`/api/tickets/${autre.id}/comments`, { token: t.user, body: { body: 'coucou' } })).status, 404);
    assert.equal((await api.patch(`/api/tickets/${autre.id}`, { token: t.user, body: { status: 'closed' } })).status, 403);
  });

  test('un utilisateur ne lit pas l’actif d’un autre', async () => {
    const actif = await prisma.asset.create({
      data: { name: 'PC-DIRECTION', type: 'pc', assignedUserId: autreUser.id },
    });
    assert.equal((await api.get(`/api/assets/${actif.id}`, { token: t.user })).status, 404);
    const liste = await api.get('/api/assets', { token: t.user });
    assert.ok(!JSON.stringify(liste.data).includes('PC-DIRECTION'));
  });

  test('un utilisateur ne peut pas modifier ni supprimer un actif', async () => {
    const actif = await prisma.asset.create({ data: { name: 'PC-X', type: 'pc', assignedUserId: ctx.user.id } });
    assert.equal((await api.patch(`/api/assets/${actif.id}`, { token: t.user, body: { name: 'volé' } })).status, 403);
    assert.equal((await api.del(`/api/assets/${actif.id}`, { token: t.user })).status, 403);
  });

  test('un utilisateur ne télécharge pas la pièce jointe d’un ticket qui n’est pas le sien', async () => {
    const autre = await prisma.ticket.create({
      data: { title: 'Avec PJ', description: 'x', categoryId: ctx.category.id, authorId: autreUser.id },
    });
    const pj = await prisma.attachment.create({
      data: { ticketId: autre.id, filename: 'paie.pdf', storedPath: 'uploads/x.pdf', size: 10, uploadedBy: autreUser.id },
    });
    assert.equal((await api.get(`/api/tickets/${autre.id}/attachments/${pj.id}`, { token: t.user })).status, 404);
  });

  test('une pièce jointe n’est pas accessible via un autre ticket', async () => {
    const mien = await api.post('/api/tickets', { token: t.user, body: { title: 'Mien', description: 'x', categoryId: ctx.category.id } });
    const autre = await prisma.ticket.create({ data: { title: 'Autre', description: 'x', categoryId: ctx.category.id, authorId: autreUser.id } });
    const pj = await prisma.attachment.create({
      data: { ticketId: autre.id, filename: 'secret.pdf', storedPath: 'uploads/y.pdf', size: 10, uploadedBy: autreUser.id },
    });
    assert.equal((await api.get(`/api/tickets/${mien.data.id}/attachments/${pj.id}`, { token: t.user })).status, 404);
  });

  test('un utilisateur ne lit pas le tableau de bord d’un autre rôle', async () => {
    assert.equal((await api.get('/api/settings/dashboard?role=admin', { token: t.user })).status, 403);
    assert.equal((await api.put('/api/settings/dashboard/admin', { token: t.user, body: { layout: [] } })).status, 403);
  });

  test('un utilisateur ne voit pas les brouillons de la base de connaissances', async () => {
    const brouillon = await prisma.kbArticle.create({
      data: { title: 'Brouillon interne', body: 'procédure confidentielle', published: false, authorId: ctx.admin.id },
    });
    assert.equal((await api.get(`/api/kb/${brouillon.id}`, { token: t.user })).status, 404);
    const l = await api.get('/api/kb', { token: t.user });
    assert.ok(!JSON.stringify(l.data).includes('Brouillon interne'));
  });

  test('un utilisateur ne voit pas un formulaire désactivé', async () => {
    const f = await prisma.form.create({
      data: { name: 'Formulaire retiré', categoryId: ctx.category.id, priority: 'medium', active: false },
    });
    assert.equal((await api.get(`/api/forms/${f.id}`, { token: t.user })).status, 404);
    assert.equal((await api.post(`/api/forms/${f.id}/submit`, { token: t.user, body: { answers: {} } })).status, 404);
    assert.equal((await api.get('/api/forms?all=1', { token: t.user })).data.some((x) => x.id === f.id), false);
  });
});
