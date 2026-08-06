import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Ingestion d'inventaire. Le point sensible est la taille des rapports : un
// inventaire réel (matériel + volumes + plusieurs centaines de logiciels) pèse
// couramment plusieurs centaines de kilo-octets, bien au-delà de la limite par
// défaut d'express.json (100 ko).

const TOKEN = process.env.INVENTORY_TOKEN;

let api;
let ctx;
let tokenAdmin;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  tokenAdmin = await login(api, ctx.admin.email);
});

after(async () => {
  await api.close();
  await disconnect();
});

// Rapport normalisé avec `n` logiciels — le volume vient de là, comme en vrai.
function rapport(n, extra = {}) {
  return {
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    serial: 'SN-TEST-001',
    name: 'POSTE-TEST',
    type: 'pc',
    manufacturer: 'Dell Inc.',
    model: 'Latitude 5540',
    os: 'Windows 11 Pro 23H2',
    cpu: 'Intel Core i7-1355U',
    ramMb: 16384,
    diskGb: 512,
    software: Array.from({ length: n }, (_, i) => ({
      name: `Logiciel de bureautique numéro ${i}`,
      version: `${i}.4.2-build20260731`,
      publisher: `Éditeur Logiciel International ${i % 40}`,
    })),
    ...extra,
  };
}

const octets = (o) => Buffer.byteLength(JSON.stringify(o));

describe('taille des rapports', () => {
  test('un rapport de plus de 100 ko est accepté', async () => {
    const body = rapport(1200);
    assert.ok(octets(body) > 100 * 1024, `le rapport doit dépasser 100 ko (${octets(body)} o)`);

    const res = await api.post('/api/inventory', {
      body,
      headers: { 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 201, `attendu 201, reçu ${res.status} ${JSON.stringify(res.data)}`);
    assert.equal(res.data.action, 'created');

    const asset = await prisma.asset.findUnique({
      where: { uuid: body.uuid },
      include: { software: true },
    });
    assert.equal(asset.software.length, 1200);
    assert.equal(asset.source, 'agent');
  });

  test('un second rapport met à jour sans dupliquer l’actif', async () => {
    const res = await api.post('/api/inventory', {
      body: rapport(800),
      headers: { 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.action, 'updated');
    assert.equal(await prisma.asset.count(), 1);
    assert.equal(await prisma.softwareInstall.count(), 800);
  });

  test('un rapport au-delà de la limite de 5 Mo est refusé en 413', async () => {
    const body = rapport(40000);
    assert.ok(octets(body) > 5 * 1024 * 1024);
    const res = await api.post('/api/inventory', {
      body,
      headers: { 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 413);
  });
});

describe('adaptateur agent GLPI', () => {
  const glpi = (n) => ({
    itemtype: 'Computer',
    deviceid: 'POSTE-GLPI-2026',
    content: {
      hardware: { uuid: '11111111-2222-3333-4444-555555555555', name: 'POSTE-GLPI', memory: 8192 },
      bios: { ssn: 'SN-GLPI-042', smanufacturer: 'HP', smodel: 'EliteBook 840' },
      operatingsystem: { full_name: 'Windows 11 Pro' },
      cpus: [{ name: 'Intel Core i5-1245U' }],
      storages: [{ disksize: 476940 }],
      softwares: Array.from({ length: n }, (_, i) => ({
        name: `Paquet applicatif ${i}`,
        version: `2026.${i}`,
        publisher: `Éditeur ${i % 30}`,
      })),
    },
  });

  test('un inventaire GLPI JSON volumineux est accepté', async () => {
    const body = glpi(1500);
    assert.ok(octets(body) > 100 * 1024);
    const res = await api.post('/api/inventory/glpi', {
      raw: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 200, `reçu ${res.status} ${JSON.stringify(res.data)}`);
    assert.equal(res.data.status, 'ok');

    const asset = await prisma.asset.findUnique({ where: { serial: 'SN-GLPI-042' } });
    assert.equal(asset.manufacturer, 'HP');
    assert.equal(asset.diskGb, 466);
  });

  test('un inventaire GLPI compressé (zlib) est accepté', async () => {
    const body = glpi(600);
    const res = await api.post('/api/inventory/glpi', {
      raw: zlib.deflateSync(Buffer.from(JSON.stringify(body))),
      headers: { 'Content-Type': 'application/x-compress-zlib', 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 200, `reçu ${res.status} ${JSON.stringify(res.data)}`);
  });

  test('un inventaire GLPI compressé (gzip) est accepté', async () => {
    const body = glpi(300);
    const res = await api.post('/api/inventory/glpi', {
      raw: zlib.gzipSync(Buffer.from(JSON.stringify(body))),
      headers: { 'Content-Type': 'application/x-compress-gzip', 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 200, `reçu ${res.status} ${JSON.stringify(res.data)}`);
  });

  test('un corps illisible répond 400 sans tuer le serveur', async () => {
    const res = await api.post('/api/inventory/glpi', {
      raw: Buffer.from([0x78, 0x9c, 0x00, 0x01, 0x02]),
      headers: { 'Content-Type': 'application/x-compress-zlib', 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 400);
    assert.equal((await api.get('/api/health')).status, 200);
  });
});

describe('authentification de l’ingestion', () => {
  test('sans jeton : 401', async () => {
    const res = await api.post('/api/inventory', { body: rapport(1) });
    assert.equal(res.status, 401);
  });

  test('jeton erroné : 401', async () => {
    const res = await api.post('/api/inventory', {
      body: rapport(1),
      headers: { 'X-Parqueo-Token': 'mauvais-jeton-de-la-bonne-longueur!!' },
    });
    assert.equal(res.status, 401);
  });

  test('un rapport sans uuid ni numéro de série est refusé', async () => {
    const res = await api.post('/api/inventory', {
      body: { name: 'sans identité' },
      headers: { 'X-Parqueo-Token': TOKEN },
    });
    assert.equal(res.status, 400);
  });

  test('la synchronisation Intune reste protégée par le JWT admin', async () => {
    const anon = await api.post('/api/inventory/intune/sync', {});
    assert.equal(anon.status, 401);
    // Connecteur non configuré en test → 404, mais l'admin a bien franchi l'auth.
    const admin = await api.post('/api/inventory/intune/sync', { token: tokenAdmin });
    assert.equal(admin.status, 404);
  });
});

describe('les autres routes parsent toujours le JSON', () => {
  test('création de catégorie via JSON', async () => {
    const res = await api.post('/api/categories', {
      token: tokenAdmin,
      body: { name: 'Réseau' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.name, 'Réseau');
  });

  test('un corps JSON trop gros hors inventaire est refusé en 413', async () => {
    const res = await api.post('/api/categories', {
      token: tokenAdmin,
      body: { name: 'x'.repeat(200 * 1024) },
    });
    assert.equal(res.status, 413);
  });
});
