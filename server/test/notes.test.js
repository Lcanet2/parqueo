import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';
import { notifyCommentAdded } from '../src/services/mailer.js';

// Notes internes : un échange entre techniciens ne doit jamais atteindre le
// demandeur — ni à l'écran, ni dans la réponse brute de l'API, ni par email.

let api;
let ctx;
let t;
let ticketId;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = {
    admin: await login(api, ctx.admin.email),
    tech: await login(api, ctx.tech.email),
    user: await login(api, ctx.user.email),
  };
  const cree = await api.post('/api/tickets', {
    token: t.user,
    body: { title: 'VPN', description: 'Connexion refusée', categoryId: ctx.category.id },
  });
  ticketId = cree.data.id;
});

after(async () => {
  await api.close();
  await disconnect();
});

const commenter = (token, body, internal) =>
  api.post(`/api/tickets/${ticketId}/comments`, { token, body: { body, ...(internal ? { internal } : {}) } });

describe('notes internes', () => {
  test('le support écrit une note interne', async () => {
    const note = await commenter(t.tech, 'Compte AD verrouillé, je débloque', true);
    assert.equal(note.status, 201);
    assert.equal(note.data.internal, true);

    const message = await commenter(t.tech, 'Pouvez-vous réessayer ?');
    assert.equal(message.data.internal, false);
  });

  test('le demandeur ne voit pas les notes internes', async () => {
    const vue = await api.get(`/api/tickets/${ticketId}`, { token: t.user });
    assert.equal(vue.status, 200);
    const corps = vue.data.comments.map((c) => c.body);
    assert.ok(corps.includes('Pouvez-vous réessayer ?'));
    assert.ok(!corps.includes('Compte AD verrouillé, je débloque'), 'note interne montrée au demandeur');
    assert.ok(!JSON.stringify(vue.data).includes('verrouillé'));
  });

  test('le support les voit', async () => {
    for (const token of [t.tech, t.admin]) {
      const vue = await api.get(`/api/tickets/${ticketId}`, { token });
      assert.ok(vue.data.comments.some((c) => c.internal && c.body.includes('verrouillé')));
    }
  });

  test('un demandeur ne peut pas écrire de note interne', async () => {
    const avant = await prisma.ticketComment.count({ where: { ticketId } });
    const res = await commenter(t.user, 'Je me cache', true);
    assert.equal(res.status, 403);
    assert.equal(await prisma.ticketComment.count({ where: { ticketId } }), avant);
  });

  test('seul `true` rend une note interne', async () => {
    const res = await commenter(t.tech, 'Valeur ambiguë', 'true');
    assert.equal(res.data.internal, false);
  });
});

describe('notification d’une note interne', () => {
  // Sans SMTP, l'envoi est journalisé : on y lit les destinataires.
  async function destinataires(comment) {
    const lignes = [];
    const log = console.log;
    console.log = (...a) => lignes.push(a.join(' '));
    try {
      await notifyCommentAdded(
        {
          id: 1,
          title: 'VPN',
          author: { id: ctx.user.id, email: ctx.user.email },
          assignee: { id: ctx.admin.id, email: ctx.admin.email },
        },
        comment
      );
    } finally {
      console.log = log;
    }
    return lignes.join('\n');
  }

  test('une note interne ne part jamais vers le demandeur', async () => {
    const journal = await destinataires({ body: 'x', internal: true, author: { id: ctx.tech.id, name: 'Tech' } });
    assert.match(journal, new RegExp(ctx.admin.email));
    assert.doesNotMatch(journal, new RegExp(ctx.user.email));
  });

  test('un message public part toujours vers le demandeur', async () => {
    const journal = await destinataires({ body: 'x', internal: false, author: { id: ctx.tech.id, name: 'Tech' } });
    assert.match(journal, new RegExp(ctx.user.email));
  });
});
