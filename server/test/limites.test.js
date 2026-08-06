import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

let api, ctx, t, autreUser;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  autreUser = await prisma.user.create({ data: { email: 'autre@test.local', name: 'Autre', role: 'user' } });
  t = { admin: await login(api, ctx.admin.email), tech: await login(api, ctx.tech.email), user: await login(api, ctx.user.email) };
});
after(async () => { await api.close(); await disconnect(); });

describe('fuite par référence croisée', () => {
  test('un utilisateur peut-il rattacher son ticket à l’actif d’un autre ?', async () => {
    const actif = await prisma.asset.create({
      data: { name: 'PC-PDG-CONFIDENTIEL', type: 'pc', assignedUserId: autreUser.id },
    });
    const r = await api.post('/api/tickets', {
      token: t.user,
      body: { title: 'x', description: 'y', categoryId: ctx.category.id, assetId: actif.id },
    });
    // Si accepté, le nom de l'actif d'autrui revient dans la réponse.
    assert.equal(r.status, 400, `accepté (${r.status}) — nom exposé : ${JSON.stringify(r.data.asset)}`);
  });
});

describe('longueur des champs', () => {
  test('un titre de ticket démesuré est refusé', async () => {
    const r = await api.post('/api/tickets', {
      token: t.user,
      body: { title: 'A'.repeat(50000), description: 'x', categoryId: ctx.category.id },
    });
    assert.equal(r.status, 400, `titre de 50 000 caractères accepté (${r.status})`);
  });

  test('une description démesurée est refusée', async () => {
    const r = await api.post('/api/tickets', {
      token: t.user,
      body: { title: 'x', description: 'B'.repeat(80000), categoryId: ctx.category.id },
    });
    assert.equal(r.status, 400, `description de 80 000 caractères acceptée (${r.status})`);
  });

  test('un commentaire démesuré est refusé', async () => {
    const c = await api.post('/api/tickets', { token: t.user, body: { title: 'x', description: 'y', categoryId: ctx.category.id } });
    const r = await api.post(`/api/tickets/${c.data.id}/comments`, { token: t.user, body: { body: 'C'.repeat(80000) } });
    assert.equal(r.status, 400, `commentaire de 80 000 caractères accepté (${r.status})`);
  });

  test('un nom de catégorie démesuré est refusé', async () => {
    const r = await api.post('/api/categories', { token: t.admin, body: { name: 'D'.repeat(30000) } });
    assert.equal(r.status, 400, `nom de 30 000 caractères accepté (${r.status})`);
  });

  test('un article de base de connaissances démesuré est refusé', async () => {
    const r = await api.post('/api/kb', { token: t.admin, body: { title: 'E'.repeat(20000), body: 'x' } });
    assert.equal(r.status, 400, `titre d’article de 20 000 caractères accepté (${r.status})`);
  });
});

describe('suppressions', () => {
  test('un admin supprime un ticket, avec commentaires, pièces jointes et fichiers', async () => {
    const c = await api.post('/api/tickets', { token: t.user, body: { title: 'À supprimer', description: 'x', categoryId: ctx.category.id } });
    const id = c.data.id;
    await api.post(`/api/tickets/${id}/comments`, { token: t.user, body: { body: 'un mot' } });
    fs.mkdirSync('uploads', { recursive: true });
    const chemin = 'uploads/test-suppression.pdf';
    fs.writeFileSync(chemin, 'contenu');
    await prisma.attachment.create({
      data: { ticketId: id, filename: 'a.pdf', storedPath: chemin, size: 7, uploadedBy: ctx.user.id },
    });

    const r = await api.del(`/api/tickets/${id}`, { token: t.admin });
    assert.equal(r.status, 204);
    assert.equal(await prisma.ticket.findUnique({ where: { id } }), null);
    assert.equal(await prisma.ticketComment.count({ where: { ticketId: id } }), 0, 'commentaires en cascade');
    assert.equal(await prisma.attachment.count({ where: { ticketId: id } }), 0, 'pièces jointes en cascade');
    assert.equal(fs.existsSync(chemin), false, 'le fichier doit être retiré du disque');
  });

  test('seul un admin supprime un ticket', async () => {
    const c = await api.post('/api/tickets', { token: t.user, body: { title: 'x', description: 'y', categoryId: ctx.category.id } });
    assert.equal((await api.del(`/api/tickets/${c.data.id}`, { token: t.user })).status, 403);
    assert.equal((await api.del(`/api/tickets/${c.data.id}`, { token: t.tech })).status, 403);
    assert.ok(await prisma.ticket.findUnique({ where: { id: c.data.id } }));
  });

  test('un admin supprime une catégorie inutilisée', async () => {
    const c = await api.post('/api/categories', { token: t.admin, body: { name: 'Éphémère' } });
    assert.equal((await api.del(`/api/categories/${c.data.id}`, { token: t.admin })).status, 204);
    assert.equal(await prisma.category.findUnique({ where: { id: c.data.id } }), null);
  });

  test('une catégorie utilisée est protégée', async () => {
    const r = await api.del(`/api/categories/${ctx.category.id}`, { token: t.admin });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /ticket/);
  });

  test('un admin supprime une équipe inutilisée', async () => {
    const e = await api.post('/api/teams', { token: t.admin, body: { name: 'Éphémère' } });
    assert.equal((await api.del(`/api/teams/${e.data.id}`, { token: t.admin })).status, 204);
  });

  test('une équipe avec des membres est protégée', async () => {
    const r = await api.del(`/api/teams/${ctx.team.id}`, { token: t.admin });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /compte/);
  });

  test('l’auteur d’un envoi retire sa pièce jointe, un tiers non', async () => {
    const c = await api.post('/api/tickets', { token: t.user, body: { title: 'x', description: 'y', categoryId: ctx.category.id } });
    const pj = await prisma.attachment.create({
      data: { ticketId: c.data.id, filename: 'a.pdf', storedPath: 'uploads/inexistant.pdf', size: 1, uploadedBy: autreUser.id },
    });
    // Envoyée par quelqu'un d'autre : le demandeur ne peut pas la retirer.
    assert.equal((await api.del(`/api/tickets/${c.data.id}/attachments/${pj.id}`, { token: t.user })).status, 403);
    // Le support, si.
    assert.equal((await api.del(`/api/tickets/${c.data.id}/attachments/${pj.id}`, { token: t.tech })).status, 204);
    assert.equal(await prisma.attachment.findUnique({ where: { id: pj.id } }), null);
  });
});

