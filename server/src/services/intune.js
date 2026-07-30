import { intuneDeviceToInventory } from '../lib/inventory.js';
import { ingest } from './inventory.js';

// Connecteur Microsoft Intune (Endpoint Manager) via Microsoft Graph. Réutilise
// l'app registration Entra du SSO (SSO_TENANT_ID / SSO_CLIENT_ID /
// SSO_CLIENT_SECRET) en flux « client credentials » (app-only). Il faut en plus
// accorder à cette app la permission applicative Graph
// DeviceManagementManagedDevices.Read.All avec consentement admin — d'où
// l'opt-in explicite INTUNE_ENABLED=true : on ne tente rien tant que l'admin
// n'a pas fait cette démarche.

export function intuneEnabled() {
  return (
    process.env.INTUNE_ENABLED === 'true' &&
    Boolean(process.env.SSO_TENANT_ID && process.env.SSO_CLIENT_ID && process.env.SSO_CLIENT_SECRET)
  );
}

const GRAPH = 'https://graph.microsoft.com/v1.0';
// Champs demandés à Graph : identité, matériel de base, OS, utilisateur, contact.
const SELECT = [
  'id',
  'azureADDeviceId',
  'deviceName',
  'manufacturer',
  'model',
  'serialNumber',
  'operatingSystem',
  'osVersion',
  'userPrincipalName',
  'emailAddress',
  'lastSyncDateTime',
  'hardwareInformation',
].join(',');

let tokenCache = null; // { value, exp }

async function appToken() {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.value;
  const url = `https://login.microsoftonline.com/${process.env.SSO_TENANT_ID}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SSO_CLIENT_ID,
      client_secret: process.env.SSO_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Jeton Graph refusé');
  // Marge de 60 s pour ne pas présenter un jeton qui expire pendant la requête.
  tokenCache = { value: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache.value;
}

// Récupère toutes les pages de managedDevices et ingère chacune.
export async function syncIntune() {
  const token = await appToken();
  const summary = { total: 0, created: 0, updated: 0, errors: 0 };

  let url = `${GRAPH}/deviceManagement/managedDevices?$select=${SELECT}&$top=100`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Graph ${res.status}`);

    for (const device of data.value ?? []) {
      summary.total += 1;
      try {
        const result = await ingest(intuneDeviceToInventory(device), { source: 'intune' });
        if (result.error) summary.errors += 1;
        else if (result.action === 'created') summary.created += 1;
        else summary.updated += 1;
      } catch (err) {
        summary.errors += 1;
        console.error('[intune] échec sur un appareil :', err.message);
      }
    }
    url = data['@odata.nextLink'] ?? null;
  }

  console.log(
    `[intune] sync : ${summary.total} appareils (${summary.created} créés, ${summary.updated} maj, ${summary.errors} erreurs)`
  );
  return summary;
}

// Synchronisation périodique optionnelle (comme la clôture auto et le collecteur
// IMAP). Cadence en heures via INTUNE_SYNC_HOURS (défaut 6 ; 0 = pas de tâche
// de fond, seule la sync manuelle depuis l'UI reste possible).
export function startIntuneSync() {
  if (!intuneEnabled()) return;
  const hours = Number(process.env.INTUNE_SYNC_HOURS ?? 6);
  const run = () => syncIntune().catch((err) => console.error('[intune]', err.message));
  run();
  if (hours > 0) {
    setInterval(run, hours * 60 * 60 * 1000).unref();
    console.log(`[intune] synchronisation toutes les ${hours}h`);
  }
}
