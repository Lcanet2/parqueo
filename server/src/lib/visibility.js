// Visibilité des tickets par rôle : user → ses tickets ; technicien → les siens
// (créés ou assignés) + ceux de son équipe + les non assignés ; admin → tout.
// Extrait dans un module pur pour être testable.
export function visibilityWhere(user) {
  if (user.role === 'admin') return {};
  if (user.role === 'technician') {
    // authorId est indispensable : sans lui, un technicien perdait l'accès au
    // ticket qu'il avait lui-même ouvert dès qu'il était assigné à quelqu'un
    // d'une autre équipe.
    const or = [{ authorId: user.sub }, { assigneeId: user.sub }, { assigneeId: null }];
    if (user.teamId) or.push({ teamId: user.teamId });
    return { OR: or };
  }
  return { authorId: user.sub };
}
