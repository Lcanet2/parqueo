import 'dotenv/config';
import { verifierEnvOuQuitter } from './lib/env.js';
import { createApp } from './app.js';
import { startAutoClose } from './services/autoclose.js';
import { startMailbox } from './services/mailbox.js';
import { startIntuneSync } from './services/intune.js';
import { startSnmpScan } from './services/snmp.js';

// Dernier filet : une erreur qui échapperait au middleware d'erreur (tâche de
// fond, callback hors requête) est journalisée sans emporter le processus.
process.on('unhandledRejection', (err) => {
  console.error('[rejet non géré]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[exception non capturée]', err);
});

// Avant toute chose : mieux vaut refuser de démarrer avec un message clair que
// servir une API qui échouera à la première connexion.
verifierEnvOuQuitter();

const app = createApp();

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Parqueo API en écoute sur http://localhost:${port}`);
  startAutoClose();
  startMailbox();
  startIntuneSync();
  startSnmpScan();
});
