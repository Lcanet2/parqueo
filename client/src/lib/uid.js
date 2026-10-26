// Identifiant aléatoire pour les éléments créés côté client (widgets, blocs de
// workflow).
//
// crypto.randomUUID n'existe qu'en contexte sécurisé : HTTPS ou localhost.
// Une installation sans domaine est servie en HTTP sur l'IP du serveur
// (http://192.168.x.y), où l'appel lève « crypto.randomUUID is not a function »
// et bloquait le tableau de bord sur son spinner. getRandomValues, lui, est
// disponible partout.
export function uid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
