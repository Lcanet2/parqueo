import jwt from 'jsonwebtoken';

// Jetons de session.
//
// Le même JWT_SECRET signe aussi le `state` du SSO et les liens de satisfaction
// envoyés par email. Avant la 0.3.8, le middleware se contentait de vérifier la
// signature : ces jetons-là ouvraient donc l'API. Le `state` SSO, sans `sub`,
// donnait un filtre `{ authorId: undefined }` que Prisma ignore — tous les
// tickets à n'importe quel visiteur. D'où le type explicite, vérifié ici et
// nulle part ailleurs.
//
// `ver` recopie users.token_version : changer le mot de passe l'incrémente, ce
// qui invalide toutes les sessions ouvertes avec l'ancien.

const TYPE = 'session';
const DUREE = '7d';
const ALGORITHME = 'HS256';

export function signerSession(user) {
  return jwt.sign({ typ: TYPE, sub: user.id, ver: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, {
    algorithm: ALGORITHME,
    expiresIn: DUREE,
  });
}

// Renvoie { sub, ver } ou lève une erreur : signature, expiration, type et
// forme des champs sont tous contrôlés.
export function lireSession(token) {
  const p = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHME] });
  if (p?.typ !== TYPE || !Number.isInteger(p.sub) || p.sub < 1 || !Number.isInteger(p.ver)) {
    throw new Error('jeton qui n’est pas un jeton de session');
  }
  return { sub: p.sub, ver: p.ver };
}
