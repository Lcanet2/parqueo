// Chargé en premier par les tests d'API : bascule la connexion sur la base de
// test avant que lib/prisma.js n'instancie le client. Les imports ESM sont
// évalués dans l'ordre de déclaration, d'où l'obligation d'importer ce module
// avant tout module de src/.
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL absent : impossible de déterminer la base de test');
}

// TEST_DATABASE_URL explicite, sinon la base « <base>_test » du même serveur.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/parqueo_test';
  process.env.DATABASE_URL = url.toString();
}

// Garde-fou : ne jamais laisser une suite de tests truncater une base de travail.
if (!/test/.test(new URL(process.env.DATABASE_URL).pathname)) {
  throw new Error(`Base de test suspecte : ${new URL(process.env.DATABASE_URL).pathname}`);
}

process.env.JWT_SECRET ??= 'secret-de-test';
process.env.INVENTORY_TOKEN = 'jeton-inventaire-de-test';
process.env.SMTP_HOST = ''; // aucun email réellement envoyé
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
