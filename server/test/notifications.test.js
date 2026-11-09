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
