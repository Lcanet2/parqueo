// Contrôle des variables indispensables, au démarrage.
//
// Sans ce garde-fou, une API sans JWT_SECRET démarrait normalement et n'échouait
// qu'à la première tentative de connexion, sur une erreur de la bibliothèque JWT
// sans rapport apparent avec la configuration. Le diagnostic coûtait un aller-
// retour avec la personne qui installe ; il tient maintenant dans le premier
// message du journal.

const LONGUEUR_MIN_SECRET = 16;

export function verifierEnv(env = process.env) {
  const erreurs = [];

  if (!env.DATABASE_URL) {
    erreurs.push(
      'DATABASE_URL manquant — chaîne de connexion PostgreSQL, ex. ' +
        'postgresql://parqueo:motdepasse@localhost:5432/parqueo?schema=public'
    );
  }

  if (!env.JWT_SECRET) {
    erreurs.push(
      'JWT_SECRET manquant — secret de signature des jetons. Générez-en un avec : ' +
        'openssl rand -base64 48'
    );
  } else if (env.JWT_SECRET.length < LONGUEUR_MIN_SECRET) {
    erreurs.push(
      `JWT_SECRET trop court (${env.JWT_SECRET.length} caractères, ${LONGUEUR_MIN_SECRET} minimum) — ` +
        'un secret devinable permet de forger un jeton d’administrateur. ' +
        'Générez-en un avec : openssl rand -base64 48'
    );
  }

  return erreurs;
}

// Interrompt le démarrage plutôt que de servir une API qui échouera plus tard.
export function verifierEnvOuQuitter(env = process.env) {
  const erreurs = verifierEnv(env);
  if (erreurs.length === 0) return;

  console.error('\nParqueo ne peut pas démarrer :\n');
  for (const e of erreurs) console.error(`  • ${e}`);
  console.error('\nVoir server/.env.example pour la liste complète des variables.\n');
  process.exit(1);
}
