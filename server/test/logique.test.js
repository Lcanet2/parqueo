import './setup.js';
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

let api, ctx, t;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = { admin: await login(api, ctx.admin.email), tech: await login(api, ctx.tech.email), user: await login(api, ctx.user.email) };
});
after(async () => { await api.close(); await disconnect(); });

const creer = (titre = 'Ticket') =>
  api.post('/api/tickets', { token: t.user, body: { title: titre, description: 'x', categoryId: ctx.category.id } });

describe('workflows : boucles et cascades', () => {
  beforeEach(async () => {
    await prisma.workflowRun.deleteMany();
    await prisma.workflowStep.deleteMany();
    await prisma.workflow.deleteMany();
  });

  test('un workflow qui boucle sur lui-même ne part pas à l’infini', async () => {
    await prisma.workflow.create({
      data: {
        name: 'Boucle', trigger: 'ticket_created',
        edges: { trigger: 'a', a: 'b', b: 'a' },
        steps: { create: [
          { key: 'a', type: 'add_note', config: { body: 'tour A' }, position: 0 },
          { key: 'b', type: 'add_note', config: { body: 'tour B' }, position: 1 },
        ] },
      },
    });
    const debut = Date.now();
    const r = await creer('Boucle');
    assert.equal(r.status, 201);
    assert.ok(Date.now() - debut < 5000, 'la création ne doit pas partir en boucle');
    const notes = await prisma.ticketComment.findMany({ where: { ticketId: r.data.id } });
    assert.ok(notes.length < 10, `${notes.length} notes créées`);
  });

  test('deux workflows « statut changé » ne se relancent pas mutuellement', async () => {
    await prisma.workflow.create({
      data: { name: 'A→B', trigger: 'status_changed', conditions: { toStatus: 'in_progress' },
        edges: { trigger: 's' },
        steps: { create: [{ key: 's', type: 'set_status', config: { status: 'waiting' }, position: 0 }] } },
    });
    await prisma.workflow.create({
      data: { name: 'B→A', trigger: 'status_changed', conditions: { toStatus: 'waiting' },
        edges: { trigger: 's' },
        steps: { create: [{ key: 's', type: 'set_status', config: { status: 'in_progress' }, position: 0 }] } },
    });
    const c = await creer('Ping-pong');
    const debut = Date.now();
    const r = await api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { status: 'in_progress' } });
    assert.equal(r.status, 200);
    assert.ok(Date.now() - debut < 5000, 'pas de ping-pong infini');
  });

  test('un workflow avec un bloc orphelin (non relié) ne s’exécute pas', async () => {
    await prisma.workflow.create({
      data: { name: 'Orphelin', trigger: 'ticket_created', edges: { trigger: 'a' },
        steps: { create: [
          { key: 'a', type: 'add_note', config: { body: 'relié' }, position: 0 },
          { key: 'z', type: 'set_status', config: { status: 'closed' }, position: 1 },
        ] } },
    });
    const r = await creer('Orphelin');
    assert.equal(r.data.status, 'new', 'le bloc non relié ne doit pas s’exécuter');
  });

  test('une action de workflow mal configurée n’empêche pas les suivantes', async () => {
    await prisma.workflow.create({
      data: { name: 'Action cassée', trigger: 'ticket_created', edges: { trigger: 'a', a: 'b' },
        steps: { create: [
          { key: 'a', type: 'assign_user', config: { userId: 999999 }, position: 0 },
          { key: 'b', type: 'set_priority', config: { priority: 'high' }, position: 1 },
        ] } },
    });
    const r = await creer('Action cassée');
    assert.equal(r.data.priority, 'high', 'le bloc suivant doit tout de même s’exécuter');
  });

  test('un workflow inactif ne se déclenche pas', async () => {
    await prisma.workflow.create({
      data: { name: 'Inactif', trigger: 'ticket_created', active: false, edges: { trigger: 'a' },
        steps: { create: [{ key: 'a', type: 'set_priority', config: { priority: 'high' }, position: 0 }] } },
    });
    const r = await creer('Inactif');
    assert.equal(r.data.priority, 'medium');
  });
});

