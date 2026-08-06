import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { APP_DEFAULTS, getAppSettings, saveAppSettings } from '../lib/appSettings.js';

// Configuration centrale (table settings) : seule l'administration écrit,
// tout le monde lit ce qui concerne son rôle. Les layouts de dashboard sont
// stockés par rôle sous les clés dashboard.layout.<role>.

const router = Router();

router.use(authRequired);

const ROLES = ['admin', 'technician', 'user'];
const layoutKey = (role) => `dashboard.layout.${role}`;
// Layout personnel d'un compte (par-dessus celui de son rôle), stocké en base
// pour être conservé et synchronisé entre navigateurs/appareils.
const personalKey = (userId) => `dashboard.layout.user.${userId}`;

// Types de widgets et tailles reconnus — pendant serveur du catalogue client
// (client/src/lib/dashboard.js). À garder synchronisés si le catalogue évolue.
const WIDGET_TYPES = new Set([
  'stat',
  'donut',
  'status-bar',
  'weekly-flow',
  'category-bars',
  'priority-bars',
  'tech-load',
  'team-load',
  'age-bars',
  'asset-type-bars',
  'asset-status-bar',
  'ticket-list',
  'asset-list',
]);
const WIDGET_SIZES = new Set([1, 2, 4]);

// Un layout invalide s'applique à tous les comptes d'un rôle : la validation
// est stricte. `typeof null === 'object'` en JavaScript — d'où le contrôle
// explicite, sans lequel un `config: null` faisait planter le tableau de bord
// de tout le monde.
function isValidLayout(layout) {
  return (
    Array.isArray(layout) &&
    layout.length <= 40 &&
    layout.every(
      (i) =>
        i &&
        typeof i === 'object' &&
        WIDGET_TYPES.has(i.type) &&
        WIDGET_SIZES.has(i.size) &&
        i.config !== null &&
        typeof i.config === 'object' &&
        !Array.isArray(i.config)
    )
  );
}

// L'utilisateur a-t-il le droit d'un layout personnel (permission par rôle) ?
function canPersonalize(user, app) {
  return (
    user.role === 'admin' ||
    (user.role === 'technician' && app.dashboardPersonalTechnician) ||
    (user.role === 'user' && app.dashboardPersonalUser)
  );
}

// --- Paramètres globaux de l'application ---
// Chaque clé a son validateur : un PATCH avec clé inconnue ou valeur invalide est refusé.
const VALIDATORS = {
  ticketDefaultPriority: (v) => ['low', 'medium', 'high'].includes(v),
  autoCloseDays: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
  assetStaleDays: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
};
for (const key of Object.keys(APP_DEFAULTS)) {
  if (!VALIDATORS[key]) VALIDATORS[key] = (v) => typeof v === 'boolean';
}

// Lecture ouverte à tous les comptes : le client en a besoin pour adapter
// l'interface (priorité, suggestions, inventaire…). L'écriture reste admin.
router.get('/app', async (req, res) => {
  res.json(await getAppSettings());
});

router.patch('/app', requireRole('admin'), async (req, res) => {
  const entries = Object.entries(req.body ?? {});
  if (!entries.length) return res.status(400).json({ error: 'Aucun paramètre fourni' });
  for (const [key, value] of entries) {
    if (!VALIDATORS[key] || !VALIDATORS[key](value)) {
      return res.status(400).json({ error: `Paramètre invalide : ${key}` });
    }
  }
  res.json(await saveAppSettings(Object.fromEntries(entries)));
});

// Layout du dashboard. Sans ?role → celui du rôle du demandeur ; consulter le
// layout d'un autre rôle (aperçu/édition) est réservé à l'admin.
// layout: null → le client applique le layout par défaut du rôle.
router.get('/dashboard', async (req, res) => {
  const role = req.query.role ?? req.user.role;
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle inconnu' });
  if (role !== req.user.role && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const [setting, personal, app] = await Promise.all([
    prisma.setting.findUnique({ where: { key: layoutKey(role) } }),
    prisma.setting.findUnique({ where: { key: personalKey(req.user.sub) } }),
    getAppSettings(),
  ]);
  const allowed = canPersonalize(req.user, app);
  // Le layout personnel ne concerne que la vue de son propre rôle et si la
  // permission est accordée ; sinon on ne le renvoie pas.
  const own = allowed && role === req.user.role ? personal?.value ?? null : null;
  res.json({ role, layout: setting?.value ?? null, personal: own, canPersonalize: allowed });
});

// --- Layout personnel du compte connecté ---
// Déclaré avant /dashboard/:role : « personal » ne doit pas être pris pour un rôle.
router.put('/dashboard/personal', async (req, res) => {
  const app = await getAppSettings();
  if (!canPersonalize(req.user, app)) {
    return res.status(403).json({ error: 'Personnalisation non autorisée' });
  }
  const { layout } = req.body;
  if (!isValidLayout(layout)) return res.status(400).json({ error: 'Layout invalide' });

  await prisma.setting.upsert({
    where: { key: personalKey(req.user.sub) },
    update: { value: layout },
    create: { key: personalKey(req.user.sub), value: layout },
  });
  res.json({ layout });
});

// Réinitialisation du layout personnel : retour au layout du rôle.
router.delete('/dashboard/personal', async (req, res) => {
  await prisma.setting.deleteMany({ where: { key: personalKey(req.user.sub) } });
  res.status(204).end();
});

router.put('/dashboard/:role', requireRole('admin'), async (req, res) => {
  const { role } = req.params;
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle inconnu' });

  const { layout } = req.body;
  if (!isValidLayout(layout)) return res.status(400).json({ error: 'Layout invalide' });

  await prisma.setting.upsert({
    where: { key: layoutKey(role) },
    update: { value: layout },
    create: { key: layoutKey(role), value: layout },
  });
  res.json({ role, layout });
});

// Réinitialisation : on supprime la clé, le client retombe sur le défaut.
router.delete('/dashboard/:role', requireRole('admin'), async (req, res) => {
  const { role } = req.params;
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle inconnu' });
  await prisma.setting.deleteMany({ where: { key: layoutKey(role) } });
  res.status(204).end();
});

export default router;
