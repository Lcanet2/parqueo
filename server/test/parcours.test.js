import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Parcours nominaux : filet de non-régression sur le cœur métier (cycle de vie
// d'un ticket, visibilité par rôle, workflows, satisfaction).

let api;
let ctx;
let t;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = {
    admin: await login(api, ctx.admin.email),
    tech: await login(api, ctx.tech.email),
    user: await login(api, ctx.user.email),
  };
});

after(async () => {
  await api.close();
  await disconnect();
});

const creerTicket = (token, extra = {}) =>
  api.post('/api/tickets', {
    token,
    body: { title: 'Écran noir', description: 'Le poste ne démarre plus', categoryId: ctx.category.id, ...extra },
  });

describe('cycle de vie d’un ticket', () => {
  test('un utilisateur crée un ticket, un technicien le traite', async () => {
    const cree = await creerTicket(t.user);
    assert.equal(cree.status, 201);
    assert.equal(cree.data.status, 'new');
    assert.equal(cree.data.author.email, ctx.user.email);
    const id = cree.data.id;

    // Prise en charge
    const prise = await api.patch(`/api/tickets/${id}`, {
      token: t.tech,
      body: { status: 'in_progress', assigneeId: ctx.tech.id },
    });
    assert.equal(prise.status, 200);
    assert.equal(prise.data.assignee.id, ctx.tech.id);

    // Échange
    const msg = await api.post(`/api/tickets/${id}/comments`, {
      token: t.user,
      body: { body: 'Toujours rien ce matin' },
    });
    assert.equal(msg.status, 201);

    // Résolution
    const resolu = await api.patch(`/api/tickets/${id}`, { token: t.tech, body: { status: 'resolved' } });
    assert.equal(resolu.data.status, 'resolved');

    // Le journal contient les événements + le message
    const detail = await api.get(`/api/tickets/${id}`, { token: t.tech });
    const corps = detail.data.comments.map((c) => c.body);
    assert.ok(corps.some((b) => b.includes('new → in_progress')));
    assert.ok(corps.some((b) => b.includes('in_progress → resolved')));
    assert.ok(corps.includes('Toujours rien ce matin'));
  });

  test('un utilisateur ne peut pas modifier un ticket', async () => {
    const { data } = await creerTicket(t.user);
    const res = await api.patch(`/api/tickets/${data.id}`, { token: t.user, body: { status: 'closed' } });
    assert.equal(res.status, 403);
  });

  test('un statut inconnu est refusé', async () => {
    const { data } = await creerTicket(t.user);
    const res = await api.patch(`/api/tickets/${data.id}`, { token: t.admin, body: { status: 'zombie' } });
    assert.equal(res.status, 400);
  });

  test('on ne peut pas assigner un ticket à un simple utilisateur', async () => {
    const { data } = await creerTicket(t.user);
    const res = await api.patch(`/api/tickets/${data.id}`, {
      token: t.admin,
      body: { assigneeId: ctx.user.id },
    });
    assert.equal(res.status, 400);
  });
});

describe('visibilité par rôle', () => {
  test('un utilisateur ne voit que ses propres tickets', async () => {
    await creerTicket(t.user, { title: 'Ticket du demandeur' });
    await prisma.ticket.create({
      data: {
        title: 'Ticket d’un autre',
        description: 'x',
        categoryId: ctx.category.id,
        authorId: ctx.admin.id,
      },
    });

    const liste = await api.get('/api/tickets', { token: t.user });
    assert.ok(liste.data.length > 0);
    assert.ok(liste.data.every((tk) => tk.author.id === ctx.user.id));
  });

  test('un utilisateur reçoit 404 sur le ticket d’un autre', async () => {
    const autre = await prisma.ticket.create({
      data: { title: 'Privé', description: 'x', categoryId: ctx.category.id, authorId: ctx.admin.id },
    });
    assert.equal((await api.get(`/api/tickets/${autre.id}`, { token: t.user })).status, 404);
  });

  test('un admin voit tout', async () => {
    const total = await prisma.ticket.count();
    const liste = await api.get('/api/tickets', { token: t.admin });
    assert.equal(liste.data.length, total);
  });

  test('un technicien voit le ticket qu’il a ouvert, même assigné à une autre équipe', async () => {
    const autreEquipe = await prisma.team.create({ data: { name: 'Réseau' } });
    const autreTech = await prisma.user.create({
      data: { email: 'tech2@test.local', name: 'Tech réseau', role: 'technician', teamId: autreEquipe.id },
    });
    const sien = await prisma.ticket.create({
      data: {
        title: 'Ouvert par le technicien',
        description: 'x',
        categoryId: ctx.category.id,
        authorId: ctx.tech.id,
        assigneeId: autreTech.id,
        teamId: autreEquipe.id,
      },
    });

    const res = await api.get(`/api/tickets/${sien.id}`, { token: t.tech });
    assert.equal(res.status, 200, 'l’auteur doit garder accès à son propre ticket');
  });

  test('le catalogue logiciel est fermé aux utilisateurs finals', async () => {
    assert.equal((await api.get('/api/software', { token: t.user })).status, 403);
    assert.equal((await api.get('/api/software', { token: t.tech })).status, 200);
  });

  test('l’administration des comptes est réservée aux admins', async () => {
    assert.equal((await api.get('/api/users', { token: t.tech })).status, 403);
    assert.equal((await api.get('/api/users', { token: t.admin })).status, 200);
  });
});

