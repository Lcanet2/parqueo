// Lecture défensive du corps des requêtes.

// Longueurs maximales des champs texte. Sans plafond, un titre de 50 000
// caractères était accepté : il casse la mise en page de toutes les listes et
// gonfle la base. Les valeurs sont larges — elles arrêtent l'abus, pas l'usage.
export const LIMITS = {
  titre: 200,
  description: 20000,
  commentaire: 20000,
  nom: 120, // catégories, équipes, workflows, actifs, formulaires
  libelle: 200, // libellés de champs de formulaire, emplacements
  articleTitre: 200,
  articleCorps: 100000,
};

// Champ texte : une valeur non-string (nombre, objet, tableau envoyés par un
// client buggé ou malveillant) ne doit pas faire lever `.trim()`. Renvoie
// toujours une chaîne, éventuellement vide — les contrôles « requis » existants
// la rejettent alors normalement, avec leur message métier.
export function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Coupe au besoin. Réservé aux entrées qu'on ne peut pas refuser (email
// entrant) : sur l'API, on préfère un 400 explicite à une troncature muette.
export function tronque(value, max) {
  const s = text(value);
  return s.length > max ? s.slice(0, max) : s;
}

// Vérifie la longueur d'un ensemble de champs. Renvoie un message d'erreur
// prêt à afficher, ou null. Usage :
//   const trop = tropLong({ Titre: [titre, LIMITS.titre] });
//   if (trop) return res.status(400).json({ error: trop });
export function tropLong(champs) {
  for (const [nom, [valeur, max]] of Object.entries(champs)) {
    if (typeof valeur === 'string' && valeur.length > max) {
      return `${nom} : ${max} caractères maximum (${valeur.length} reçus)`;
    }
  }
  return null;
}

// Identifiant numérique optionnel venant du corps : entier positif, ou null.
export function id(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Entier de pagination borné : « 1e400 » vaut Infinity, ce que la base refuse.
export function entierBorne(value, { defaut = 1, min = 1, max = 1_000_000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
