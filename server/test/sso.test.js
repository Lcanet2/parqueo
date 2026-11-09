import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { startServer, resetDb, seedBasics, disconnect, prisma } from './helpers.js';

// Retour SSO de bout en bout, avec un faux Entra : découverte, JWKS et échange
// du code sont simulés, mais la signature RS256 du jeton d'identité est réelle
// et vérifiée par services/oidc.js.

const TID = '11111111-1111-1111-1111-111111111111';
const AUTRE_TID = '22222222-2222-2222-2222-222222222222';
const CLIENT_ID = 'parqueo-test';
const ISSUER = `https://login.microsoftonline.com/${TID}/v2.0`;
const KID = 'cle-de-test';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };

let api, ctx, idTokenSuivant;
const fetchOrigine = globalThis.fetch;

before(async () => {
  Object.assign(process.env, {
    SSO_TENANT_ID: TID,
    SSO_CLIENT_ID: CLIENT_ID,
    SSO_CLIENT_SECRET: 'secret',
  });
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    const json = (data) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/.well-known/openid-configuration')) {
      return json({
        issuer: ISSUER,
        authorization_endpoint: 'https://entra.test/authorize',
        token_endpoint: 'https://entra.test/token',
        jwks_uri: 'https://entra.test/keys',
      });
    }
    if (u === 'https://entra.test/keys') return json({ keys: [jwk] });
    if (u === 'https://entra.test/token') return json({ id_token: idTokenSuivant });
    return fetchOrigine(url, options);
  };

  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
});
after(async () => {
  globalThis.fetch = fetchOrigine;
  await api.close();
  await disconnect();
});

// Simule un aller-retour complet vers Entra pour ces claims ; renvoie les
// paramètres du fragment et de la requête de l'URL de retour.
async function connexion(claims) {
  const nonce = crypto.randomBytes(8).toString('hex');
  const state = jwt.sign({ nonce, purpose: 'sso' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  idTokenSuivant = jwt.sign({ ...claims, nonce, tid: claims.tid ?? TID }, privateKey, {
    algorithm: 'RS256',
    keyid: KID,
    audience: CLIENT_ID,
    issuer: ISSUER,
    expiresIn: '5m',
  });
  const res = await fetchOrigine(`${api.base}/api/auth/sso/callback?code=c&state=${state}`, {
    redirect: 'manual',
  });
  assert.equal(res.status, 302);
  const retour = new URL(res.headers.get('location'));
  return {
    token: new URLSearchParams(retour.hash.slice(1)).get('sso_token'),
    erreur: retour.searchParams.get('sso_error'),
    requete: retour.search,
  };
}

const moi = (token) => api.get('/api/auth/me', { token });

describe('retour SSO', () => {
  test('le jeton revient dans le fragment, jamais dans la requête', async () => {
    const r = await connexion({ oid: 'nouveau-1', email: 'nouveau@test.local', name: 'Nouveau' });
    assert.ok(r.token);
    assert.doesNotMatch(r.requete, /sso_token/);
  });

  test('première connexion : compte créé en rôle utilisateur, lié à l’identité', async () => {
    const r = await connexion({ oid: 'nouveau-2', email: 'nouveau2@test.local' });
    const me = (await moi(r.token)).data;
    assert.equal(me.role, 'user');
    assert.equal(me.ssoSubject, `${TID}:nouveau-2`);
  });

  test('un membre de l’annuaire se rattache à son compte local', async () => {
    const r = await connexion({ oid: 'oid-tech', email: ctx.tech.email });
    const me = (await moi(r.token)).data;
    assert.equal(me.id, ctx.tech.id);
    assert.equal(me.ssoSubject, `${TID}:oid-tech`);
  });

  test('un invité qui présente l’adresse de l’admin est refusé', async () => {
    const r = await connexion({
      oid: 'oid-pirate',
      email: ctx.admin.email,
      idp: `https://sts.windows.net/${AUTRE_TID}/`,
    });
    assert.equal(r.token, null);
    assert.match(r.erreur, /invité/);
    const admin = await prisma.user.findUnique({ where: { id: ctx.admin.id } });
    assert.equal(admin.ssoSubject, null, 'le compte admin n’est pas rattaché');
  });

  test('une adresse déjà liée ne passe pas à une autre identité', async () => {
    const r = await connexion({ oid: 'oid-usurpateur', email: ctx.tech.email });
    assert.equal(r.token, null);
    assert.match(r.erreur, /déjà liée/);
  });

  test('un compte lié se retrouve par son identité, même si l’email change', async () => {
    const r = await connexion({ oid: 'oid-tech', email: 'tech-renomme@test.local' });
    assert.equal((await moi(r.token)).data.id, ctx.tech.id);
  });

  test('un jeton d’identité sans oid est refusé', async () => {
    const r = await connexion({ email: 'sans-oid@test.local' });
    assert.equal(r.token, null);
    assert.match(r.erreur, /incomplète/);
  });

  test('un jeton signé par une autre clé est refusé', async () => {
    const nonce = 'n';
    const state = jwt.sign({ nonce, purpose: 'sso' }, process.env.JWT_SECRET);
    const autre = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    idTokenSuivant = jwt.sign({ oid: 'x', tid: TID, email: ctx.admin.email, nonce }, autre, {
      algorithm: 'RS256',
      keyid: KID,
      audience: CLIENT_ID,
      issuer: ISSUER,
    });
    const res = await fetchOrigine(`${api.base}/api/auth/sso/callback?code=c&state=${state}`, {
      redirect: 'manual',
    });
    const retour = new URL(res.headers.get('location'));
    assert.equal(new URLSearchParams(retour.hash.slice(1)).get('sso_token'), null);
    assert.ok(retour.searchParams.get('sso_error'));
  });
});
