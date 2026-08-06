import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandCidr, inferAssetType, snmpToInventory } from './snmp.js';

test('expandCidr /30 exclut réseau et diffusion', () => {
  assert.deepEqual(expandCidr('192.168.1.0/30'), ['192.168.1.1', '192.168.1.2']);
});

test('expandCidr /32 = un seul hôte, /31 = deux hôtes', () => {
  assert.deepEqual(expandCidr('10.0.0.5/32'), ['10.0.0.5']);
  assert.deepEqual(expandCidr('10.0.0.4/31'), ['10.0.0.4', '10.0.0.5']);
});

test('expandCidr /24 donne 254 hôtes (hors réseau/diffusion)', () => {
  const hosts = expandCidr('192.168.1.0/24');
  assert.equal(hosts.length, 254);
  assert.equal(hosts[0], '192.168.1.1');
  assert.equal(hosts[253], '192.168.1.254');
});

test('expandCidr plafonne les grandes plages', () => {
  assert.equal(expandCidr('10.0.0.0/8', { maxHosts: 100 }).length, 100);
});

test('expandCidr rejette une entrée invalide', () => {
  assert.deepEqual(expandCidr('pas.une.ip/24'), []);
  assert.deepEqual(expandCidr('192.168.1.0/99'), []);
  assert.deepEqual(expandCidr('192.168.1.256/24'), []);
});

test('inferAssetType repère les imprimantes, sinon serveur', () => {
  assert.equal(inferAssetType('HP LaserJet Pro MFP'), 'printer');
  assert.equal(inferAssetType('Cisco IOS Software, C2960'), 'server');
  assert.equal(inferAssetType(''), 'server');
});

test('snmpToInventory fabrique une identité stable et passe la normalisation', () => {
  const inv = snmpToInventory({
    ip: '192.168.1.50',
    sysName: 'SW-CORE-01',
    sysDescr: 'Cisco IOS',
    serial: 'FCW123',
  });
  // Le numéro de série est la clé la plus solide : il survit au renommage et au
  // changement d'adresse, contrairement au nom système.
  assert.equal(inv.uuid, 'snmp:sn:FCW123');
  assert.equal(inv.serial, 'FCW123');
  assert.equal(inv.name, 'SW-CORE-01');
  assert.equal(inv.type, 'server');
  assert.equal(inv.model, 'Cisco IOS');
});

test('snmpToInventory garde la même identité quand l’équipement est renommé', () => {
  const avant = snmpToInventory({ ip: '10.0.0.1', sysName: 'SW-A', serial: 'FCW123' });
  const apres = snmpToInventory({ ip: '10.0.0.9', sysName: 'SW-B', serial: 'FCW123' });
  assert.equal(avant.uuid, apres.uuid);
});

test('snmpToInventory distingue deux équipements de même nom sans numéro de série', () => {
  const imprimante = snmpToInventory({
    ip: '10.0.0.2',
    sysName: 'ATELIER',
    sysDescr: 'HP LaserJet',
    sysObjectId: '1.3.6.1.4.1.11.2.3.9.1',
  });
  const commutateur = snmpToInventory({
    ip: '10.0.0.3',
    sysName: 'ATELIER',
    sysDescr: 'Cisco Catalyst',
    sysObjectId: '1.3.6.1.4.1.9.1.516',
  });
  assert.notEqual(imprimante.uuid, commutateur.uuid);
});

test('snmpToInventory se rabat sur l’IP quand le nom système manque', () => {
  const inv = snmpToInventory({ ip: '192.168.1.51', sysDescr: 'HP LaserJet' });
  assert.equal(inv.uuid, 'snmp:ip:192.168.1.51');
  assert.equal(inv.name, '192.168.1.51');
  assert.equal(inv.type, 'printer');
  assert.equal(inv.serial, null);
});

test('snmpToInventory ignore les valeurs vides et les espaces', () => {
  const inv = snmpToInventory({ ip: '10.0.0.4', sysName: '  ', serial: '   ', sysObjectId: '' });
  assert.equal(inv.uuid, 'snmp:ip:10.0.0.4');
  assert.equal(inv.serial, null);
});
