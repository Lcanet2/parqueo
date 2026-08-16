import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect } from './helpers.js';

// Version de l'instance : première question de tout échange de support.
// Elle ne doit pas être lisible sans être connecté — annoncer publiquement la
// version d'un logiciel auto-hébergé indique quelles failles connues essayer.

let api;
let jeton;

before(async () => {
  api = await startServer();
  await resetDb();
  const ctx = await seedBasics();
  jeton = await login(api, ctx.user.email);
});

after(async () => {
  await api.close();
  await disconnect();
});

describe('à propos', () => {
  test('sans authentification : 401', async () => {
    assert.equal((await api.get('/api/about')).status, 401);
  });

  test('authentifié : version et licence', async () => {
    const res = await api.get('/api/about', { token: jeton });
    assert.equal(res.status, 200);
    assert.match(res.data.version, /^\d+\.\d+\.\d+/, 'version sémantique');
    assert.equal(res.data.license, 'AGPL-3.0');
  });

  test('la sonde publique ne divulgue pas la version', async () => {
    const res = await api.get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { ok: true });
  });
});
