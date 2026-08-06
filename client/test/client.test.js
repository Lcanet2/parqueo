import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Stubs des globales du navigateur, posés avant l'import du module testé.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { api, ApiError, getToken, setToken, setUnauthorizedHandler } = await import(
  '../src/api/client.js'
);

// Fabrique une réponse fetch minimale.
const reply = (status, body, { json = true } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => {
    if (!json) throw new Error('pas du JSON');
    return body;
  },
});

let calls;
function stubFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
}

beforeEach(() => {
  store.clear();
  setUnauthorizedHandler(null);
});

describe('jeton', () => {
  test('setToken / getToken passent par localStorage', () => {
    assert.equal(getToken(), null);
    setToken('abc');
    assert.equal(getToken(), 'abc');
    setToken(null);
    assert.equal(getToken(), null);
  });

  test('le jeton est envoyé en en-tête Authorization', async () => {
    setToken('jeton-test');
    stubFetch(() => reply(200, { ok: true }));
    await api.get('/tickets');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer jeton-test');
  });

  test('sans jeton, aucun en-tête Authorization', async () => {
    stubFetch(() => reply(200, {}));
    await api.get('/auth/config');
    assert.equal(calls[0].init.headers.Authorization, undefined);
  });

  test('Content-Type JSON seulement quand il y a un corps', async () => {
    stubFetch(() => reply(200, {}));
    await api.get('/tickets');
    assert.equal(calls[0].init.headers['Content-Type'], undefined);
    await api.post('/tickets', { title: 'x' });
    assert.equal(calls[1].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[1].init.body, JSON.stringify({ title: 'x' }));
  });
});

describe('interception du 401', () => {
  test('un 401 purge la session et prévient l’application', async () => {
    setToken('jeton-expiré');
    let prévenu = 0;
    setUnauthorizedHandler(() => (prévenu += 1));
    stubFetch(() => reply(401, { error: 'Token invalide ou expiré' }));

    await assert.rejects(() => api.get('/tickets'), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 401);
      return true;
    });

    assert.equal(getToken(), null, 'le jeton doit être supprimé');
    assert.equal(prévenu, 1, 'le gestionnaire doit être appelé une fois');
  });

  test('un 401 sur le login ne coupe pas la session', async () => {
    setToken('jeton-valide');
    let prévenu = 0;
    setUnauthorizedHandler(() => (prévenu += 1));
    stubFetch(() => reply(401, { error: 'Identifiants invalides' }));

    await assert.rejects(() => api.post('/auth/login', { email: 'a@b.fr', password: 'x' }), {
      message: 'Identifiants invalides',
    });

    assert.equal(getToken(), 'jeton-valide', 'le jeton en place doit être conservé');
    assert.equal(prévenu, 0);
  });

  test('sans gestionnaire enregistré, le 401 ne fait pas planter l’appel', async () => {
    setToken('x');
    stubFetch(() => reply(401, { error: 'expiré' }));
    await assert.rejects(() => api.get('/tickets'), { status: 401 });
    assert.equal(getToken(), null);
  });
});

describe('erreurs', () => {
  test('serveur injoignable → ApiError réseau', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(() => api.get('/tickets'), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 0);
      assert.equal(err.isNetwork, true);
      assert.match(err.message, /injoignable/i);
      return true;
    });
  });

  test('le message d’erreur de l’API est repris tel quel', async () => {
    stubFetch(() => reply(400, { error: 'Titre, description et catégorie requis' }));
    await assert.rejects(() => api.post('/tickets', {}), {
      message: 'Titre, description et catégorie requis',
      status: 400,
    });
  });

  test('une réponse d’erreur non JSON donne un message par défaut', async () => {
    stubFetch(() => reply(502, null, { json: false }));
    await assert.rejects(() => api.get('/tickets'), { message: 'Erreur 502', status: 502 });
  });

  test('une erreur d’API n’est pas confondue avec une panne réseau', async () => {
    stubFetch(() => reply(500, { error: 'Erreur interne' }));
    await assert.rejects(() => api.get('/tickets'), (err) => {
      assert.equal(err.isNetwork, false);
      return true;
    });
  });

  test('ApiError est reconnaissable par son nom (filet global)', async () => {
    stubFetch(() => reply(404, { error: 'Introuvable' }));
    await assert.rejects(() => api.get('/tickets/9'), (err) => {
      assert.equal(err.name, 'ApiError');
      return true;
    });
  });
});

describe('réponses', () => {
  test('204 renvoie null', async () => {
    stubFetch(() => reply(204, null, { json: false }));
    assert.equal(await api.delete('/tickets/1'), null);
  });

  test('200 renvoie le corps décodé', async () => {
    stubFetch(() => reply(200, [{ id: 1 }]));
    assert.deepEqual(await api.get('/tickets'), [{ id: 1 }]);
  });

  test('upload envoie le FormData sans sérialisation', async () => {
    const fd = { marqueur: 'formdata' };
    stubFetch(() => reply(201, { id: 1 }));
    await api.upload('/tickets/1/attachments', fd);
    assert.equal(calls[0].init.body, fd);
    assert.equal(calls[0].init.headers['Content-Type'], undefined);
  });
});
