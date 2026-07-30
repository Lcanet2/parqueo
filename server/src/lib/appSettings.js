import { prisma } from './prisma.js';

// Paramètres globaux de l'application, édités dans la page Paramètres (admin)
// et stockés en une seule ligne settings (clé app.config) fusionnée avec ces
// défauts. Les défauts reproduisent le comportement historique de l'appli.
export const APP_DEFAULTS = {
  // Tableaux de bord : personnalisation individuelle par-dessus le layout du rôle
  dashboardPersonalTechnician: false,
  dashboardPersonalUser: false,
  // Tickets
  ticketDefaultPriority: 'medium',
  userCanSetPriority: true,
  autoCloseDays: Number(process.env.AUTO_CLOSE_DAYS ?? 7),
  satisfactionSurvey: true,
  // Notifications email
  notifyOnCreate: true,
  notifyOnStatus: true,
  notifyOnAssign: true,
  notifyOnComment: true,
  // Base de connaissances
  kbSuggest: true,
  kbTechniciansWrite: true,
  // Inventaire
  assetsVisibleToUsers: true,
  // Un actif d'inventaire automatique sans remontée depuis ce nombre de jours
  // est signalé comme « périmé » dans l'interface (0 = pas de signalement).
  // Purement visuel : le statut de l'actif n'est jamais modifié.
  assetStaleDays: 30,
};

const KEY = 'app.config';
const TTL = 10_000; // les emails/routes lisent souvent : petit cache
let cache = null; // { value, at }

export async function getAppSettings() {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const value = { ...APP_DEFAULTS, ...(row?.value ?? {}) };
  cache = { value, at: Date.now() };
  return value;
}

export async function saveAppSettings(partial) {
  const next = { ...(await getAppSettings()), ...partial };
  await prisma.setting.upsert({
    where: { key: KEY },
    update: { value: next },
    create: { key: KEY, value: next },
  });
  cache = { value: next, at: Date.now() };
  return next;
}
