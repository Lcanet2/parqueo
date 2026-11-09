import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';
import { handleIncomingEmail } from '../src/services/mailbox.js';

// Réouverture d'un ticket résolu quand le demandeur répond (web ou email).

let api;
let ctx;
let t;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = { tech: await login(api, ctx.tech.email), user: await login(api, ctx.user.email) };
});

after(async () => {
  await api.close();
  await disconnect();
});

const ticket = (data) =>
  prisma.ticket.create({
    data: { title: 'Wifi', description: 'coupé', categoryId: ctx.category.id, authorId: ctx.user.id, ...data },
  });
const statut = async (id) => (await prisma.ticket.findUnique({ where: { id } })).status;
const repondre = (token, id, body = 'Toujours pas réglé') =>
  api.post(`/api/tickets/${id}/comments`, { token, body: { body } });

describe('réouverture par le demandeur', () => {
  test('un ticket résolu et assigné repasse « En cours »', async () => {
    const tk = await ticket({ status: 'resolved', assigneeId: ctx.tech.id });
    assert.equal((await repondre(t.user, tk.id)).status, 201);
    assert.equal(await statut(tk.id), 'in_progress');
    const evt = await prisma.ticketComment.findFirst({ where: { ticketId: tk.id, type: 'event' } });
    assert.match(evt.body, /rouvert par le demandeur/);
  });

  test('sans assigné, il repasse « Nouveau » et retourne dans la file', async () => {
    const tk = await ticket({ status: 'resolved' });
    await repondre(t.user, tk.id);
    assert.equal(await statut(tk.id), 'new');
  });

  test('un ticket fermé reste fermé', async () => {
    const tk = await ticket({ status: 'closed' });
    await repondre(t.user, tk.id);
    assert.equal(await statut(tk.id), 'closed');
  });

  test('le message du support ne rouvre pas', async () => {
    const tk = await ticket({ status: 'resolved', assigneeId: ctx.tech.id });
    await repondre(t.tech, tk.id, 'Pensez à redémarrer');
    assert.equal(await statut(tk.id), 'resolved');
  });

  test('la réponse par email rouvre aussi', async () => {
    const tk = await ticket({ status: 'resolved', assigneeId: ctx.tech.id });
    const r = await handleIncomingEmail({
      fromAddress: ctx.user.email,
      subject: `Re: [Parqueo] Ticket #${tk.id} : En cours → Résolu`,
      text: 'Non, ça recommence',
    });
    assert.equal(r.action, 'comment');
    assert.equal(await statut(tk.id), 'in_progress');
  });

  test('la réouverture déclenche les workflows « statut changé »', async () => {
    await prisma.workflow.create({
      data: {
        name: 'Alerte réouverture',
        trigger: 'status_changed',
        conditions: { toStatus: 'in_progress' },
        edges: { trigger: 'n' },
        steps: { create: [{ key: 'n', type: 'add_note', config: { body: 'Réouverture détectée' } }] },
      },
    });
    const tk = await ticket({ status: 'resolved', assigneeId: ctx.tech.id });
    await repondre(t.user, tk.id);
    assert.ok(await prisma.ticketComment.findFirst({ where: { ticketId: tk.id, body: 'Réouverture détectée' } }));
  });
});
