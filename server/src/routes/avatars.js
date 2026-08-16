import path from 'node:path';
import { existsSync } from 'node:fs';
import { Router } from '../lib/router.js';

// Service des photos de profil.
//
// Cette route n'exige pas de jeton, et c'est un choix, pas un oubli.
//
// Le client s'authentifie par un en-tête `Authorization: Bearer`, qu'une balise
// <img> ne sait pas envoyer. Il faudrait donc, pour chaque photo, un fetch
// authentifié converti en object URL — le motif déjà utilisé pour les pièces
// jointes d'un ticket, où il y en a deux ou trois. Une liste de tickets affiche
// jusqu'à cent photos : autant de requêtes, aucune mise en cache par le
// navigateur, et un rendu qui saccade.
//
// L'accès est donc protégé par le nom du fichier lui-même : 32 caractères
// hexadécimaux tirés au hasard, stockés sur l'utilisateur. Connaître un
// identifiant de compte ne permet pas de deviner l'adresse de sa photo, et le
// nom change à chaque envoi — ce qui purge aussi le cache du navigateur.
//
// Ce que ce choix concède : quelqu'un qui obtient l'adresse complète (journaux
// du proxy, historique, partage) peut voir la photo sans être connecté. Pour une
// photo de trombinoscope interne, l'échange est raisonnable. Il ne le serait pas
// pour une pièce jointe de ticket, qui reste authentifiée.

const router = Router();

export const DOSSIER_AVATARS = 'uploads/avatars';

// Le nom est produit par le serveur : on n'accepte à la lecture que la forme
// exacte qu'il génère. Aucun `..`, aucun séparateur, aucune extension exotique
// ne peut donc traverser — la validation vaut garde-fou contre la traversée de
// répertoire, sans avoir à raisonner sur la normalisation des chemins.
const NOM_VALIDE = /^[0-9a-f]{32}\.(png|jpe?g|webp|gif)$/;

router.get('/:fichier', (req, res) => {
  const { fichier } = req.params;
  if (!NOM_VALIDE.test(fichier)) {
    return res.status(404).json({ error: 'Photo introuvable' });
  }

  const chemin = path.resolve(DOSSIER_AVATARS, fichier);
  if (!existsSync(chemin)) {
    return res.status(404).json({ error: 'Photo introuvable' });
  }

  // Immuable : le contenu d'un nom donné ne change jamais, un nouvel envoi
  // produit un nouveau nom.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(chemin);
});

export default router;
