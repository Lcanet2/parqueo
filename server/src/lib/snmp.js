// Helpers purs du scan SNMP — extraits pour être testables sans réseau.

// Déplie une plage CIDR en liste d'adresses hôtes. On exclut l'adresse réseau et
// l'adresse de diffusion pour les préfixes < /31. Plafonné pour ne jamais lancer
// un scan démentiel par erreur de configuration.
export function expandCidr(cidr, { maxHosts = 4096 } = {}) {
  const [base, bitsRaw] = String(cidr).trim().split('/');
  const bits = Number(bitsRaw);
  const octets = base.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return [];
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return [];

  const baseInt = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const size = 2 ** (32 - bits);
  const network = baseInt & (size === 2 ** 32 ? 0 : (~(size - 1) >>> 0));

  // Bornes : pas de réseau/diffusion sauf /31 (2 hôtes) et /32 (1 hôte).
  let start = network;
  let end = network + size - 1;
  if (bits < 31) {
    start += 1;
    end -= 1;
  }
  if (end - start + 1 > maxHosts) end = start + maxHosts - 1;

  const toIp = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const out = [];
  for (let n = start; n <= end; n++) out.push(toIp(n));
  return out;
}

// Devine le type d'actif à partir de la description SNMP (sysDescr).
const PRINTER_RE = /print|jetdirect|laserjet|officejet|imagerunner|mfp|copier|kyocera|lexmark|brother/i;
export function inferAssetType(sysDescr = '') {
  if (PRINTER_RE.test(sysDescr)) return 'printer';
  return 'server'; // switches, routeurs, NAS, onduleurs, serveurs SNMP…
}

// Résultat d'un scan SNMP → format normalisé d'inventaire (source scan). Les
// équipements réseau n'ont pas d'UUID matériel : on fabrique une identité de
// substitution pour dédoublonner d'un scan à l'autre. Trois niveaux, du plus
// solide au plus fragile :
//
//   1. numéro de série (entPhysicalSerialNum) — survit au renommage et au
//      changement d'IP, et distingue deux équipements de même modèle ;
//   2. sysObjectID + nom système — le sysObjectID (famille de matériel) évite
//      qu'un switch et une imprimante portant le même nom ne fusionnent ;
//   3. adresse IP — dernier recours, fragile en DHCP (voir la note ci-dessous).
//
// Le niveau 1 sert aussi quand le nom change : l'ingestion retrouve l'actif par
// son numéro de série et réécrit l'uuid, sans créer de doublon.
//
// Limite connue : sans numéro de série, deux équipements laissés au nom d'usine
// par défaut sur des IP différentes restent indistinguables. Renseigner un nom
// système unique (ou activer entPhysicalSerialNum) est la bonne parade.
export function snmpToInventory({ ip, sysName, sysDescr, serial, sysObjectId } = {}) {
  const cleanSerial = serial?.trim() || null;
  const cleanName = sysName?.trim() || null;
  const name = cleanName || ip;

  let uuid;
  if (cleanSerial) uuid = `snmp:sn:${cleanSerial}`;
  else if (cleanName) uuid = `snmp:oid:${sysObjectId?.trim() || 'inconnu'}:${cleanName}`;
  else uuid = `snmp:ip:${ip}`;

  return {
    uuid,
    serial: cleanSerial,
    name,
    type: inferAssetType(sysDescr),
    model: sysDescr?.trim() || null,
    raw: { ip, sysName, sysDescr, serial, sysObjectId },
  };
}
