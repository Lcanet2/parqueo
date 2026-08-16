import './setup.js';
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Photo de profil. L'accès à l'image est protégé par le nom du fichier, pas par
// un jeton (voir src/routes/avatars.js) : ces tests vérifient que ce nom est
// bien imprévisible, qu'il ne laisse pas traverser le disque, et que l'ancienne
// image disparaît quand on la remplace.

let api;
let ctx;
let jeton;

// Un PNG 1×1 valide, le plus petit qui soit.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function corpsMultipart(nom, type, contenu) {
  const limite = '----parqueotest';
  const entete = Buffer.from(
    `--${limite}\r\nContent-Disposition: form-data; name="file"; filename="${nom}"\r\n` +
      `Content-Type: ${type}\r\n\r\n`
  );
  const pied = Buffer.from(`\r\n--${limite}--\r\n`);
  return { corps: Buffer.concat([entete, contenu, pied]), limite };
}

const envoyer = (token, nom = 'photo.png', type = 'image/png', contenu = PNG) => {
  const { corps, limite } = corpsMultipart(nom, type, contenu);
  return api.post('/api/auth/avatar', {
    token,
    raw: corps,
    headers: { 'Content-Type': `multipart/form-data; boundary=${limite}` },
  });
};

before(async () => {
  api = await startServer();
});

after(async () => {
  await api.close();
  await disconnect();
});

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  jeton = await login(api, ctx.user.email);
});

describe('photo de profil', () => {
  test('sans authentification : refusé', async () => {
    assert.equal((await envoyer(null)).status, 401);
    assert.equal((await api.del('/api/auth/avatar')).status, 401);
  });

  test('envoi : le compte porte un nom de fichier imprévisible', async () => {
    const res = await envoyer(jeton);
    assert.equal(res.status, 200);
    assert.match(res.data.avatar, /^[0-9a-f]{32}\.png$/);
    assert.equal(res.data.passwordHash, undefined);

    // Le nom est bien celui retenu en base, et deux envois n'en produisent
    // jamais le même : c'est ce qui rend l'adresse impossible à deviner.
    const enBase = await prisma.user.findUnique({ where: { id: ctx.user.id } });
    assert.equal(enBase.avatar, res.data.avatar);
    assert.notEqual((await envoyer(jeton)).data.avatar, res.data.avatar);
  });

  test('l’image est servie sans jeton, mais seulement au bon nom', async () => {
    const { data } = await envoyer(jeton);

    const ok = await api.get(`/api/avatars/${data.avatar}`);
    assert.equal(ok.status, 200);

    const inconnu = await api.get(`/api/avatars/${'a'.repeat(32)}.png`);
    assert.equal(inconnu.status, 404);
  });

  test('aucune traversée de répertoire', async () => {
    for (const tentative of ['..%2F..%2Fpackage.json', '%2Fetc%2Fpasswd', 'photo.png', 'a'.repeat(31) + '.png']) {
      const res = await api.get(`/api/avatars/${tentative}`);
      assert.equal(res.status, 404, `${tentative} ne doit rien servir`);
    }
  });

  test('remplacer la photo efface l’ancien fichier', async () => {
    const premier = (await envoyer(jeton)).data.avatar;
    const cheminPremier = path.resolve('uploads/avatars', premier);
    assert.ok(existsSync(cheminPremier));

    const second = (await envoyer(jeton)).data.avatar;
    assert.notEqual(second, premier);
    assert.ok(!existsSync(cheminPremier), 'l’ancienne image ne doit pas rester sur le disque');
    assert.equal((await api.get(`/api/avatars/${premier}`)).status, 404);
  });

  test('suppression : retour aux initiales, fichier effacé', async () => {
    const nom = (await envoyer(jeton)).data.avatar;
    const res = await api.del('/api/auth/avatar', { token: jeton });
    assert.equal(res.status, 200);
    assert.equal(res.data.avatar, null);
    assert.ok(!existsSync(path.resolve('uploads/avatars', nom)));
  });

  test('un type non-image est refusé', async () => {
    const res = await envoyer(jeton, 'script.svg', 'image/svg+xml', Buffer.from('<svg onload="alert(1)"/>'));
    assert.equal(res.status, 400);
    assert.equal((await prisma.user.findUnique({ where: { id: ctx.user.id } })).avatar, null);
  });

  test('la photo accompagne l’auteur et l’assigné d’un ticket', async () => {
    const nom = (await envoyer(jeton)).data.avatar;
    const tech = await login(api, ctx.tech.email);

    const cree = await api.post('/api/tickets', {
      token: jeton,
      body: { title: 'Écran cassé', description: 'Tombé', categoryId: ctx.category.id },
    });
    assert.equal(cree.status, 201);

    const detail = await api.get(`/api/tickets/${cree.data.id}`, { token: tech });
    assert.equal(detail.data.author.avatar, nom);

    // Les deux formes de la liste : tableau nu (widgets) et page (écran Tickets).
    const nue = await api.get('/api/tickets', { token: tech });
    assert.equal(nue.data[0].author.avatar, nom);

    const paginee = await api.get('/api/tickets?page=1&pageSize=25', { token: tech });
    assert.equal(paginee.data.items[0].author.avatar, nom);
  });
});
