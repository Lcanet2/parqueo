// Page à rouvrir après la connexion.
//
// Un lien reçu par email (« Voir le ticket ») mène à /tickets/12 ; sans session,
// l'application passe par l'écran de connexion — puis revenait sur l'accueil,
// et le lien n'avait servi à rien. La page demandée est mémorisée au passage
// et rouverte une fois connecté, que ce soit par mot de passe ou par le SSO
// (qui recharge l'application : d'où sessionStorage plutôt qu'un état React).
//
// sessionStorage peut être indisponible (navigation privée stricte) : on perd
// alors seulement ce confort.

const CLE = 'parqueo:apres-connexion';

// Seuls les chemins internes sont acceptés : une valeur venue d'ailleurs ne
// doit pas pouvoir renvoyer vers un autre site.
const estInterne = (chemin) => typeof chemin === 'string' && chemin.startsWith('/') && !chemin.startsWith('//');

export function memoriserRetour(chemin) {
  if (!estInterne(chemin) || chemin === '/' || chemin.startsWith('/login')) return;
  try {
    sessionStorage.setItem(CLE, chemin);
  } catch {
    /* stockage indisponible */
  }
}

// Page mémorisée, ou null. Lecture seule : appelée pendant le rendu, elle doit
// pouvoir l'être deux fois de suite (StrictMode) sans changer de réponse.
export function lireRetour() {
  try {
    const chemin = sessionStorage.getItem(CLE);
    return estInterne(chemin) ? chemin : null;
  } catch {
    return null;
  }
}

// Une fois la page rouverte, on l'oublie. Idempotent.
export function oublierRetour() {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible */
  }
}
