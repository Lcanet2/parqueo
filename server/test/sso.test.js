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

// Démarre un flux comme le ferait le navigateur : /sso/login renvoie vers
// Entra (state et nonce dans l'URL) et pose le cookie qui lie le retour à ce
// navigateur.
async function demarrer() {
  const res = await fetchOrigine(`${api.base}/api/auth/sso/login`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const vers = new URL(res.headers.get('location'));
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  assert.match(cookie, /^parqueo_sso=[0-9a-f]+$/, 'cookie de flux absent');
  return { state: vers.searchParams.get('state'), nonce: vers.searchParams.get('nonce'), cookie };
}

// Simule un aller-retour complet vers Entra pour ces claims ; renvoie les
// paramètres du fragment et de la requête de l'URL de retour. `flux` permet de
// rejouer un départ précis, `cookie` de remplacer celui du navigateur.
async function connexion(claims, { flux, cookie } = {}) {
  const depart = flux ?? (await demarrer());
  idTokenSuivant = jwt.sign({ ...claims, nonce: depart.nonce, tid: claims.tid ?? TID }, privateKey, {
    algorithm: 'RS256',
    keyid: KID,
    audience: CLIENT_ID,
    issuer: ISSUER,
    expiresIn: '5m',
  });
  const envoye = cookie === undefined ? depart.cookie : cookie;
  const res = await fetchOrigine(`${api.base}/api/auth/sso/callback?code=c&state=${depart.state}`, {
    redirect: 'manual',
    headers: envoye ? { Cookie: envoye } : {},
  });
  assert.equal(res.status, 302);
  const retour = new URL(res.headers.get('location'));
  return {
    token: new URLSearchParams(retour.hash.slice(1)).get('sso_token'),
    erreur: retour.searchParams.get('sso_error'),
    requete: retour.search,
    cookieRetour: res.headers.get('set-cookie') ?? '',
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

describe('retour lié au navigateur (CSRF de connexion)', () => {
  const claims = { oid: 'oid-csrf', email: 'csrf@test.local', name: 'Csrf' };

  test('un retour sans le cookie du flux est refusé', async () => {
    const r = await connexion(claims, { cookie: '' });
    assert.equal(r.token, null);
    assert.match(r.erreur, /navigateur/);
  });

  test('l’URL de retour d’un autre navigateur ne connecte pas la victime', async () => {
    // L'attaquant lance son propre flux et garde l'URL de retour…
    const fluxAttaquant = await demarrer();
    // … la victime a son propre cookie (ou aucun) : refus.
    const victime = await demarrer();
    const r = await connexion(claims, { flux: fluxAttaquant, cookie: victime.cookie });
    assert.equal(r.token, null);
    assert.match(r.erreur, /navigateur/);
  });

  test('le cookie est à usage unique', async () => {
    const r = await connexion(claims);
    assert.ok(r.token);
    assert.match(r.cookieRetour, /parqueo_sso=;.*Max-Age=0/);
  });

  test('le cookie est HttpOnly et SameSite=Lax', async () => {
    const res = await fetchOrigine(`${api.base}/api/auth/sso/login`, { redirect: 'manual' });
    const c = res.headers.get('set-cookie');
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Lax/);
    assert.match(c, /Path=\/api\/auth\/sso/);
  });
});

describe('compte désactivé', () => {
  test('la connexion Microsoft est refusée', async () => {
    const premiere = await connexion({ oid: 'oid-parti', email: 'parti@test.local', name: 'Parti' });
    assert.ok(premiere.token);
    await prisma.user.update({ where: { email: 'parti@test.local' }, data: { active: false } });
    const r = await connexion({ oid: 'oid-parti', email: 'parti@test.local', name: 'Parti' });
    assert.equal(r.token, null);
    assert.match(r.erreur, /désactivé/);
  });
});
