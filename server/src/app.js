import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import assetRoutes from './routes/assets.js';
import inventoryRoutes from './routes/inventory.js';
import softwareRoutes from './routes/software.js';
import userRoutes from './routes/users.js';
import workflowRoutes from './routes/workflows.js';
import refRoutes from './routes/refs.js';
import formRoutes from './routes/forms.js';
import kbRoutes from './routes/kb.js';
import settingsRoutes from './routes/settings.js';

// Construction de l'application Express, séparée du démarrage (src/index.js) :
// les tests montent l'app sur un port éphémère sans lancer les tâches de fond.

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_ORIGIN }));

  // Monté AVANT le parseur JSON global, et c'est volontaire : les routes
  // d'ingestion déclarent leurs propres parseurs avec des limites bien plus
  // hautes (un inventaire réel pèse plusieurs centaines de ko à quelques Mo).
  // Un express.json() global les court-circuiterait et plafonnerait tout à
  // 100 ko — les agents recevraient un 413 sans explication.
  app.use('/api/inventory', inventoryRoutes);

  app.use(express.json());

  // Frein brute-force sur le login uniquement — le reste de l'API est derrière JWT.
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      // Seuls les échecs comptent : toute une équipe derrière la même IP (NAT)
      // ne doit pas se retrouver bloquée par ses logins légitimes.
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Trop de tentatives, réessayez dans 15 minutes' },
    })
  );

  // Déclarée avant les routeurs montés sur /api, sinon leur authRequired l'intercepte.
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/software', softwareRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/workflows', workflowRoutes);
  app.use('/api/forms', formRoutes);
  app.use('/api/kb', kbRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api', refRoutes);

  // Route d'API inconnue : réponse JSON, pas la page HTML par défaut d'Express.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

  app.use(errorHandler);

  return app;
}

// Middleware d'erreur unique. Sans lui, une erreur dans un handler `async`
// remonte en rejet non géré et tue le processus (Node 20+). Toute erreur arrive
// ici via le routeur de lib/router.js.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const { status, error } = describeError(err);

  // Les 5xx sont des bugs : on les journalise avec la pile. Les 4xx sont des
  // requêtes malformées, une ligne suffit.
  if (status >= 500) {
    console.error(`[erreur] ${req.method} ${req.originalUrl} →`, err);
  } else {
    console.warn(`[requête refusée] ${req.method} ${req.originalUrl} → ${status} ${error}`);
  }

  res.status(status).json({ error });
}

function describeError(err) {
  // --- Corps de requête (body-parser) ---
  if (err.type === 'entity.parse.failed') return { status: 400, error: 'JSON invalide' };
  if (err.type === 'entity.too.large') return { status: 413, error: 'Corps de requête trop volumineux' };

  // --- Multer (pièces jointes) ---
  if (err.name === 'MulterError') {
    return {
      status: 400,
      error:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Fichier trop volumineux (10 Mo maximum)'
          : 'Envoi de fichier invalide',
    };
  }

  // --- Prisma ---
  // Arguments qui ne correspondent pas au schéma (type inattendu, NaN…).
  if (err.name === 'PrismaClientValidationError') {
    return { status: 400, error: 'Requête invalide' };
  }
  if (err.name === 'PrismaClientKnownRequestError') {
    switch (err.code) {
      case 'P2002':
        return { status: 409, error: 'Cette valeur existe déjà' };
      case 'P2003':
        return { status: 400, error: 'Référence inconnue' };
      case 'P2025':
        return { status: 404, error: 'Ressource introuvable' };
      default:
        return { status: 400, error: 'Requête refusée par la base de données' };
    }
  }
  if (err.name === 'PrismaClientInitializationError') {
    return { status: 503, error: 'Base de données indisponible' };
  }

  // --- Types inattendus dans le corps (ex. « titre » reçu en nombre) ---
  if (err instanceof TypeError) return { status: 400, error: 'Requête invalide' };

  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return { status: err.status, error: err.message || 'Requête invalide' };
  }

  return { status: 500, error: 'Erreur interne' };
}