describe('pagination et filtres', () => {
  test('la réponse paginée porte items, total et compteurs par statut', async () => {
    const res = await api.get('/api/tickets?page=1&pageSize=2', { token: t.admin });
    assert.ok(Array.isArray(res.data.items));
    assert.ok(res.data.items.length <= 2);
    assert.equal(typeof res.data.total, 'number');
    assert.deepEqual(Object.keys(res.data.counts).sort(), [
      'closed',
      'in_progress',
      'new',
      // « open » regroupe nouveau + en cours + en attente, pour la chip du même nom.
      'open',
      'resolved',
      'waiting',
    ]);
  });

  test('le filtre par statut restreint la liste', async () => {
    const res = await api.get('/api/tickets?status=resolved&page=1&pageSize=50', { token: t.admin });
    assert.ok(res.data.items.every((tk) => tk.status === 'resolved'));
  });
});

describe('workflow', () => {
  test('un workflow assigne l’équipe puis attend la prise en charge', async () => {
    const wf = await prisma.workflow.create({
      data: {
        name: 'Aiguillage matériel',
        trigger: 'ticket_created',
        conditions: { categoryId: ctx.category.id },
        edges: { trigger: 'a', a: 'b' },
        steps: {
          create: [
            { key: 'a', type: 'assign_team', config: { teamId: ctx.team.id }, position: 0 },
            { key: 'b', type: 'wait_assigned', config: {}, position: 1 },
          ],
        },
      },
    });

    const { data } = await creerTicket(t.user, { title: 'Passe par le workflow' });
    assert.equal(data.teamId, ctx.team.id, 'l’équipe doit être affectée par le workflow');

    // Le ticket est parqué sur le bloc d'attente.
    const run = await prisma.workflowRun.findFirst({ where: { ticketId: data.id, workflowId: wf.id } });
    assert.equal(run.status, 'running');
    assert.equal(run.nodeKey, 'b');

    // L'assignation débloque le parcours, qui se termine.
    await api.patch(`/api/tickets/${data.id}`, { token: t.admin, body: { assigneeId: ctx.tech.id } });
    const apres = await prisma.workflowRun.findUnique({ where: { id: run.id } });
    assert.equal(apres.status, 'done');

    await prisma.workflow.delete({ where: { id: wf.id } });
  });
});

describe('enquête de satisfaction', () => {
  test('le lien signé enregistre l’avis une seule fois', async () => {
    const { data } = await creerTicket(t.user);
    const token = jwt.sign({ sub: data.id, purpose: 'satisfaction' }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    const un = await api.get(`/api/tickets/satisfaction?token=${token}&value=up`);
    assert.equal(un.status, 200);
    assert.equal((await prisma.ticket.findUnique({ where: { id: data.id } })).satisfaction, 1);

    // Second clic : pris en compte une seule fois.
    const deux = await api.get(`/api/tickets/satisfaction?token=${token}&value=down`);
    assert.equal(deux.status, 200);
    assert.match(String(deux.data), /déjà/i);
    assert.equal((await prisma.ticket.findUnique({ where: { id: data.id } })).satisfaction, 1);
  });

  test('un lien non signé est refusé', async () => {
    const res = await api.get('/api/tickets/satisfaction?token=bidon&value=up');
    assert.equal(res.status, 400);
  });
});

describe('formulaires du catalogue', () => {
  test('une demande soumise crée un ticket rattaché au formulaire', async () => {
    const form = await api.post('/api/forms', {
      token: t.admin,
      body: {
        name: 'Demande d’accès',
        categoryId: ctx.category.id,
        priority: 'high',
        fields: [
          { label: 'Application', type: 'select', required: true, options: ['Paie', 'CRM'] },
          { label: 'Motif', type: 'textarea', required: false },
        ],
      },
    });
    assert.equal(form.status, 201);
    const champApp = form.data.fields[0];

    const soumis = await api.post(`/api/forms/${form.data.id}/submit`, {
      token: t.user,
      body: { answers: { [champApp.id]: 'CRM' } },
    });
    assert.equal(soumis.status, 201);
    assert.equal(soumis.data.formId, form.data.id);
    assert.equal(soumis.data.priority, 'high');
    assert.match(soumis.data.description, /Application : CRM/);

    // Une valeur hors de la liste est refusée.
    const invalide = await api.post(`/api/forms/${form.data.id}/submit`, {
      token: t.user,
      body: { answers: { [champApp.id]: 'Autre chose' } },
    });
    assert.equal(invalide.status, 400);

    // Un champ requis manquant est refusé.
    const manquant = await api.post(`/api/forms/${form.data.id}/submit`, {
      token: t.user,
      body: { answers: {} },
    });
    assert.equal(manquant.status, 400);
  });
});
