// Lecture défensive du corps des requêtes.

// Champ texte : une valeur non-string (nombre, objet, tableau envoyés par un
// client buggé ou malveillant) ne doit pas faire lever `.trim()`. Renvoie
// toujours une chaîne, éventuellement vide — les contrôles « requis » existants
// la rejettent alors normalement, avec leur message métier.
export function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Identifiant numérique optionnel venant du corps : entier positif, ou null.
export function id(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