describe('validation des doublons et des référentiels', () => {
  test('deux catégories de même nom sont refusées', async () => {
    await api.post('/api/categories', { token: t.admin, body: { name: 'Doublon' } });
    const r = await api.post('/api/categories', { token: t.admin, body: { name: 'Doublon' } });
    assert.equal(r.status, 409, `doublon accepté (${r.status})`);
  });

  test('deux équipes de même nom sont refusées', async () => {
    await api.post('/api/teams', { token: t.admin, body: { name: 'Doublon' } });
    const r = await api.post('/api/teams', { token: t.admin, body: { name: 'Doublon' } });
    assert.equal(r.status, 409, `doublon accepté (${r.status})`);
  });

  test('un ticket ne peut pas être affecté à une équipe inexistante', async () => {
    const c = await api.post('/api/tickets', { token: t.user, body: { title: 'x', description: 'y', categoryId: ctx.category.id } });
    const r = await api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { teamId: 999999 } });
    assert.equal(r.status, 400);
  });
});

describe('énumération de comptes', () => {
  test('le message de login ne distingue pas un compte inexistant d’un mot de passe faux', async () => {
    const inconnu = await api.post('/api/auth/login', { body: { email: 'nexistepas@test.local', password: 'x' } });
    const mauvais = await api.post('/api/auth/login', { body: { email: ctx.user.email, password: 'mauvais' } });
    assert.equal(inconnu.data.error, mauvais.data.error, `messages distincts : « ${inconnu.data.error} » vs « ${mauvais.data.error} »`);
  });
});

describe('validation du layout de tableau de bord', () => {
  test('un widget avec config null est refusé', async () => {
    const r = await api.put('/api/settings/dashboard/user', {
      token: t.admin, body: { layout: [{ type: 'stat', size: 1, config: null }] },
    });
    assert.equal(r.status, 400, `config null acceptée (${r.status}) — plantera le client`);
  });

  test('un type de widget inconnu est refusé', async () => {
    const r = await api.put('/api/settings/dashboard/user', {
      token: t.admin, body: { layout: [{ type: 'rm -rf', size: 1, config: {} }] },
    });
    assert.equal(r.status, 400, `type inconnu accepté (${r.status})`);
  });

  test('une taille de widget aberrante est refusée', async () => {
    const r = await api.put('/api/settings/dashboard/user', {
      token: t.admin, body: { layout: [{ type: 'stat', size: 9999, config: {} }] },
    });
    assert.equal(r.status, 400, `taille 9999 acceptée (${r.status})`);
  });
});

describe('recherche et pagination', () => {
  test('une recherche avec des caractères spéciaux ne casse rien', async () => {
    for (const q of ["%", "_", "'; DROP TABLE tickets;--", "\\", "100%", "a%_b"]) {
      const r = await api.get(`/api/tickets?q=${encodeURIComponent(q)}`, { token: t.admin });
      assert.equal(r.status, 200, `q=${q} → ${r.status}`);
    }
    assert.ok(await prisma.ticket.count() >= 0, 'la table existe toujours');
  });

  test('une page négative ou démesurée ne casse rien', async () => {
    for (const p of ['-1', '0', '999999999', 'abc', '1e400']) {
      const r = await api.get(`/api/tickets?page=${p}&pageSize=10`, { token: t.admin });
      assert.equal(r.status, 200, `page=${p} → ${r.status}`);
    }
  });

  test('pageSize est plafonné', async () => {
    const r = await api.get('/api/tickets?page=1&pageSize=100000', { token: t.admin });
    assert.equal(r.status, 200);
    assert.ok(r.data.items.length <= 500, `${r.data.items.length} éléments renvoyés`);
  });
});
