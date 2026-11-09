import crypto from 'node:crypto';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import multer from 'multer';
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
import { DOSSIER_AVATARS } from './avatars.js';
import { signerSession } from '../lib/session.js';
import { identiteEntra, decisionRattachement } from '../lib/sso.js';

const router = Router();

// --- Photo de profil ---------------------------------------------------------

const EXTENSIONS_IMAGE = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

// 2 Mo : une photo de profil s'affiche à 32 px de côté. La borne est large pour
// accepter un cliché de téléphone sans retouche, mais l'image est servie telle
// quelle — aucune bibliothèque de redimensionnement n'est embarquée, et en
// ajouter une (binaire natif) pour ce seul usage coûterait plus qu'elle
// n'apporte.
const TAILLE_MAX_AVATAR = 2 * 1024 * 1024;

mkdirSync(DOSSIER_AVATARS, { recursive: true });

const envoiAvatar = multer({
  storage: multer.diskStorage({
    destination: DOSSIER_AVATARS,
    // 32 caractères hexadécimaux : c'est ce nom qui protège l'accès, il ne doit
    // rien laisser deviner du compte auquel la photo appartient.
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(16).toString('hex') + EXTENSIONS_IMAGE[file.mimetype]),
  }),
  limits: { fileSize: TAILLE_MAX_AVATAR },
  // Le type déclaré fait foi pour l'extension écrite sur le disque : on
  // n'accepte donc que ceux qu'on sait nommer.
  fileFilter: (req, file, cb) => cb(null, Boolean(EXTENSIONS_IMAGE[file.mimetype])),
});

// Retire l'ancien fichier après remplacement ou suppression : sans ça, le volume
// accumule une image par changement de photo, pour toujours.
async function oublierAncienne(nom) {
  if (!nom) return;
  await unlink(path.resolve(DOSSIER_AVATARS, nom)).catch(() => {});
}

function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

function issueToken(user) {
  return signerSession(user);
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
  // Après le mot de passe seulement : le motif n'est révélé qu'au titulaire.
  if (!user.active) {
    return res.status(403).json({ error: 'Ce compte est désactivé. Contactez l’administration.' });
  }

  res.json({ token: issueToken(user), user: toPublicUser(user) });
});

// --- SSO Microsoft Entra ID (OIDC) ---

// Lien entre le départ du flux et son retour, dans CE navigateur.
//
// Le state signé prouve que Parqueo a émis la demande, pas que c'est ce
// navigateur qui l'a lancée. Sans ce lien, un attaquant démarrait un flux avec
// son propre compte Microsoft, gardait l'URL de retour et la faisait ouvrir à
// sa victime : celle-ci se retrouvait connectée au compte de l'attaquant, et
// tout ce qu'elle saisissait ensuite (tickets, pièces jointes) lui revenait.
// Le nonce du state est donc aussi posé dans un cookie ; au retour, les deux
// doivent correspondre.
//
// SameSite=Lax : le cookie accompagne la redirection d'Entra vers le callback
// (navigation de premier niveau en GET), jamais une requête tierce.
const COOKIE_SSO = 'parqueo_sso';

function cookieSso(req, valeur, maxAge) {
  return [
    `${COOKIE_SSO}=${valeur}`,
    'Path=/api/auth/sso',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    // req.secure suit X-Forwarded-Proto derrière le proxy (trust proxy).
    ...(req.secure ? ['Secure'] : []),
  ].join('; ');
}

function lireCookie(req, nom) {
  for (const morceau of (req.headers.cookie ?? '').split(';')) {
    const i = morceau.indexOf('=');
    if (i > 0 && morceau.slice(0, i).trim() === nom) return morceau.slice(i + 1).trim();
  }
  return '';
}

