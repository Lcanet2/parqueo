import { prisma } from './prisma.js';

// Agrégats du tableau de bord, calculés en SQL.
//
// Le tableau de bord téléchargeait auparavant *tous* les tickets visibles pour
// les compter dans le navigateur : 5,2 Mo par chargement à 10 000 tickets, à
// chaque visite. Ici, chaque chiffre vient d'un GROUP BY et la réponse pèse
// quelques kilo-octets quel que soit le volume.
//
// `where` est la clause de visibilité du demandeur : les agrégats respectent
// exactement les mêmes règles que les listes.

const STATUSES = ['new', 'in_progress', 'waiting', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high'];
const OUVERTS = ['new', 'in_progress', 'waiting'];
const JOUR = 24 * 60 * 60 * 1000;

// Bornes d'âge des tickets ouverts, alignées sur l'affichage du widget.
const AGES = [
  { label: '< 24 h', max: JOUR },
  { label: '1 à 3 jours', max: 3 * JOUR },
  { label: '3 à 7 jours', max: 7 * JOUR },
  { label: '1 à 4 semaines', max: 28 * JOUR },
  { label: '> 1 mois', max: Infinity },
];

const SEMAINES = 12;

const ticketBref = {
  select: {
    id: true,
    title: true,
    status: true,
    priority: true,
    createdAt: true,
    updatedAt: true,
    assigneeId: true,
    authorId: true,
    author: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true } },
    category: { select: { id: true, name: true } },
  },
};

// Compte par clé à partir d'un groupBy, en garantissant les clés absentes à 0.
function parCle(groupes, cles, champ) {
  const out = Object.fromEntries(cles.map((c) => [c, 0]));
  for (const g of groupes) out[g[champ]] = g._count._all;
  return out;
}

