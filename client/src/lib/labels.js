// `mark` : la pastille d'état (voir Badge). « En attente » est parqué : sa
// pastille est creuse, le ticket attend sur un bloc du workflow.
export const TICKET_STATUS = {
  new: { label: 'Nouveau', fg: 'var(--color-status-new)', bg: 'var(--color-status-new-bg)', mark: 'filled' },
  in_progress: { label: 'En cours', fg: 'var(--color-status-progress)', bg: 'var(--color-status-progress-bg)', mark: 'filled' },
  // `ink` : le bleu pâle du trait ne tient pas 4.5:1 en texte ; les badges
  // textuels (journal du ticket) prennent cette encre à la place.
  waiting: { label: 'En attente', fg: 'var(--color-status-waiting)', ink: 'var(--color-status-waiting-ink)', bg: 'var(--color-status-waiting-bg)', mark: 'parked' },
  resolved: { label: 'Résolu', fg: 'var(--color-status-resolved)', bg: 'var(--color-status-resolved-bg)', mark: 'filled' },
  closed: { label: 'Fermé', fg: 'var(--color-status-closed)', bg: 'var(--color-status-closed-bg)', mark: 'filled' },
};

// La priorité haute porte le signal négatif, pas la couleur de la marque : c'est
// une alerte, pas une sélection.
export const TICKET_PRIORITY = {
  low: { label: 'Basse', fg: 'var(--color-ink-soft)', bg: 'var(--color-status-closed-bg)' },
  medium: { label: 'Moyenne', fg: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
  high: { label: 'Haute', fg: 'var(--color-negative-ink)', bg: 'var(--color-negative-soft)' },
};

export const ASSET_TYPE = {
  pc: 'PC',
  printer: 'Imprimante',
  server: 'Serveur',
  software: 'Logiciel',
};

export const ASSET_STATUS = {
  in_service: { label: 'En service', fg: 'var(--color-status-resolved)', bg: 'var(--color-status-resolved-bg)', mark: 'filled' },
  in_repair: { label: 'En réparation', fg: 'var(--color-warning)', bg: 'var(--color-warning-soft)', mark: 'filled' },
  retired: { label: 'Retiré', fg: 'var(--color-status-closed)', bg: 'var(--color-status-closed-bg)', mark: 'filled' },
};

export const ROLE = {
  admin: 'Admin',
  technician: 'Technicien',
  user: 'Utilisateur',
};

// Origine d'un actif : saisi à la main, ou remonté par une source d'inventaire.
export const ASSET_SOURCE = {
  manual: { label: 'Manuel', fg: 'var(--color-status-closed)', bg: 'var(--color-status-closed-bg)' },
  agent: { label: 'Agent', fg: 'var(--color-status-new)', bg: 'var(--color-status-new-bg)' },
  intune: { label: 'Intune', fg: 'var(--color-status-progress)', bg: 'var(--color-status-progress-bg)' },
  scan: { label: 'Scan réseau', fg: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
};

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Un actif d'inventaire auto est « périmé » si sa dernière remontée dépasse le
// seuil (paramètre assetStaleDays). Signal purement visuel : le statut ne change
// pas. Les actifs saisis à la main (source manual) ne périment jamais.
export function isStaleAsset(asset, staleDays) {
  if (!staleDays || !asset || asset.source === 'manual' || !asset.lastSeenAt) return false;
  const ageDays = (Date.now() - new Date(asset.lastSeenAt).getTime()) / 86400000;
  return ageDays > staleDays;
}

// Temps écoulé lisible (« il y a 3 h »), utile pour la dernière remontée d'un
// actif : on voit d'un coup d'œil s'il est encore vu par l'inventaire.
export function formatRelative(iso) {
  if (!iso) return '—';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const steps = [
    [60, 'à l’instant', 1],
    [3600, 'il y a %d min', 60],
    [86400, 'il y a %d h', 3600],
    [2592000, 'il y a %d j', 86400],
    [31536000, 'il y a %d mois', 2592000],
    [Infinity, 'il y a %d ans', 31536000],
  ];
  for (const [limit, tpl, div] of steps) {
    if (secs < limit) return tpl.replace('%d', Math.max(1, Math.floor(secs / div)));
  }
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
