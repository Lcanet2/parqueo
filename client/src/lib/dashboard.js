// Système de dashboard modulaire : métriques, catalogue de widgets et layouts
// par défaut. Les layouts sont définis par rôle par l'administration
// (API /settings/dashboard) et s'appliquent à tous les comptes du rôle.

const OPEN = ['new', 'in_progress', 'waiting'];

export const isOpen = (t) => OPEN.includes(t.status);

// --- Métriques disponibles pour les tuiles de stat ---
// calc reçoit { tickets, assets, user } (données déjà filtrées par rôle côté API).
// calc reçoit { stats, assets, user } — les compteurs viennent de
// GET /api/tickets/stats, agrégés en SQL. Auparavant chaque métrique
// parcourait l'intégralité des tickets téléchargés dans le navigateur.
export const METRICS = {
  open_total: {
    label: 'Tickets ouverts',
    calc: ({ stats }) => stats.compteurs.ouverts,
    to: '/tickets',
  },
  new_total: {
    label: 'Nouveaux tickets',
    calc: ({ stats }) => stats.parStatut.new,
    to: '/tickets?status=new',
  },
  unassigned: {
    label: 'À traiter (non assignés)',
    staffOnly: true,
    calc: ({ stats }) => stats.compteurs.nonAssignesOuverts,
    to: '/tickets?status=new',
  },
  mine_assigned: {
    label: 'Mes tickets en cours',
    staffOnly: true,
    calc: ({ stats }) => stats.compteurs.mesAssignesOuverts,
    to: '/tickets?assignee=me',
  },
  high_open: {
    label: 'Priorité haute ouverte',
    accent: true,
    calc: ({ stats }) => stats.compteurs.hautesOuvertes,
    to: '/tickets?priority=high',
  },
  waiting: {
    label: 'En attente',
    calc: ({ stats }) => stats.parStatut.waiting,
    to: '/tickets?status=waiting',
  },
  resolved: {
    label: 'Résolus',
    calc: ({ stats }) => stats.parStatut.resolved,
    to: '/tickets?status=resolved',
  },
  created_7d: {
    label: 'Créés sur 7 jours',
    calc: ({ stats }) => stats.compteurs.crees7j,
    to: '/tickets',
  },
  resolved_7d: {
    label: 'Clôturés sur 7 jours',
    calc: ({ stats }) => stats.compteurs.clotures7j,
    to: '/tickets?status=resolved',
  },
  my_open: {
    label: 'Mes tickets ouverts',
    calc: ({ stats }) => stats.compteurs.mesOuverts,
    to: '/tickets',
  },
  assets_total: {
    label: 'Actifs',
    calc: ({ assets }) => assets.length,
    to: '/inventaire',
  },
  assets_repair: {
    label: 'Actifs en réparation',
    calc: ({ assets }) => assets.filter((a) => a.status === 'in_repair').length,
    to: '/inventaire',
  },
};

export function metricsForRole(role) {
  return Object.entries(METRICS).filter(([, m]) => !m.staffOnly || role !== 'user');
}

