// Support = technicien ou administrateur. Toujours une liste blanche : un test
// « role !== 'user' » laisserait passer tout rôle inattendu.
export const ROLES_SUPPORT = ['admin', 'technician'];
export const estSupport = (user) => ROLES_SUPPORT.includes(user?.role);

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}