export async function ticketStats(where, user) {
  const maintenant = Date.now();
  const ouvert = { ...where, status: { in: OUVERTS } };
  const depuis7j = new Date(maintenant - 7 * JOUR);
  const debutHisto = new Date(maintenant - SEMAINES * 7 * JOUR);

  const [
    total,
    parStatut,
    ouvertsParPriorite,
    parCategorie,
    ouvertsParCategorie,
    ouvertsParAssigne,
    ouvertsParEquipe,
    crees7j,
    clotures7j,
    ouvertsRecents,
    histo,
  ] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['priority'], where: ouvert, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['categoryId'], where: ouvert, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['assigneeId'], where: ouvert, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['teamId'], where: ouvert, _count: { _all: true } }),
    prisma.ticket.count({ where: { ...where, createdAt: { gte: depuis7j } } }),
    prisma.ticket.count({
      where: { ...where, status: { in: ['resolved', 'closed'] }, updatedAt: { gte: depuis7j } },
    }),
    // Seules les dates de création sont nécessaires pour ventiler les âges :
    // une projection d'une colonne, pas les tickets entiers.
    prisma.ticket.findMany({ where: ouvert, select: { createdAt: true } }),
    prisma.ticket.findMany({
      where: { ...where, OR: [{ createdAt: { gte: debutHisto } }, { updatedAt: { gte: debutHisto } }] },
      select: { createdAt: true, updatedAt: true, status: true },
    }),
  ]);

  // Noms des catégories et équipes citées.
  const idsCategories = parCategorie.map((g) => g.categoryId).filter(Boolean);
  const idsEquipes = ouvertsParEquipe.map((g) => g.teamId).filter(Boolean);
  const idsAssignes = ouvertsParAssigne.map((g) => g.assigneeId).filter(Boolean);
  const [categories, equipes, assignes] = await Promise.all([
    prisma.category.findMany({ where: { id: { in: idsCategories } }, select: { id: true, name: true } }),
    prisma.team.findMany({ where: { id: { in: idsEquipes } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: idsAssignes } }, select: { id: true, name: true } }),
  ]);
  const nom = (liste) => Object.fromEntries(liste.map((x) => [x.id, x.name]));
  const nomCategorie = nom(categories);
  const nomEquipe = nom(equipes);
  const nomAssigne = nom(assignes);

  const statuts = parCle(parStatut, STATUSES, 'status');
  const ouvertsCat = Object.fromEntries(ouvertsParCategorie.map((g) => [g.categoryId, g._count._all]));

  // Ventilation par âge.
  const ages = AGES.map((a) => ({ label: a.label, count: 0 }));
  for (const t of ouvertsRecents) {
    const age = maintenant - t.createdAt.getTime();
    const i = AGES.findIndex((a) => age < a.max);
    ages[i === -1 ? ages.length - 1 : i].count += 1;
  }

  // Flux hebdomadaire : semaines glissantes, du lundi le plus ancien à aujourd'hui.
  const debutSemaine = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x.getTime();
  };
  const semaines = [];
  for (let i = SEMAINES - 1; i >= 0; i--) {
    semaines.push({ debut: debutSemaine(maintenant - i * 7 * JOUR), crees: 0, clotures: 0 });
  }
  const indexSemaine = (ms) => semaines.findIndex((s, i) => ms >= s.debut && (i === semaines.length - 1 || ms < semaines[i + 1].debut));
  for (const t of histo) {
    const iC = indexSemaine(t.createdAt.getTime());
    if (iC >= 0) semaines[iC].crees += 1;
    if (['resolved', 'closed'].includes(t.status)) {
      const iF = indexSemaine(t.updatedAt.getTime());
      if (iF >= 0) semaines[iF].clotures += 1;
    }
  }

  const compte = (liste, champ, id) => liste.find((g) => g[champ] === id)?._count._all ?? 0;
  const ouverts = OUVERTS.reduce((n, s) => n + statuts[s], 0);

  return {
    total,
    parStatut: statuts,
    ouvertsParPriorite: parCle(ouvertsParPriorite, PRIORITIES, 'priority'),
    parCategorie: parCategorie
      .filter((g) => g.categoryId)
      .map((g) => ({
        id: g.categoryId,
        nom: nomCategorie[g.categoryId] ?? '—',
        total: g._count._all,
        ouverts: ouvertsCat[g.categoryId] ?? 0,
      }))
      .sort((a, b) => b.total - a.total),
    ouvertsParAssigne: ouvertsParAssigne
      .map((g) => ({
        id: g.assigneeId,
        nom: g.assigneeId === null ? 'Non assigné' : nomAssigne[g.assigneeId] ?? '—',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    ouvertsParEquipe: ouvertsParEquipe
      .map((g) => ({
        id: g.teamId,
        nom: g.teamId === null ? 'Sans équipe' : nomEquipe[g.teamId] ?? '—',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    ageOuverts: ages,
    hebdo: semaines.map((s) => ({ debut: new Date(s.debut).toISOString(), crees: s.crees, clotures: s.clotures })),
    compteurs: {
      ouverts,
      nouveaux: statuts.new,
      enAttente: statuts.waiting,
      resolus: statuts.resolved,
      nonAssignesOuverts: compte(ouvertsParAssigne, 'assigneeId', null),
      mesAssignesOuverts: compte(ouvertsParAssigne, 'assigneeId', user.sub),
      hautesOuvertes: parCle(ouvertsParPriorite, PRIORITIES, 'priority').high,
      crees7j,
      clotures7j,
      mesOuverts: await prisma.ticket.count({ where: { ...ouvert, authorId: user.sub } }),
    },
  };
}

// Listes courtes des widgets « liste de tickets » : quelques lignes chacune,
// jamais l'intégralité du jeu.
export async function ticketListes(where, user, limite = 12) {
  const ouvert = { status: { in: OUVERTS } };
  const portees = {
    todo: { ...where, ...ouvert, OR: [{ assigneeId: null }, { assigneeId: user.sub }] },
    mine_assigned: { ...where, ...ouvert, assigneeId: user.sub },
    mine_authored: { ...where, authorId: user.sub },
    high: { ...where, ...ouvert, priority: 'high' },
    recent: where,
  };

  const entrees = await Promise.all(
    Object.entries(portees).map(async ([cle, w]) => [
      cle,
      await prisma.ticket.findMany({ where: w, ...ticketBref, orderBy: { updatedAt: 'desc' }, take: limite }),
    ])
  );
  return Object.fromEntries(entrees);
}
