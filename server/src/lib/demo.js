// Mode démonstration.
//
// Parqueo suppose partout que le rôle « administrateur » est de confiance : il
// peut faire émettre des requêtes sortantes par le serveur (webhook de
// workflow), envoyer du courrier, scanner le réseau. C'est un arbitrage
// raisonnable pour un outil installé dans une entreprise.
//
// Une instance publique de démonstration donne ce rôle à des inconnus, et
// l'hypothèse tombe. DEMO_MODE neutralise donc précisément ce dont la sûreté
// reposait sur cette confiance :
//
//   • webhook de workflow — sinon le serveur POSTe vers l'adresse de son choix,
//     y compris une IP interne ou le service de métadonnées du fournisseur ;
//   • courrier sortant — sinon la démo devient un relais d'envoi ;
//   • collecteur IMAP, scan SNMP, synchronisation Intune — accès réseau depuis
//     l'hôte, sans rapport avec ce qu'une démonstration doit montrer ;
//   • envoi de photo de profil — c'est le seul fichier servi sans jeton (voir
//     routes/avatars.js), donc le seul qui ferait du domaine un hébergeur
//     d'images anonyme. Les pièces jointes de tickets restent actives : elles
//     ne se téléchargent qu'authentifié.
//
// Tout le reste — tickets, inventaire, workflows, catalogue, base de
// connaissances — fonctionne normalement : c'est ce qu'on vient voir.

export const demoActif = () => process.env.DEMO_MODE === 'true';

// Réponse commune aux actions désactivées : un message qui explique, plutôt
// qu'une erreur générique laissant croire à une panne.
export function refusDemo(res) {
  return res.status(403).json({
    error: 'Action désactivée sur l’instance de démonstration.',
  });
}
