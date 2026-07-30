import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeInventory,
  updateFields,
  normalizeSoftware,
  glpiToInventory,
  intuneDeviceToInventory,
} from './inventory.js';

test('normalizeInventory exige au moins une clé d’identité', () => {
  assert.equal(normalizeInventory({}).error, 'uuid ou serial requis pour identifier la machine');
  assert.equal(normalizeInventory({ uuid: '  ', serial: '' }).error, 'uuid ou serial requis pour identifier la machine');
  assert.equal(normalizeInventory({ serial: 'SN123' }).error, undefined);
});

test('normalizeInventory met en forme un rapport complet', () => {
  const { data, identity } = normalizeInventory({
    uuid: '  ABC-123 ',
    serial: 'SN9',
    hostname: 'poste-marie',
    manufacturer: 'Dell',
    model: 'Latitude 5540',
    os: 'Windows 11 Pro',
    cpu: 'i5-1345U',
    ramMb: '16384',
    diskGb: 512.7,
    type: 'pc',
  });
  assert.deepEqual(identity, { uuid: 'ABC-123', serial: 'SN9' });
  assert.equal(data.name, 'poste-marie');
  assert.equal(data.ramMb, 16384);
  assert.equal(data.diskGb, 513); // arrondi
  assert.equal(data.source, 'agent');
});

test('normalizeInventory nettoie les vides en null et se rabat sur une identité pour le nom', () => {
  const { data } = normalizeInventory({ serial: 'SN9', model: '   ' });
  assert.equal(data.model, null);
  assert.equal(data.uuid, null);
  assert.equal(data.name, 'SN9'); // ni name ni hostname → série
});

test('normalizeInventory refuse un type inconnu (défaut pc) et une source inconnue (défaut agent)', () => {
  const { data } = normalizeInventory({ serial: 'SN9', type: 'toaster' }, { source: 'pirate' });
  assert.equal(data.type, 'pc');
  assert.equal(data.source, 'agent');
});

test('normalizeInventory accepte une source connue', () => {
  const { data } = normalizeInventory({ serial: 'SN9' }, { source: 'intune' });
  assert.equal(data.source, 'intune');
});

test('normalizeInventory conserve la charge utile brute', () => {
  const payload = { serial: 'SN9', raw: { extra: 42 } };
  assert.deepEqual(normalizeInventory(payload).data.raw, { extra: 42 });
  const noRaw = { serial: 'SN9', cpu: 'i7' };
  assert.deepEqual(normalizeInventory(noRaw).data.raw, noRaw); // à défaut, le payload entier
});

test('updateFields ne remonte que les champs de l’inventaire, jamais ceux de l’admin', () => {
  const { data } = normalizeInventory({ serial: 'SN9', model: 'X', name: 'imposé' });
  const fields = updateFields(data);
  assert.equal(fields.model, 'X');
  assert.equal(fields.serial, 'SN9');
  assert.equal('name' in fields, false);
  assert.equal('type' in fields, false);
});

test('normalizeInventory lit une date de dernier contact valide, ignore une invalide', () => {
  assert.equal(normalizeInventory({ serial: 'SN9' }).lastSeenAt, null);
  const d = normalizeInventory({ serial: 'SN9', lastSeenAt: '2026-07-01T10:00:00Z' }).lastSeenAt;
  assert.equal(d.toISOString(), '2026-07-01T10:00:00.000Z');
  assert.equal(normalizeInventory({ serial: 'SN9', lastSeenAt: 'n’importe quoi' }).lastSeenAt, null);
});

test('normalizeSoftware filtre les sans-nom, dédoublonne et remonte publisher', () => {
  assert.equal(normalizeSoftware(undefined), undefined); // absent → ne pas toucher
  assert.deepEqual(normalizeSoftware([]), []); // présent vide → vider
  const out = normalizeSoftware([
    { name: 'Firefox', version: '128', publisher: 'Mozilla' },
    { name: '  ' }, // sans nom → ignoré
    { name: 'Firefox', version: '128' }, // doublon (même nom+version) → ignoré
    { name: 'Firefox', version: '129' }, // version différente → gardé
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: 'Firefox', version: '128', publisher: 'Mozilla' });
});

test('glpiToInventory mappe le format natif de l’agent GLPI', () => {
  const inv = glpiToInventory({
    itemtype: 'Computer',
    content: {
      hardware: { name: 'PC-01', uuid: 'GLPI-UUID', memory: 8192 },
      bios: { ssn: 'SN-GLPI', smanufacturer: 'HP', smodel: 'EliteBook' },
      operatingsystem: { full_name: 'Ubuntu 24.04' },
      cpus: [{ name: 'Ryzen 5' }],
      storages: [{ disksize: 256000 }, { disksize: 256000 }],
      softwares: [{ name: 'curl', version: '8.5' }],
    },
  });
  assert.equal(inv.uuid, 'GLPI-UUID');
  assert.equal(inv.serial, 'SN-GLPI');
  assert.equal(inv.name, 'PC-01');
  assert.equal(inv.manufacturer, 'HP');
  assert.equal(inv.os, 'Ubuntu 24.04');
  assert.equal(inv.cpu, 'Ryzen 5');
  assert.equal(inv.ramMb, 8192);
  assert.equal(inv.diskGb, 500); // (256000+256000) Mo / 1024, arrondi
  assert.equal(inv.software.length, 1);
  // Passe la barrière de normalisation sans erreur.
  assert.equal(normalizeInventory(inv).error, undefined);
});

test('intuneDeviceToInventory mappe un managedDevice Graph', () => {
  const inv = intuneDeviceToInventory({
    id: 'guid-123',
    azureADDeviceId: 'aad-456',
    deviceName: 'LAPTOP-MARIE',
    manufacturer: 'Lenovo',
    model: 'ThinkPad',
    serialNumber: 'PF-999',
    operatingSystem: 'Windows',
    osVersion: '10.0.22631',
    userPrincipalName: 'marie@exemple.fr',
    lastSyncDateTime: '2026-07-20T08:00:00Z',
    hardwareInformation: { totalStorageSpaceInBytes: 512 * 1024 ** 3 },
  });
  assert.equal(inv.uuid, 'aad-456'); // azureADDeviceId préféré à id
  assert.equal(inv.serial, 'PF-999');
  assert.equal(inv.os, 'Windows 10.0.22631');
  assert.equal(inv.diskGb, 512);
  assert.equal(inv.assignedUserEmail, 'marie@exemple.fr');
  assert.equal(inv.lastSeenAt, '2026-07-20T08:00:00Z');
  const norm = normalizeInventory(inv, { source: 'intune' });
  assert.equal(norm.data.source, 'intune');
  assert.equal(norm.assignedUserEmail, 'marie@exemple.fr');
});
