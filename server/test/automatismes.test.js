import './setup.js';
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';
import { closeResolvedTickets } from '../src/services/autoclose.js';
import { ingest } from '../src/services/inventory.js';
import { snmpToInventory } from '../src/lib/snmp.js';

let api;
let ctx;
let tokenAdmin;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  tokenAdmin = await login(api, ctx.admin.email);
});

after(async () => {
  await api.close();
  await disconnect();
});

// Crée un ticket résolu dont la dernière activité remonte à `jours` jours.
// updatedAt est géré par Prisma (@updatedAt) : on le force en SQL brut.
async function ticketResoluAncien(jours) {
  const t = await prisma.ticket.create({
    data: {
      title: 'À clôturer',
      description: 'x',
      categoryId: ctx.category.id,
      authorId: ctx.user.id,
      assigneeId: ctx.tech.id,
      status: 'resolved',
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE tickets SET updated_at = NOW() - INTERVAL '${Number(jours)} days' WHERE id = $1`,
    t.id
  );
  return t;
}

describe('clôture automatique', () => {
  beforeEach(async () => {
    await prisma.workflowRun.deleteMany();
    await prisma.workflowStep.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.ticketComment.deleteMany();
    await prisma.ticket.deleteMany();
  });

  test('ferme les tickets résolus au-delà du délai, pas les autres', async () => {
    const vieux = await ticketResoluAncien(30);
    const recent = await prisma.ticket.create({
      data: {
        title: 'Résolu ce matin',
        description: 'x',
        categoryId: ctx.category.id,
        authorId: ctx.user.id,
        status: 'resolved',
      },
    });

    const fermes = await closeResolvedTickets();
    assert.equal(fermes, 1);
    assert.equal((await prisma.ticket.findUnique({ where: { id: vieux.id } })).status, 'closed');
    assert.equal((await prisma.ticket.findUnique({ where: { id: recent.id } })).status, 'resolved');
  });

  test('trace l’événement dans le journal du ticket', async () => {
    const t = await ticketResoluAncien(30);
    await closeResolvedTickets();
    const events = await prisma.ticketComment.findMany({ where: { ticketId: t.id } });
    assert.ok(events.some((c) => c.body.includes('clôture automatique')));
  });

  test('déclenche les workflows « statut changé », comme une clôture manuelle', async () => {
    // Ce workflow ne se déclenchait pas avant : la clôture auto écrivait en base
    // sans repasser par le pipeline de mise à jour.
    await prisma.workflow.create({
      data: {
        name: 'Archivage à la fermeture',
        trigger: 'status_changed',
        conditions: { toStatus: 'closed' },
        edges: { trigger: 'note' },
        steps: {
          create: [
            {
              key: 'note',
              type: 'add_note',
              config: { body: 'Ticket {{ticket.id}} archivé automatiquement' },
              position: 0,
            },
          ],
        },
      },
    });

    const t = await ticketResoluAncien(30);
    await closeResolvedTickets();

    const notes = await prisma.ticketComment.findMany({ where: { ticketId: t.id } });
    assert.ok(
      notes.some((c) => c.body === `Ticket ${t.id} archivé automatiquement`),
      'le workflow « statut changé » doit s’exécuter'
    );
  });

  test('un délai à 0 désactive la clôture', async () => {
    await prisma.setting.upsert({
      where: { key: 'app.config' },
      update: { value: { autoCloseDays: 0 } },
      create: { key: 'app.config', value: { autoCloseDays: 0 } },
    });
    // Le cache des paramètres a un TTL de 10 s : on l'attend en le contournant.
    const { default: mod } = await import('../src/lib/appSettings.js').then((m) => ({ default: m }));
    await mod.saveAppSettings({ autoCloseDays: 0 });

    const t = await ticketResoluAncien(90);
    assert.equal(await closeResolvedTickets(), 0);
    assert.equal((await prisma.ticket.findUnique({ where: { id: t.id } })).status, 'resolved');

    await mod.saveAppSettings({ autoCloseDays: 7 });
  });
});

describe('identité SNMP', () => {
  beforeEach(async () => {
    await prisma.softwareInstall.deleteMany();
    await prisma.asset.deleteMany();
  });

  test('le numéro de série prime : renommer l’équipement ne crée pas de doublon', async () => {
    const avant = snmpToInventory({ ip: '192.168.1.10', sysName: 'SW-ETAGE1', sysDescr: 'Cisco IOS', serial: 'FOC1234' });
    const apres = snmpToInventory({ ip: '192.168.1.99', sysName: 'SW-ACCUEIL', sysDescr: 'Cisco IOS', serial: 'FOC1234' });
    assert.equal(avant.uuid, apres.uuid, 'l’identité doit suivre le numéro de série');

    assert.equal((await ingest(avant, { source: 'scan' })).action, 'created');
    assert.equal((await ingest(apres, { source: 'scan' })).action, 'updated');
    assert.equal(await prisma.asset.count(), 1);
  });

  test('deux équipements de même nom mais de séries différentes restent distincts', async () => {
    const a = snmpToInventory({ ip: '192.168.1.20', sysName: 'NPI2C4A1F', sysDescr: 'HP LaserJet', serial: 'CN001' });
    const b = snmpToInventory({ ip: '192.168.1.21', sysName: 'NPI2C4A1F', sysDescr: 'HP LaserJet', serial: 'CN002' });
    assert.notEqual(a.uuid, b.uuid);

    await ingest(a, { source: 'scan' });
    await ingest(b, { source: 'scan' });
    assert.equal(await prisma.asset.count(), 2);
  });

  test('sans numéro de série, le sysObjectID sépare deux familles de matériel', async () => {
    const imprimante = snmpToInventory({
      ip: '192.168.1.30',
      sysName: 'ATELIER',
      sysDescr: 'HP LaserJet MFP',
      sysObjectId: '1.3.6.1.4.1.11.2.3.9.1',
    });
    const switchReseau = snmpToInventory({
      ip: '192.168.1.31',
      sysName: 'ATELIER',
      sysDescr: 'Cisco Catalyst',
      sysObjectId: '1.3.6.1.4.1.9.1.516',
    });
    assert.notEqual(imprimante.uuid, switchReseau.uuid);
    assert.equal(imprimante.type, 'printer');
    assert.equal(switchReseau.type, 'server');

    await ingest(imprimante, { source: 'scan' });
    await ingest(switchReseau, { source: 'scan' });
    assert.equal(await prisma.asset.count(), 2);
  });

  test('sans nom système, l’identité retombe sur l’adresse IP', async () => {
    const r = snmpToInventory({ ip: '192.168.1.40', sysDescr: 'Onduleur APC' });
    assert.equal(r.uuid, 'snmp:ip:192.168.1.40');
    assert.equal(r.name, '192.168.1.40');
  });

  test('un scan ne remplace pas le nom d’un actif déjà nommé par un humain', async () => {
    const r = snmpToInventory({ ip: '192.168.1.50', sysName: 'NAS01', sysDescr: 'Synology', serial: 'SYN9' });
    await ingest(r, { source: 'scan' });
    await prisma.asset.updateMany({ where: { serial: 'SYN9' }, data: { name: 'NAS comptabilité' } });

    await ingest(r, { source: 'scan' });
    const asset = await prisma.asset.findUnique({ where: { serial: 'SYN9' } });
    assert.equal(asset.name, 'NAS comptabilité');
  });
});

describe('ingestion groupée des logiciels', () => {
  beforeEach(async () => {
    await prisma.softwareInstall.deleteMany();
    await prisma.software.deleteMany();
    await prisma.asset.deleteMany();
  });

  const rapport = (uuid, logiciels) => ({ uuid, name: uuid, type: 'pc', software: logiciels });

  test('le catalogue est mutualisé entre les postes', async () => {
    const commun = [
      { name: 'Firefox', version: '140.0', publisher: 'Mozilla' },
      { name: 'LibreOffice', version: '25.2', publisher: 'TDF' },
    ];
    await ingest(rapport('poste-a', commun), { source: 'agent' });
    await ingest(rapport('poste-b', [...commun, { name: 'GIMP', version: '3.0', publisher: 'GIMP' }]), {
      source: 'agent',
    });

    assert.equal(await prisma.software.count(), 3, 'une entrée de catalogue par (nom, éditeur)');
    assert.equal(await prisma.softwareInstall.count(), 5);
  });

  test('des versions différentes partagent la même entrée de catalogue', async () => {
    await ingest(rapport('poste-c', [{ name: 'Firefox', version: '139.0', publisher: 'Mozilla' }]), { source: 'agent' });
    await ingest(rapport('poste-d', [{ name: 'Firefox', version: '140.0', publisher: 'Mozilla' }]), { source: 'agent' });

    const firefox = await prisma.software.findMany({ where: { name: 'Firefox' } });
    assert.equal(firefox.length, 1);
    const installs = await prisma.softwareInstall.findMany({ where: { softwareId: firefox[0].id } });
    assert.deepEqual(installs.map((i) => i.version).sort(), ['139.0', '140.0']);
  });

  test('un doublon dans le rapport ne crée qu’une entrée de catalogue', async () => {
    await ingest(
      rapport('poste-e', [
        { name: 'Notepad++', version: '8.6', publisher: 'Don Ho' },
        { name: 'Notepad++', version: '8.6', publisher: 'Don Ho' },
      ]),
      { source: 'agent' }
    );
    assert.equal(await prisma.software.count(), 1);
  });

  test('un logiciel désinstallé disparaît au rapport suivant', async () => {
    await ingest(rapport('poste-f', [{ name: 'Skype', version: '8' }, { name: 'Teams', version: '25' }]), {
      source: 'agent',
    });
    await ingest(rapport('poste-f', [{ name: 'Teams', version: '25' }]), { source: 'agent' });

    const asset = await prisma.asset.findUnique({
      where: { uuid: 'poste-f' },
      include: { software: { include: { software: true } } },
    });
    assert.deepEqual(asset.software.map((i) => i.software.name), ['Teams']);
    // L'entrée de catalogue Skype survit : d'autres postes peuvent l'avoir.
    assert.equal(await prisma.software.count(), 2);
  });

  test('un gros rapport reste correct et rapide', async () => {
    const logiciels = Array.from({ length: 1000 }, (_, i) => ({
      name: `Application ${i}`,
      version: `1.${i}`,
      publisher: `Éditeur ${i % 50}`,
    }));

    const t0 = Date.now();
    await ingest(rapport('poste-lourd', logiciels), { source: 'agent' });
    const duree = Date.now() - t0;

    assert.equal(await prisma.software.count(), 1000);
    assert.equal(await prisma.softwareInstall.count(), 1000);
    // Repère de non-régression : l'ancienne boucle d'upsert faisait 1000
    // allers-retours SQL et dépassait largement ce seuil.
    assert.ok(duree < 5000, `ingestion de 1000 logiciels en ${duree} ms`);
    console.log(`      → 1000 logiciels ingérés en ${duree} ms`);
  });
});
