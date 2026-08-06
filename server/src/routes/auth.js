import { Router } from '../lib/router.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import {
  ssoEnabled,
  buildAuthUrl,
  exchangeCode,
  verifyIdToken,
  allowedDomains,
  postLoginUrl,
  newNonce,
} from '../services/oidc.js';
import { intuneEnabled } from '../services/intune.js';
import { snmpEnabled } from '../services/snmp.js';
import { text } from '../lib/input.js';

const router = Router();

function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, teamId: user.teamId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Le client interroge cet endpoint pour savoir s'il doit afficher le bouton SSO
// et, côté admin, le bouton de synchronisation Intune.
router.get('/config', (req, res) => {
  res.json({ sso: ssoEnabled(), intune: intuneEnabled(), snmp: snmpEnabled() });
});

router.post('/login', async (req, res) => {
  // Les comptes sont stockés en minuscules (création, import, SSO) : on
  // normalise à l'identique, sinon « Admin@… » ne peut pas se connecter.
  const email = text(req.body.email).toLowerCase();
  const { password } = req.body;

  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  // Compte SSO (pas de mot de passe local) : on oriente vers la connexion Microsoft.
  if (!user.passwordHash) {
    return res.status(401).json({ error: 'Ce compte utilise la connexion Microsoft.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }

  res.json({ token: issueToken(user), user: toPublicUser(user) });
});

// --- SSO Microsoft Entra ID (OIDC) ---

// Démarre le flux : redirige vers Entra. Le state signé porte le nonce (anti-rejeu),
// ce qui évite tout stockage de session côté serveur.
router.get('/sso/login', async (req, res) => {
  if (!ssoEnabled()) return res.status(404).json({ error: 'SSO non configuré' });
  try {
    const nonce = newNonce();
    const state = jwt.sign({ nonce, purpose: 'sso' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    res.redirect(await buildAuthUrl({ state, nonce }));
  } catch (err) {
    res.redirect(`${postLoginUrl()}?sso_error=${encodeURIComponent(err.message)}`);
  }
});

// Retour d'Entra : on valide, on retrouve/crée le compte, on émet notre JWT, puis
// on renvoie le navigateur vers le client avec le jeton dans l'URL.
router.get('/sso/callback', async (req, res) => {
  const back = (params) => res.redirect(`${postLoginUrl()}?${params}`);
  if (!ssoEnabled()) return res.status(404).json({ error: 'SSO non configuré' });

  const { code, state, error, error_description } = req.query;
  if (error) return back(`sso_error=${encodeURIComponent(error_description || error)}`);
  if (!code || !state) return back('sso_error=Réponse+SSO+incomplète');

  try {
    // 1. Valider le state (et récupérer le nonce attendu).
    let nonce;
    try {
      const payload = jwt.verify(state, process.env.JWT_SECRET);
      if (payload.purpose !== 'sso') throw new Error('bad');
      nonce = payload.nonce;
    } catch {
      return back('sso_error=Session+SSO+expirée,+réessayez');
    }

    // 2. Échanger le code et vérifier le jeton d'identité.
    const tokens = await exchangeCode(code);
    const claims = await verifyIdToken(tokens.id_token, nonce);

    const email = String(claims.email || claims.preferred_username || '').toLowerCase();
    if (!email) return back('sso_error=Aucune+adresse+email+dans+le+compte');

    // 3. Garde-fou optionnel : domaines autorisés.
    const domains = allowedDomains();
    if (domains.length && !domains.includes(email.split('@')[1])) {
      return back('sso_error=Domaine+non+autorisé');
    }

    // 4. Provisioning JIT : compte créé à la première connexion en rôle « user ».
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: claims.name || email,
          role: 'user',
          provider: 'entra',
          passwordHash: null,
        },
      });
    }

    return back(`sso_token=${issueToken(user)}`);
  } catch (err) {
    return back(`sso_error=${encodeURIComponent(err.message)}`);
  }
});

router.get('/me', authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }
  res.json(toPublicUser(user));
});

// Changement de mot de passe par le titulaire du compte — jusqu'ici seul un
// admin pouvait le faire, ce qui obligeait à ouvrir un ticket pour ça.
// L'ancien mot de passe est exigé : un poste laissé déverrouillé ne doit pas
// suffire à confisquer le compte.
router.patch('/password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (!user.passwordHash) {
    return res.status(400).json({
      error: 'Ce compte utilise la connexion Microsoft : le mot de passe se change côté Microsoft.',
    });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l’ancien' });
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  res.json({ ok: true });
});

export default router;