describe('transitions d’état', () => {
  test('un ticket fermé peut-il être rouvert en « nouveau » ?', async () => {
    const c = await creer('Fermé');
    await api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { status: 'closed' } });
    const r = await api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { status: 'new' } });
    // Comportement à documenter : aucune machine à états ne l'interdit.
    assert.equal(r.data.status, 'new');
  });

  test('un utilisateur peut commenter un ticket fermé', async () => {
    const c = await creer('Fermé bis');
    await api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { status: 'closed' } });
    const r = await api.post(`/api/tickets/${c.data.id}/comments`, { token: t.user, body: { body: 'et pourtant' } });
    assert.equal(r.status, 201);
  });
});

describe('concurrence', () => {
  test('deux assignations simultanées ne cassent rien', async () => {
    const c = await creer('Concurrent');
    const [a, b] = await Promise.all([
      api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { assigneeId: ctx.tech.id } }),
      api.patch(`/api/tickets/${c.data.id}`, { token: t.admin, body: { assigneeId: ctx.admin.id } }),
    ]);
    assert.ok([200].includes(a.status) && [200].includes(b.status), `${a.status}/${b.status}`);
    const final = await prisma.ticket.findUnique({ where: { id: c.data.id } });
    assert.ok([ctx.tech.id, ctx.admin.id].includes(final.assigneeId));
  });

  test('deux créations simultanées déclenchant le même workflow', async () => {
    await prisma.workflow.deleteMany();
    await prisma.workflow.create({
      data: { name: 'Concurrent', trigger: 'ticket_created', edges: { trigger: 'a' },
        steps: { create: [{ key: 'a', type: 'wait_assigned', config: {}, position: 0 }] } },
    });
    const rs = await Promise.all([creer('C1'), creer('C2'), creer('C3'), creer('C4')]);
    assert.ok(rs.every((r) => r.status === 201), rs.map((r) => r.status).join('/'));
    assert.equal(await prisma.workflowRun.count(), 4);
  });

  test('commentaires simultanés sur le même ticket', async () => {
    const c = await creer('Bavard');
    const rs = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        api.post(`/api/tickets/${c.data.id}/comments`, { token: t.user, body: { body: `message ${i}` } })
      )
    );
    assert.ok(rs.every((r) => r.status === 201));
    assert.equal(await prisma.ticketComment.count({ where: { ticketId: c.data.id, type: 'comment' } }), 8);
  });
});

describe('intégrité référentielle', () => {
  test('supprimer un utilisateur porteur de tickets est refusé', async () => {
    const u = await prisma.user.create({ data: { email: 'porteur@test.local', name: 'Porteur', role: 'user' } });
    await prisma.ticket.create({ data: { title: 'x', description: 'y', categoryId: ctx.category.id, authorId: u.id } });
    assert.equal((await api.del(`/api/users/${u.id}`, { token: t.admin })).status, 409);
  });

  test('supprimer un utilisateur assigné à un ticket', async () => {
    const u = await prisma.user.create({ data: { email: 'assigne@test.local', name: 'Assigné', role: 'technician' } });
    const tk = await prisma.ticket.create({
      data: { title: 'x', description: 'y', categoryId: ctx.category.id, authorId: ctx.user.id, assigneeId: u.id },
    });
    const r = await api.del(`/api/users/${u.id}`, { token: t.admin });
    // Le garde-fou ne compte que les tickets créés et les commentaires.
    assert.equal(r.status, 409, `supprimé (${r.status}) alors qu’il est assigné au ticket #${tk.id}`);
  });

  test('supprimer un actif référencé par un ticket est refusé', async () => {
    const a = await prisma.asset.create({ data: { name: 'PC-REF', type: 'pc' } });
    await prisma.ticket.create({
      data: { title: 'x', description: 'y', categoryId: ctx.category.id, authorId: ctx.user.id, assetId: a.id },
    });
    assert.equal((await api.del(`/api/assets/${a.id}`, { token: t.admin })).status, 409);
  });

  test('supprimer un formulaire utilisé par des tickets', async () => {
    const f = await api.post('/api/forms', {
      token: t.admin, body: { name: 'Jetable', categoryId: ctx.category.id, fields: [] },
    });
    const s = await api.post(`/api/forms/${f.data.id}/submit`, { token: t.user, body: { answers: {} } });
    assert.equal(s.status, 201);
    const r = await api.del(`/api/forms/${f.data.id}`, { token: t.admin });
    const ticket = await prisma.ticket.findUnique({ where: { id: s.data.id } });
    assert.ok(ticket, `le ticket #${s.data.id} a disparu avec le formulaire (suppression ${r.status})`);
  });
});
