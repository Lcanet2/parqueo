export const TICKET_STATUS = {
  new: { label: 'Nouveau', fg: 'var(--color-status-new)', bg: 'var(--color-status-new-bg)' },
  in_progress: { label: 'En cours', fg: 'var(--color-status-progress)', bg: 'var(--color-status-progress-bg)' },
  waiting: { label: 'En attente', fg: 'var(--color-status-waiting)', bg: 'var(--color-status-waiting-bg)' },
  resolved: { label: 'Résolu', fg: 'var(--color-status-resolved)', bg: 'var(--color-status-resolved-bg)' },
  closed: { label: 'Fermé', fg: 'var(--color-status-closed)', bg: 'var(--color-status-closed-bg)' },
};

export const TICKET_PRIORITY = {
  low: { label: 'Basse', fg: 'var(--color-ink-soft)', bg: 'var(--color-status-closed-bg)' },
  medium: { label: 'Moyenne', fg: 'var(--color-status-progress)', bg: 'var(--color-status-progress-bg)' },
  high: { label: 'Haute', fg: 'var(--color-accent)', bg: 'var(--color-accent-soft)' },
};

export const ASSET_TYPE = {
  pc: 'PC',
  printer: 'Imprimante',
  server: 'Serveur',
  software: 'Logiciel',
};

export const ASSET_STATUS = {
  in_service: { label: 'En service', fg: 'var(--color-status-resolved)', bg: 'var(--color-status-resolved-bg)' },
  in_repair: { label: 'En réparation', fg: 'var(--color-status-progress)', bg: 'var(--color-status-progress-bg)' },
  retired: { label: 'Retiré', fg: 'var(--color-status-closed)', bg: 'var(--color-status-closed-bg)' },
};

export const ROLE = {
  admin: 'Admin',
  technician: 'Technicien',
  user: 'Utilisateur',
};

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
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
