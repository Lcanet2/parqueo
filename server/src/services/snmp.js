import snmp from 'net-snmp';
import { expandCidr, snmpToInventory } from '../lib/snmp.js';
import { ingest } from './inventory.js';

// Scan réseau SNMP : découverte sans agent des équipements qui répondent en SNMP
// (imprimantes, switches, routeurs, NAS, onduleurs, serveurs). Le serveur
// interroge chaque IP des plages configurées et transforme les réponses en
// actifs (source « scan »).
//
// Config (.env) : SNMP_ENABLED=true pour activer, SNMP_RANGES (plages CIDR
// séparées par des virgules, ex. « 192.168.1.0/24,10.0.0.0/28 »),
// SNMP_COMMUNITY (défaut « public »), SNMP_SCAN_HOURS (scan de fond, 0 = à la
// demande seulement).

// OID standards interrogés sur chaque hôte.
const OID_SYS_DESCR = '1.3.6.1.2.1.1.1.0';
const OID_SYS_NAME = '1.3.6.1.2.1.1.5.0';
const OID_SERIAL = '1.3.6.1.2.1.47.1.1.1.1.11.1'; // entPhysicalSerialNum (1re entité)
// sysObjectID : identifie la famille de matériel. Sert à distinguer deux
// équipements de types différents portant le même nom système (voir lib/snmp.js).
const OID_SYS_OBJECT = '1.3.6.1.2.1.1.2.0';

export function snmpEnabled() {
  return process.env.SNMP_ENABLED === 'true' && Boolean(process.env.SNMP_RANGES);
}

function ranges() {
  return (process.env.SNMP_RANGES || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

// Interroge un hôte. Résout un objet de résultats, ou null si pas de réponse SNMP
// (hôte absent, pas de SNMP, mauvaise communauté). Ne rejette jamais.
function queryHost(ip) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, process.env.SNMP_COMMUNITY || 'public', {
      version: snmp.Version2c,
      timeout: 1500,
      retries: 0,
    });
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try {
        session.close();
      } catch {
        /* session déjà fermée */
      }
      resolve(value);
    };

    session.get([OID_SYS_DESCR, OID_SYS_NAME, OID_SERIAL, OID_SYS_OBJECT], (err, varbinds) => {
      if (err || !varbinds) return finish(null);
      const read = (vb) => (vb && !snmp.isVarbindError(vb) ? vb.value?.toString() : null);
      const sysDescr = read(varbinds[0]);
      const sysName = read(varbinds[1]);
      // Sans sysDescr ni sysName, l'hôte ne « parle » pas vraiment SNMP : on ignore.
      if (!sysDescr && !sysName) return finish(null);
      finish({ ip, sysDescr, sysName, serial: read(varbinds[2]), sysObjectId: read(varbinds[3]) });
    });

    // Filet de sécurité si le callback ne revient jamais.
    setTimeout(() => finish(null), 3000).unref?.();
  });
}

// Applique une fonction asynchrone sur une liste avec une concurrence bornée.
async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Scanne toutes les plages configurées et ingère les équipements qui répondent.
export async function scanSnmp() {
  const hosts = ranges().flatMap((cidr) => expandCidr(cidr));
  const summary = { scanned: hosts.length, responded: 0, created: 0, updated: 0, errors: 0 };

  const responses = await mapLimit(hosts, 40, queryHost);
  for (const r of responses) {
    if (!r) continue;
    summary.responded += 1;
    try {
      const result = await ingest(snmpToInventory(r), { source: 'scan' });
      if (result.error) summary.errors += 1;
      else if (result.action === 'created') summary.created += 1;
      else summary.updated += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[snmp] échec sur ${r.ip} :`, err.message);
    }
  }

  console.log(
    `[snmp] scan : ${summary.scanned} IP, ${summary.responded} réponse(s) (${summary.created} créé(s), ${summary.updated} maj)`
  );
  return summary;
}

// Scan périodique optionnel (comme la clôture auto et le collecteur IMAP).
export function startSnmpScan() {
  if (!snmpEnabled()) return;
  const hours = Number(process.env.SNMP_SCAN_HOURS ?? 0);
  if (hours > 0) {
    const run = () => scanSnmp().catch((err) => console.error('[snmp]', err.message));
    run();
    setInterval(run, hours * 60 * 60 * 1000).unref();
    console.log(`[snmp] scan réseau toutes les ${hours}h`);
  }
}
