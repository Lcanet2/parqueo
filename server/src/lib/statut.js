// Règles de transition automatique de statut — extraites pour être testables et
// partagées par les deux chemins qui assignent un ticket : l'API (un technicien
// s'attribue le ticket) et le moteur de workflows (bloc « assigner »).

// Invariant : **un ticket qui a un assigné n'est jamais « Nouveau »**.
//
// C'est le comportement de GLPI : attribuer un ticket le fait passer de
// « Nouveau » à « En cours ». Sans cette règle, un ticket pouvait être traité
// depuis des jours tout en restant affiché « Nouveau » — et les compteurs
// « à traiter » comptaient du travail déjà commencé.
//
// On ne touche qu'aux tickets « Nouveau » : assigner un ticket résolu ou fermé
// ne le rouvre pas, et un ticket « En attente » reste en attente (c'est une
// information sur le blocage, pas sur la prise en charge).
//
// Renvoie le nouveau statut, ou null s'il n'y a rien à changer.
export function statutApresAssignation(statutActuel, assigneId) {
  return assigneId && statutActuel === 'new' ? 'in_progress' : null;
}
