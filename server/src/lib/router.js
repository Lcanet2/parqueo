import { Router as ExpressRouter } from 'express';

// Routeur Express « sûr par défaut ». Express 4 ne capte pas les rejets des
// handlers `async` : une promesse rejetée devient un rejet non géré, et Node 20+
// tue le processus. Ce routeur enveloppe chaque handler pour renvoyer l'erreur
// au middleware d'erreur (src/app.js) au lieu de laisser fuir le rejet.
//
// Utilisation : `import { Router } from '../lib/router.js'` à la place d'express.

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

// Un routeur/app monté est lui-même une fonction : on ne l'enveloppe pas.
const isMounted = (fn) => typeof fn.handle === 'function' || typeof fn.stack === 'object';

function wrap(fn) {
  if (typeof fn !== 'function') return fn; // chaîne de caractères (chemin), tableau…
  if (fn.length === 4) return fn; // middleware d'erreur : signature à préserver
  if (isMounted(fn)) return fn;

  return function wrapped(req, res, next) {
    try {
      const out = fn.call(this, req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

// Un identifiant d'URL doit être un entier positif. Sans ce garde-fou,
// `Number('abc')` vaut NaN et Prisma lève une erreur de validation ; on répond
// 404, la ressource demandée ne pouvant de toute façon pas exister.
function validateId(req, res, next, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return res.status(404).json({ error: 'Identifiant invalide' });
  }
  next();
}

// Paramètres d'URL traités comme des identifiants numériques.
const ID_PARAMS = ['id', 'attachmentId'];

export function Router(options) {
  const router = ExpressRouter(options);

  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map(wrap));
  }

  for (const param of ID_PARAMS) router.param(param, validateId);

  return router;
}