// --- Catalogue de widgets ---
// size : nombre de colonnes (grille de 4) — 1, 2 ou 4.
export const CATALOG = {
  stat: {
    name: 'Tuile de stat',
    description: 'Un chiffre clé, cliquable',
    defaultSize: 1,
    sizes: [1, 2],
    config: [{ key: 'metric', label: 'Métrique', options: 'metrics' }],
    defaultConfig: { metric: 'open_total' },
  },
  donut: {
    name: 'Donut',
    description: 'Camembert évidé : statuts, catégories, priorités ou parc',
    defaultSize: 2,
    sizes: [1, 2],
    config: [
      {
        key: 'source',
        label: 'Données',
        choices: [
          { value: 'status', label: 'Tickets par statut' },
          { value: 'category', label: 'Tickets par catégorie' },
          { value: 'priority', label: 'Tickets ouverts par priorité' },
          { value: 'assets', label: 'Actifs par état' },
        ],
      },
    ],
    defaultConfig: { source: 'status' },
  },
  'status-bar': {
    name: 'Répartition par statut',
    description: 'Barre segmentée des tickets par statut',
    defaultSize: 2,
    sizes: [2, 4],
    config: [],
    defaultConfig: {},
  },
  'weekly-flow': {
    name: 'Flux hebdomadaire',
    description: 'Tickets créés vs clôturés par semaine',
    defaultSize: 2,
    sizes: [2, 4],
    config: [
      {
        key: 'weeks',
        label: 'Période',
        choices: [
          { value: '4', label: '4 semaines' },
          { value: '8', label: '8 semaines' },
          { value: '12', label: '12 semaines' },
        ],
      },
    ],
    defaultConfig: { weeks: '8' },
  },
  'category-bars': {
    name: 'Tickets par catégorie',
    description: 'Volume de tickets par catégorie',
    defaultSize: 2,
    sizes: [1, 2],
    config: [
      {
        key: 'scope',
        label: 'Tickets comptés',
        choices: [
          { value: 'open', label: 'Ouverts uniquement' },
          { value: 'all', label: 'Tous' },
        ],
      },
    ],
    defaultConfig: { scope: 'open' },
  },
  'priority-bars': {
    name: 'Tickets par priorité',
    description: 'Volume de tickets ouverts par priorité',
    defaultSize: 1,
    sizes: [1, 2],
    config: [],
    defaultConfig: {},
  },
  'tech-load': {
    name: 'Charge par technicien',
    description: 'Tickets ouverts par assigné',
    staffOnly: true,
    defaultSize: 2,
    sizes: [1, 2],
    config: [],
    defaultConfig: {},
  },
  'team-load': {
    name: 'Charge par équipe',
    description: 'Tickets ouverts par équipe',
    staffOnly: true,
    defaultSize: 1,
    sizes: [1, 2],
    config: [],
    defaultConfig: {},
  },
  'age-bars': {
    name: 'Âge des tickets ouverts',
    description: 'Depuis combien de temps les tickets attendent',
    defaultSize: 2,
    sizes: [1, 2],
    config: [],
    defaultConfig: {},
  },
  'asset-type-bars': {
    name: 'Actifs par type',
    description: "Répartition de l'inventaire par type",
    defaultSize: 1,
    sizes: [1, 2],
    config: [],
    defaultConfig: {},
  },
  'asset-status-bar': {
    name: 'État du parc',
    description: 'Barre segmentée des actifs par état',
    defaultSize: 2,
    sizes: [2, 4],
    config: [],
    defaultConfig: {},
  },
  'ticket-list': {
    name: 'Liste de tickets',
    description: 'Liste filtrée, portée configurable',
    defaultSize: 4,
    sizes: [2, 4],
    config: [
      {
        key: 'scope',
        label: 'Portée',
        choices: [
          { value: 'todo', label: 'À traiter (non assignés + à moi)' },
          { value: 'mine_assigned', label: 'Assignés à moi' },
          { value: 'mine_authored', label: 'Mes demandes' },
          { value: 'high', label: 'Priorité haute ouverte' },
          { value: 'recent', label: 'Activité récente' },
        ],
      },
      {
        key: 'limit',
        label: 'Nombre',
        choices: [
          { value: '5', label: '5' },
          { value: '8', label: '8' },
          { value: '12', label: '12' },
        ],
      },
    ],
    defaultConfig: { scope: 'recent', limit: '5' },
  },
  'asset-list': {
    name: "Liste d'actifs",
    description: 'Actifs récents ou en réparation',
    defaultSize: 2,
    sizes: [2, 4],
    config: [
      {
        key: 'scope',
        label: 'Portée',
        choices: [
          { value: 'recent', label: 'Récents' },
          { value: 'repair', label: 'En réparation' },
        ],
      },
      {
        key: 'limit',
        label: 'Nombre',
        choices: [
          { value: '5', label: '5' },
          { value: '8', label: '8' },
        ],
      },
    ],
    defaultConfig: { scope: 'recent', limit: '5' },
  },
};

export function catalogForRole(role) {
  return Object.entries(CATALOG).filter(([, w]) => !w.staffOnly || role !== 'user');
}

// --- Layouts par défaut ---
const uid = () => crypto.randomUUID();

export function defaultLayout(role) {
  if (role === 'user') {
    return [
      { id: uid(), type: 'stat', size: 1, config: { metric: 'my_open' } },
      { id: uid(), type: 'stat', size: 1, config: { metric: 'waiting' } },
      { id: uid(), type: 'stat', size: 1, config: { metric: 'resolved' } },
      { id: uid(), type: 'stat', size: 1, config: { metric: 'assets_total' } },
      { id: uid(), type: 'status-bar', size: 2, config: {} },
      { id: uid(), type: 'weekly-flow', size: 2, config: { weeks: '8' } },
      { id: uid(), type: 'ticket-list', size: 4, config: { scope: 'mine_authored', limit: '5' } },
    ];
  }
  return [
    { id: uid(), type: 'stat', size: 1, config: { metric: 'unassigned' } },
    { id: uid(), type: 'stat', size: 1, config: { metric: 'mine_assigned' } },
    { id: uid(), type: 'stat', size: 1, config: { metric: 'high_open' } },
    { id: uid(), type: 'stat', size: 1, config: { metric: 'created_7d' } },
    { id: uid(), type: 'status-bar', size: 2, config: {} },
    { id: uid(), type: 'weekly-flow', size: 2, config: { weeks: '8' } },
    { id: uid(), type: 'tech-load', size: 2, config: {} },
    { id: uid(), type: 'category-bars', size: 2, config: { scope: 'open' } },
    { id: uid(), type: 'ticket-list', size: 4, config: { scope: 'todo', limit: '5' } },
  ];
}

export function newWidget(type) {
  const spec = CATALOG[type];
  return { id: uid(), type, size: spec.defaultSize, config: { ...spec.defaultConfig } };
}

// Nettoie un layout venu du serveur : widgets inconnus (évolution du
// catalogue) ou interdits pour le rôle écartés. null → layout par défaut.
export function sanitizeLayout(items, role) {
  if (!Array.isArray(items)) return defaultLayout(role);
  return items.filter((i) => CATALOG[i.type] && (!CATALOG[i.type].staffOnly || role !== 'user'));
}

// Le layout personnel (quand la permission est accordée) est désormais persisté
// en base via l'API /settings/dashboard/personal — conservé et synchronisé entre
// navigateurs, plus en localStorage.
