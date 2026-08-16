import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { demoActif } from '../lib/demo.js';

// SSO Microsoft Entra ID via OpenID Connect (authorization code flow, client
// confidentiel). Aucune dépendance externe : découverte + JWKS récupérés par
// fetch, jeton d'identité vérifié avec le crypto natif + jsonwebtoken.
//
// Config (.env) : SSO_TENANT_ID, SSO_CLIENT_ID, SSO_CLIENT_SECRET requis pour
// activer. SSO_REDIRECT_URI (défaut APP_URL + /api/auth/sso/callback),
// SSO_ALLOWED_DOMAINS (liste optionnelle), SSO_POST_LOGIN_URL.

export function ssoEnabled() {
  if (demoActif()) return false; // voir lib/demo.js
  return Boolean(process.env.SSO_TENANT_ID && process.env.SSO_CLIENT_ID && process.env.SSO_CLIENT_SECRET);
}

export function redirectUri() {
  if (process.env.SSO_REDIRECT_URI) return process.env.SSO_REDIRECT_URI;
  const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`;
  return `${base}/api/auth/sso/callback`;
}

export function postLoginUrl() {
  return process.env.SSO_POST_LOGIN_URL || process.env.CLIENT_ORIGIN || '/';
}

export function allowedDomains() {
  return (process.env.SSO_ALLOWED_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

// --- Découverte OIDC + JWKS (mis en cache) ---
let discoveryCache = null;
let jwksCache = null;

async function discovery() {
  if (discoveryCache) return discoveryCache;
  const url = `https://login.microsoftonline.com/${process.env.SSO_TENANT_ID}/v2.0/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Découverte OIDC échouée (${res.status})`);
  discoveryCache = await res.json();
  return discoveryCache;
}

async function signingKey(kid) {
  if (!jwksCache) {
    const { jwks_uri } = await discovery();
    const res = await fetch(jwks_uri);
    if (!res.ok) throw new Error(`JWKS indisponible (${res.status})`);
    jwksCache = (await res.json()).keys;
  }
  let jwk = jwksCache.find((k) => k.kid === kid);
  if (!jwk) {
    // Rotation de clés : on rafraîchit une fois.
    jwksCache = null;
    const { jwks_uri } = await discovery();
    jwksCache = (await (await fetch(jwks_uri)).json()).keys;
    jwk = jwksCache.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('Clé de signature introuvable');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

// URL d'autorisation vers Entra. state (signé) transporte le nonce anti-rejeu.
export async function buildAuthUrl({ state, nonce }) {
  const { authorization_endpoint } = await discovery();
  const params = new URLSearchParams({
    client_id: process.env.SSO_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    nonce,
  });
  return `${authorization_endpoint}?${params}`;
}

// Échange du code contre les jetons (back-channel authentifié par le secret).
export async function exchangeCode(code) {
  const { token_endpoint } = await discovery();
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SSO_CLIENT_ID,
      client_secret: process.env.SSO_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Échange du code échoué');
  return data;
}

// Vérifie signature (JWKS), audience, issuer, expiration et nonce.
export async function verifyIdToken(idToken, expectedNonce) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded) throw new Error('Jeton d’identité illisible');
  const pem = await signingKey(decoded.header.kid);
  const { issuer } = await discovery();
  const claims = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    audience: process.env.SSO_CLIENT_ID,
    issuer,
  });
  if (claims.nonce !== expectedNonce) throw new Error('Nonce invalide');
  return claims;
}

export function newNonce() {
  return crypto.randomBytes(16).toString('hex');
}
