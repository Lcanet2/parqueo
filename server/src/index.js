import 'dotenv/config';
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
import { startAutoClose } from './services/autoclose.js';
import { startMailbox } from './services/mailbox.js';
import { startIntuneSync } from './services/intune.js';
import { startSnmpScan } from './services/snmp.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
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
app.use('/api/inventory', inventoryRoutes);
app.use('/api/software', softwareRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', refRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Parqueo API en écoute sur http://localhost:${port}`);
  startAutoClose();
  startMailbox();
  startIntuneSync();
  startSnmpScan();
});