const memeValeur = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Démarre le flux : redirige vers Entra. Le state signé porte le nonce (anti-rejeu),
// ce qui évite tout stockage de session côté serveur.
router.get('/sso/login', async (req, res) => {
  if (!ssoEnabled()) return res.status(404).json({ error: 'SSO non configuré' });
  try {
    const nonce = newNonce();
    const state = jwt.sign({ nonce, purpose: 'sso' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const url = await buildAuthUrl({ state, nonce });
    res.setHeader('Set-Cookie', cookieSso(req, nonce, 600));
    res.redirect(url);
  } catch (err) {
    res.redirect(`${postLoginUrl()}?sso_error=${encodeURIComponent(err.message)}`);
  }
});

// Retour d'Entra : on valide, on retrouve/crée le compte, on émet notre JWT, puis
// on renvoie le navigateur vers le client avec le jeton dans le fragment de l'URL.
router.get('/sso/callback', async (req, res) => {
  const back = (params) => res.redirect(`${postLoginUrl()}?${params}`);
  if (!ssoEnabled()) return res.status(404).json({ error: 'SSO non configuré' });

  // Usage unique, quelle que soit l'issue.
  const nonceNavigateur = lireCookie(req, COOKIE_SSO);
  res.setHeader('Set-Cookie', cookieSso(req, '', 0));

  const { code, state, error, error_description } = req.query;
  if (error) return back(`sso_error=${encodeURIComponent(error_description || error)}`);
  if (!code || !state) return back('sso_error=Réponse+SSO+incomplète');

  try {
    // 1. Valider le state (et récupérer le nonce attendu).
    let nonce;
    try {
      const payload = jwt.verify(state, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload.purpose !== 'sso') throw new Error('bad');
      nonce = payload.nonce;
    } catch {
      return back('sso_error=Session+SSO+expirée,+réessayez');
    }
    // Ce retour doit conclure un flux lancé depuis ce navigateur (voir COOKIE_SSO).
    if (!memeValeur(nonceNavigateur, nonce)) {
      console.warn('[sso] retour refusé : il ne correspond à aucune connexion lancée depuis ce navigateur');
      return back('sso_error=Connexion+non+initiée+depuis+ce+navigateur,+réessayez');
    }

    // 2. Échanger le code et vérifier le jeton d'identité.
    const tokens = await exchangeCode(code);
    const claims = await verifyIdToken(tokens.id_token, nonce);

    const identite = identiteEntra(claims);
    if (!identite) return back('sso_error=Identité+Microsoft+incomplète');
    const { email } = identite;
    if (!email) return back('sso_error=Aucune+adresse+email+dans+le+compte');

    // 3. Garde-fou optionnel : domaines autorisés.
    const domains = allowedDomains();
    if (domains.length && !domains.includes(email.split('@')[1])) {
      return back('sso_error=Domaine+non+autorisé');
    }

    // 4. Compte désigné par l'identité Entra ; l'email ne sert qu'au premier
    // rattachement, et jamais pour un invité (voir lib/sso.js).
    const parSujet = await prisma.user.findUnique({ where: { ssoSubject: identite.subject } });
    const parEmail = parSujet ? null : await prisma.user.findUnique({ where: { email } });
    const decision = decisionRattachement({ identite, parSujet, parEmail });

    let user;
    if (decision.action === 'refuser') {
      console.warn(`[sso] connexion refusée pour ${email} (${identite.subject}) : ${decision.raison}`);
      return back(`sso_error=${encodeURIComponent(decision.raison)}`);
    } else if (decision.action === 'ouvrir') {
      user = decision.user;
    } else if (decision.action === 'rattacher') {
      user = await prisma.user.update({
        where: { id: decision.user.id },
        data: { ssoSubject: identite.subject },
      });
      console.log(`[sso] compte #${user.id} (${email}) rattaché à ${identite.subject}`);
    } else {
      // Provisioning JIT : compte créé à la première connexion en rôle « user ».
      user = await prisma.user.create({
        data: {
          email,
          name: claims.name || email,
          role: 'user',
          provider: 'entra',
          ssoSubject: identite.subject,
          passwordHash: null,
        },
      });
    }

    if (!user.active) {
      console.warn(`[sso] connexion refusée pour ${email} : compte désactivé`);
      return back('sso_error=Compte+désactivé,+contactez+l’administration');
    }

    // Dans le fragment (#), jamais dans la requête : un fragment n'est envoyé à
    // aucun serveur, il ne finit donc ni dans les journaux du proxy ni dans un
    // en-tête Referer.
    return res.redirect(`${postLoginUrl()}#sso_token=${issueToken(user)}`);
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

  // Les autres sessions (autre navigateur, poste oublié, jeton volé) tombent
  // avec l'ancien mot de passe ; celle-ci reçoit un nouveau jeton.
  const misAJour = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } },
  });
  res.json({ ok: true, token: issueToken(misAJour) });
});

// Chacun gère sa propre photo : passer par un administrateur pour changer son
// portrait n'aurait aucun sens.
router.post('/avatar', authRequired, envoiAvatar.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image attendue : PNG, JPEG, WebP ou GIF, 2 Mo maximum' });
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!utilisateur) {
    await oublierAncienne(req.file.filename);
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  const misAJour = await prisma.user.update({
    where: { id: utilisateur.id },
    data: { avatar: req.file.filename },
  });
  await oublierAncienne(utilisateur.avatar);

  res.json(toPublicUser(misAJour));
});

router.delete('/avatar', authRequired, async (req, res) => {
  const utilisateur = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!utilisateur) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const misAJour = await prisma.user.update({
    where: { id: utilisateur.id },
    data: { avatar: null },
  });
  await oublierAncienne(utilisateur.avatar);

  res.json(toPublicUser(misAJour));
});

export default router;
