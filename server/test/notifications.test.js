import './setup.js';
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';
import { definirTransport } from '../src/services/mailer.js';

// Contenu des notifications email : lu dans un transport factice qui garde
// chaque message composé.

let api;
let ctx;
let t;
const envoyes = [];

// Les notifications partent sans être attendues par la requête : on laisse la
// boucle d'événements les composer avant de lire.
const laisserPartir = () => new Promise((r) => setTimeout(r, 150));

before(async () => {
  process.env.APP_URL = 'https://support.exemple.fr';
  definirTransport({ sendMail: async (m) => envoyes.push(m) });
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
  definirTransport(null);
  delete process.env.APP_URL;
  await api.close();
  await disconnect();
});

beforeEach(() => {
  envoyes.length = 0;
});

const creerTicket = () =>
  api.post('/api/tickets', {
    token: t.user,
    body: { title: 'Imprimante', description: 'Bourrage papier', categoryId: ctx.category.id },
  });

describe('lien vers le ticket', () => {
  test('chaque notification mène au ticket', async () => {
    const { data } = await creerTicket();
    await api.patch(`/api/tickets/${data.id}`, { token: t.admin, body: { assigneeId: ctx.tech.id } });
    await api.post(`/api/tickets/${data.id}/comments`, { token: t.tech, body: { body: 'Je passe' } });
    await laisserPartir();

    assert.ok(envoyes.length >= 3, `${envoyes.length} message(s)`);
    for (const m of envoyes) {
      assert.match(m.text, new RegExp(`https://support\\.exemple\\.fr/tickets/${data.id}\\b`), m.subject);
    }
  });

  test('les messages se déclarent automatiques (anti-boucle)', async () => {
    await creerTicket();
    await laisserPartir();
    assert.equal(envoyes[0].headers['Auto-Submitted'], 'auto-generated');
  });
});

describe('actions de workflow', () => {
  beforeEach(async () => {
    await prisma.workflowRun.deleteMany();
    await prisma.workflowStep.deleteMany();
    await prisma.workflow.deleteMany();
  });

  test('une assignation par workflow prévient l’assigné', async () => {
    await prisma.workflow.create({
      data: {
        name: 'Dispatch',
        trigger: 'ticket_created',
        edges: { trigger: 'a' },
        steps: { create: [{ key: 'a', type: 'assign_user', config: { userId: ctx.tech.id } }] },
      },
    });
    const { data } = await creerTicket();
    await laisserPartir();
    const pourTech = envoyes.filter((m) => m.to.includes(ctx.tech.email));
    assert.ok(pourTech.some((m) => /vous a été assigné/.test(m.subject)), 'assigné non prévenu');
    assert.ok(envoyes.some((m) => /Nouveau → En cours/.test(m.subject)), 'prise en charge non notifiée');
    assert.equal((await prisma.ticket.findUnique({ where: { id: data.id } })).assigneeId, ctx.tech.id);
  });

  test('une résolution par workflow envoie l’enquête de satisfaction', async () => {
    await prisma.workflow.create({
      data: {
        name: 'Résolution auto',
        trigger: 'ticket_created',
        edges: { trigger: 's' },
        steps: { create: [{ key: 's', type: 'set_status', config: { status: 'resolved' } }] },
      },
    });
    await creerTicket();
    await laisserPartir();
    const resolution = envoyes.find((m) => /→ Résolu/.test(m.subject));
    assert.ok(resolution, 'résolution non notifiée');
    assert.ok(resolution.to.includes(ctx.user.email));
    assert.match(resolution.text, /satisfaction\?token=/);
  });
});
