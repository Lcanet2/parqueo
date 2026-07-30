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
// équipements réseau n'ont pas d'UUID matériel : on fabrique une identité stable
// à partir du nom système (sinon de l'IP) pour dédoublonner d'un scan à l'autre.
export function snmpToInventory({ ip, sysName, sysDescr, serial } = {}) {
  const name = sysName?.trim() || ip;
  return {
    uuid: `snmp:${name}`,
    serial: serial?.trim() || null,
    name,
    type: inferAssetType(sysDescr),
    model: sysDescr?.trim() || null,
    raw: { ip, sysName, sysDescr, serial },
  };
}
