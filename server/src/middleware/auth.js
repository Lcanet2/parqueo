import { prisma } from '../lib/prisma.js';
import { lireSession } from '../lib/session.js';

// Le jeton ne dit que « qui » : le rôle et l'équipe sont relus en base à chaque
// requête. Un compte supprimé, rétrogradé ou dont le mot de passe a changé perd
// donc ses droits immédiatement, et non à l'expiration du jeton sept jours
// plus tard.
export async function authRequired(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  let session;
  try {
    session = lireSession(token);
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, role: true, teamId: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== session.ver) {
      return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    }
    req.user = { sub: user.id, role: user.role, teamId: user.teamId };
    next();
  } catch (err) {
    next(err);
  }
}
