// Visibilité des tickets par rôle : user → ses tickets ; technicien → équipe +
// assignés + non assignés ; admin → tout. Extrait dans un module pur pour être testable.
export function visibilityWhere(user) {
  if (user.role === 'admin') return {};
  if (user.role === 'technician') {
    const or = [{ assigneeId: user.sub }, { assigneeId: null }];
    if (user.teamId) or.push({ teamId: user.teamId });
    return { OR: or };
  }
  return { authorId: user.sub };
}
