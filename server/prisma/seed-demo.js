// Jeu de données de démonstration — volumineux et réaliste.
// Usage : node prisma/seed-demo.js
// Tous les comptes créés ont le mot de passe : test1234

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n) => new Date(now - n * DAY);
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

async function main() {
  const existing = await prisma.user.count();
  if (existing > 10) {
    console.log(`Base déjà peuplée (${existing} utilisateurs). Abandon pour ne pas dupliquer.`);
    return;
  }

  const hash = await bcrypt.hash('test1234', 10);

  // --- Équipes ---
  const teamNames = ['Support IT', 'Support N2', 'Infrastructure'];
  const teams = {};
  for (const name of teamNames) {
    const found = await prisma.team.findFirst({ where: { name } });
    teams[name] = found ?? (await prisma.team.create({ data: { name } }));
  }

  // --- Catégories ---
  const categoryNames = ['Matériel', 'Logiciel', 'Réseau', 'Accès & comptes', 'Imprimantes'];
  const categories = {};
  for (const name of categoryNames) {
    const found = await prisma.category.findFirst({ where: { name } });
    categories[name] = found ?? (await prisma.category.create({ data: { name } }));
  }

  // --- Utilisateurs ---
  const upsertUser = async (email, name, role, teamId = null) => {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: hash, name, role, teamId },
    });
  };

  const admin = await upsertUser('admin@it-desk.local', 'Administrateur', 'admin');
  const techs = [
    await upsertUser('tech@it-desk.local', 'Théo Technicien', 'technician', teams['Support IT'].id),
    await upsertUser('sarah.lemoine@it-desk.local', 'Sarah Lemoine', 'technician', teams['Support IT'].id),
    await upsertUser('karim.benali@it-desk.local', 'Karim Benali', 'technician', teams['Support N2'].id),
    await upsertUser('julie.moreau@it-desk.local', 'Julie Moreau', 'technician', teams['Infrastructure'].id),
  ];
  const endUsers = [
    await upsertUser('user@it-desk.local', 'Lucie Utilisatrice', 'user'),
    await upsertUser('marc.dupont@entreprise.fr', 'Marc Dupont', 'user'),
    await upsertUser('claire.martin@entreprise.fr', 'Claire Martin', 'user'),
    await upsertUser('paul.bernard@entreprise.fr', 'Paul Bernard', 'user'),
    await upsertUser('emma.petit@entreprise.fr', 'Emma Petit', 'user'),
    await upsertUser('lucas.roux@entreprise.fr', 'Lucas Roux', 'user'),
    await upsertUser('nadia.garnier@entreprise.fr', 'Nadia Garnier', 'user'),
    await upsertUser('thomas.fabre@entreprise.fr', 'Thomas Fabre', 'user'),
    await upsertUser('ines.blanc@entreprise.fr', 'Inès Blanc', 'user'),
    await upsertUser('hugo.perrin@entreprise.fr', 'Hugo Perrin', 'user'),
  ];

  // --- Actifs ---
  const locations = ['Bureau 101', 'Bureau 102', 'Bureau 204', 'Bureau 210', 'Open space RDC', 'Open space 1er', 'Salle serveur', 'Accueil', 'Salle de réunion A', 'Comptabilité'];
  const assetsSpec = [];
  for (let i = 1; i <= 14; i++) {
    assetsSpec.push({
      name: `PC-${String(i).padStart(3, '0')}`,
      type: 'pc',
      assignedUser: i <= endUsers.length ? endUsers[i - 1] : null,
    });
  }
  for (let i = 1; i <= 4; i++) {
    assetsSpec.push({ name: `IMP-${rand(['RICOH', 'HP', 'BROTHER'])}-${i}`, type: 'printer' });
  }
  for (let i = 1; i <= 3; i++) {
    assetsSpec.push({ name: `SRV-${['FICHIERS', 'ERP', 'BACKUP'][i - 1]}`, type: 'server' });
  }
  assetsSpec.push({ name: 'Office 365 (50 postes)', type: 'software' });
  assetsSpec.push({ name: 'Antivirus ESET (site)', type: 'software' });
  assetsSpec.push({ name: 'Sage Compta', type: 'software' });

  const assets = [];
  for (const spec of assetsSpec) {
    assets.push(
      await prisma.asset.create({
        data: {
          name: spec.name,
          type: spec.type,
          location: spec.type === 'software' ? null : rand(locations),
          purchaseDate: daysAgo(randInt(60, 1500)),
          status: Math.random() < 0.08 ? 'retired' : Math.random() < 0.12 ? 'in_repair' : 'in_service',
          assignedUserId: spec.assignedUser?.id ?? null,
        },
      })
    );
  }

  // --- Règles de workflow ---
  const ensureRule = async (categoryId, targetTeamId, targetUserId = null) => {
    const found = await prisma.workflowRule.findFirst({ where: { categoryId } });
    if (!found) {
      await prisma.workflowRule.create({ data: { categoryId, targetTeamId, targetUserId, active: true } });
    }
  };
  await ensureRule(categories['Matériel'].id, teams['Support IT'].id, techs[0].id);
  await ensureRule(categories['Réseau'].id, teams['Infrastructure'].id, techs[3].id);
  await ensureRule(categories['Imprimantes'].id, teams['Support IT'].id);
  await ensureRule(categories['Accès & comptes'].id, teams['Support N2'].id, techs[2].id);

  // --- Tickets ---
  const scenarios = [
    { t: 'PC très lent au démarrage', d: 'Le poste met plus de 10 minutes à démarrer depuis quelques jours. Rien changé côté logiciels.', cat: 'Matériel', asset: 'pc' },
    { t: 'Écran qui scintille', d: "L'écran clignote par intermittence, surtout le matin. Câble déjà rebranché sans effet.", cat: 'Matériel', asset: 'pc' },
    { t: 'Batterie du portable ne charge plus', d: 'Le voyant de charge reste éteint, testé avec deux chargeurs différents.', cat: 'Matériel', asset: 'pc' },
    { t: 'Clavier : touches qui ne répondent plus', d: 'Les touches E, R et T ne fonctionnent plus après un café renversé.', cat: 'Matériel', asset: 'pc' },
    { t: 'Souris sans fil déconnectée en permanence', d: 'La souris se déconnecte toutes les 2-3 minutes, piles neuves.', cat: 'Matériel', asset: 'pc' },
    { t: "Impossible d'imprimer depuis Word", d: "L'impression reste bloquée dans la file d'attente. Redémarrage sans effet.", cat: 'Imprimantes', asset: 'printer' },
    { t: 'Bourrage papier récurrent bac 2', d: 'Bourrage quasi systématique sur le bac 2, même avec du papier neuf.', cat: 'Imprimantes', asset: 'printer' },
    { t: 'Imprimante : traces noires sur les pages', d: 'Des traînées noires verticales apparaissent sur toutes les impressions.', cat: 'Imprimantes', asset: 'printer' },
    { t: 'Toner à remplacer', d: 'Message "toner faible" depuis une semaine, la qualité se dégrade.', cat: 'Imprimantes', asset: 'printer' },
    { t: 'Pas de connexion réseau en salle de réunion A', d: 'Aucune prise réseau ne fonctionne en salle A, le Wi-Fi passe.', cat: 'Réseau' },
    { t: 'Wi-Fi très lent au 1er étage', d: 'Débit catastrophique en open space 1er étage depuis lundi, filaire OK.', cat: 'Réseau' },
    { t: 'VPN : déconnexions fréquentes', d: 'Le VPN coupe toutes les 20 minutes en télétravail. Fibre stable par ailleurs.', cat: 'Réseau' },
    { t: "Accès au lecteur partagé refusé", d: "Message « accès refusé » sur le lecteur P: depuis ce matin, mes collègues y accèdent.", cat: 'Accès & comptes' },
    { t: 'Compte verrouillé après retour de congés', d: 'Mot de passe expiré pendant mes congés, compte bloqué après 3 essais.', cat: 'Accès & comptes' },
    { t: 'Création de compte pour un nouvel arrivant', d: 'Arrivée de Julien Sabatier lundi prochain au service commercial : prévoir compte, mail et accès CRM.', cat: 'Accès & comptes' },
    { t: 'Droits manquants sur le dossier Compta', d: "Besoin d'un accès en écriture au dossier Compta/2026 pour la clôture.", cat: 'Accès & comptes' },
    { t: 'Outlook ne synchronise plus', d: 'Aucun mail reçu depuis hier 14h, le webmail fonctionne normalement.', cat: 'Logiciel' },
    { t: 'Excel plante à l\'ouverture d\'un fichier', d: 'Un classeur partagé fait planter Excel systématiquement. Les autres fichiers vont bien.', cat: 'Logiciel' },
    { t: 'Mise à jour Sage demandée par la compta', d: 'La compta a besoin de la dernière version de Sage avant la clôture mensuelle.', cat: 'Logiciel', asset: 'software' },
    { t: 'Licence Office expirée', d: 'Bandeau « produit sans licence » sur Word et Excel depuis ce matin.', cat: 'Logiciel', asset: 'software' },
    { t: 'Teams : micro non détecté', d: 'Le micro du casque fonctionne partout sauf dans Teams.', cat: 'Logiciel' },
    { t: 'Antivirus signale un fichier suspect', d: "Alerte ESET sur un fichier téléchargé, mis en quarantaine. Besoin d'une vérification.", cat: 'Logiciel', asset: 'software' },
    { t: 'Double écran non reconnu', d: "Le second écran reste noir après le passage à la station d'accueil neuve.", cat: 'Matériel', asset: 'pc' },
    { t: 'Serveur de fichiers inaccessible', d: 'Plus personne ne peut accéder au serveur de fichiers depuis 9h15. Urgent.', cat: 'Réseau', asset: 'server' },
    { t: 'Sauvegarde nocturne en échec', d: 'Le rapport de sauvegarde indique un échec sur les 3 dernières nuits.', cat: 'Logiciel', asset: 'server' },
  ];

  const staffPool = [...techs, admin];
  const statusWeights = [
    ['closed', 0.34],
    ['resolved', 0.18],
    ['in_progress', 0.2],
    ['waiting', 0.1],
    ['new', 0.18],
  ];
  const pickStatus = () => {
    let r = Math.random();
    for (const [s, w] of statusWeights) {
      if ((r -= w) <= 0) return s;
    }
    return 'new';
  };

  const followupComments = [
    'Je passe voir en début d\'après-midi.',
    'Pouvez-vous préciser depuis quand le problème se produit ?',
    'Vu ensemble par téléphone, en attente de la pièce.',
    'Le fournisseur est relancé, retour prévu sous 48h.',
    'Problème reproduit, correctif en cours.',
    'Merci, c\'est beaucoup mieux depuis votre intervention.',
    'Redémarrage effectué à distance, à confirmer demain matin.',
    'Ticket transmis au niveau 2.',
  ];

  let created = 0;
  const ticketsMeta = [];

  for (let i = 0; i < 60; i++) {
    const sc = rand(scenarios);
    const author = rand(endUsers);
    const status = pickStatus();
    const createdDaysAgo = randInt(0, 90);
    const createdAt = daysAgo(createdDaysAgo);
    const priority = Math.random() < 0.15 ? 'high' : Math.random() < 0.55 ? 'medium' : 'low';

    const category = categories[sc.cat];
    const assignee = status === 'new' && Math.random() < 0.6 ? null : rand(staffPool);
    const team = assignee?.teamId ? teams[Object.keys(teams).find((k) => teams[k].id === assignee.teamId)] : rand(Object.values(teams));

    const linkedAsset = sc.asset
      ? rand(assets.filter((a) => a.type === sc.asset).concat([null]))
      : null;

    const events = [];
    let cursor = createdAt.getTime();
    const advance = () => {
      cursor += randInt(1, 48) * 60 * 60 * 1000;
      return new Date(Math.min(cursor, now));
    };

    if (assignee) {
      events.push({ type: 'event', body: `Assigné à ${assignee.name}`, authorId: admin.id, createdAt: advance() });
    }
    if (status !== 'new') {
      events.push({ type: 'event', body: 'Statut changé : new → in_progress', authorId: (assignee ?? admin).id, createdAt: advance() });
    }
    if (Math.random() < 0.7) {
      events.push({ type: 'comment', body: rand(followupComments), authorId: (assignee ?? rand(staffPool)).id, createdAt: advance() });
    }
    if (Math.random() < 0.4) {
      events.push({ type: 'comment', body: rand(followupComments), authorId: author.id, createdAt: advance() });
    }
    if (status === 'waiting') {
      events.push({ type: 'event', body: 'Statut changé : in_progress → waiting', authorId: (assignee ?? admin).id, createdAt: advance() });
    }
    if (status === 'resolved' || status === 'closed') {
      events.push({ type: 'event', body: 'Statut changé : in_progress → resolved', authorId: (assignee ?? admin).id, createdAt: advance() });
    }
    if (status === 'closed') {
      events.push({ type: 'event', body: 'Statut changé : resolved → closed', authorId: admin.id, createdAt: advance() });
    }

    const ticket = await prisma.ticket.create({
      data: {
        title: sc.t,
        description: sc.d,
        status,
        priority,
        categoryId: category.id,
        authorId: author.id,
        assigneeId: assignee?.id ?? null,
        teamId: team?.id ?? null,
        assetId: linkedAsset?.id ?? null,
        createdAt,
        comments: { create: events },
      },
    });
    ticketsMeta.push({ id: ticket.id, updatedAt: new Date(Math.min(cursor, now)) });
    created++;
  }

  // updated_at cohérent avec le dernier événement (contourne @updatedAt)
  for (const t of ticketsMeta) {
    await prisma.$executeRaw`UPDATE tickets SET updated_at = ${t.updatedAt} WHERE id = ${t.id}`;
  }

  const counts = {
    users: await prisma.user.count(),
    teams: await prisma.team.count(),
    categories: await prisma.category.count(),
    assets: await prisma.asset.count(),
    tickets: await prisma.ticket.count(),
    comments: await prisma.ticketComment.count(),
    rules: await prisma.workflowRule.count(),
  };
  console.log(`Seed démo terminé — ${created} tickets créés.`);
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
