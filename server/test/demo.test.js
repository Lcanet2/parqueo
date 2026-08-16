import './setup.js';
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Mode démonstration : ce que DEMO_MODE doit réellement empêcher.
//
// Ces tests comptent : l'instance publique donne le rôle administrateur à des
// inconnus, alors que tout le modèle de sécurité de Parqueo suppose qu'on lui
// fait confiance. Chaque cas ci-dessous serait exploitable sans le drapeau.

let api;
let ctx;
let admin;

before(async () => {
  api = await startServer();
});

after(async () => {
  await api.close();
  await disconnect();
  delete process.env.DEMO_MODE;
});

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  admin = await login(api, ctx.admin.email);
  process.env.DEMO_MODE = 'true';
});


// Un workflow complet : POST crée l'enveloppe, PUT enregistre les blocs et le
// fil qui part du déclencheur. Sans ce second appel, le workflow n'a aucune
// étape et n'émet évidemment rien — un piège dans lequel ces tests sont tombés
// une première fois.
async function workflowWebhook(token, nom, url) {
  const cree = await api.post('/api/workflows', {
    token,
    body: { name: nom, trigger: 'ticket_created' },
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.data));

  const complet = await api.put(`/api/workflows/${cree.data.id}`, {
    token,
    body: {
      name: nom,
      trigger: 'ticket_created',
      active: true,
      steps: [{ key: 'b1', type: 'webhook', config: { url } }],
      edges: { trigger: 'b1' },
    },
  });
  assert.equal(complet.status, 200, JSON.stringify(complet.data));
  assert.equal(complet.data.steps.length, 1, 'le bloc webhook doit être enregistré');
  return complet.data;
}

describe('mode démonstration', () => {
  test('le client est prévenu par /auth/config', async () => {
    assert.equal((await api.get('/api/auth/config')).data.demo, true);
    process.env.DEMO_MODE = 'false';
    assert.equal((await api.get('/api/auth/config')).data.demo, false);
  });

  test('SSO, Intune et SNMP sont annoncés éteints', async () => {
    const { data } = await api.get('/api/auth/config');
    assert.equal(data.sso, false);
    assert.equal(data.intune, false);
    assert.equal(data.snmp, false);
  });

  test('l’envoi de photo de profil est refusé', async () => {
    const limite = '----parqueodemo';
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const corps = Buffer.concat([
      Buffer.from(
        `--${limite}\r\nContent-Disposition: form-data; name="file"; filename="p.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      png,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    const res = await api.post('/api/auth/avatar', {
      token: admin,
      raw: corps,
      headers: { 'Content-Type': `multipart/form-data; boundary=${limite}` },
    });
    assert.equal(res.status, 403);
    assert.match(res.data.error, /démonstration/);
    assert.equal((await prisma.user.findUnique({ where: { id: ctx.admin.id } })).avatar, null);
  });

  test('le webhook d’un workflow ne part pas', async () => {
    // Un serveur qui ne doit jamais être appelé : s'il l'est, le test échoue.
    const { createServer } = await import('node:http');
    let appele = false;
    const piege = createServer((req, res) => {
      appele = true;
      res.end('ok');
    });
    await new Promise((r) => piege.listen(0, '127.0.0.1', r));
    const cible = `http://127.0.0.1:${piege.address().port}/interne`;

    await workflowWebhook(admin, 'Exfiltration', cible);

    const cree = await api.post('/api/tickets', {
      token: admin,
      body: { title: 'Déclencheur', description: 'x', categoryId: ctx.category.id },
    });
    assert.equal(cree.status, 201);
    await new Promise((r) => setTimeout(r, 400)); // laisse au moteur le temps d'agir

    assert.equal(appele, false, 'le serveur ne doit émettre aucune requête sortante en mode démo');
    await new Promise((r) => piege.close(r));
  });

  test('hors mode démo, le même webhook part bien', async () => {
    process.env.DEMO_MODE = 'false';
    const { createServer } = await import('node:http');
    let appele = false;
    const cible0 = createServer((req, res) => {
      appele = true;
      res.end('ok');
    });
    await new Promise((r) => cible0.listen(0, '127.0.0.1', r));

    await workflowWebhook(admin, 'Passerelle', `http://127.0.0.1:${cible0.address().port}/hook`);
    await api.post('/api/tickets', {
      token: admin,
      body: { title: 'Déclencheur', description: 'x', categoryId: ctx.category.id },
    });
    await new Promise((r) => setTimeout(r, 600));

    assert.equal(appele, true, 'sans DEMO_MODE, le webhook doit fonctionner comme avant');
    await new Promise((r) => cible0.close(r));
  });

  test('ce qu’on vient voir continue de marcher', async () => {
    const t = await api.post('/api/tickets', {
      token: admin,
      body: { title: 'Imprimante en panne', description: 'Bourrage', categoryId: ctx.category.id },
    });
    assert.equal(t.status, 201);

    const commentaire = await api.post(`/api/tickets/${t.data.id}/comments`, {
      token: admin,
      body: { body: 'Je regarde.' },
    });
    assert.equal(commentaire.status, 201);

    assert.equal((await api.patch(`/api/tickets/${t.data.id}`, { token: admin, body: { status: 'resolved' } })).status, 200);
    assert.equal((await api.get('/api/assets', { token: admin })).status, 200);
    assert.equal((await api.get('/api/kb', { token: admin })).status, 200);
  });
});
