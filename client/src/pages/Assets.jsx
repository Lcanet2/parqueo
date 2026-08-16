import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import {
  Badge,
  Button,
  Card,
  ErrorText,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from '../components/ui.jsx';
import { useResource } from '../lib/useResource.js';
import DataTable from '../components/DataTable.jsx';
import {
  ASSET_TYPE,
  ASSET_STATUS,
  ASSET_SOURCE,
  formatDate,
  formatRelative,
  isStaleAsset,
} from '../lib/labels.js';
import AssetForm from '../components/AssetForm.jsx';
import { IconAlert } from '../components/icons.jsx';

export default function Assets() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const staleDays = settings?.assetStaleDays ?? 0;
  const [creating, setCreating] = useState(false);
  const [config, setConfig] = useState({});
  const [syncing, setSyncing] = useState(null); // 'intune' | 'snmp' | null
  const [syncMsg, setSyncMsg] = useState(null);

  const isStaff = user.role !== 'user';

  const { data: assets, error, reload, set: setAssets } = useResource(() => api.get('/assets'), []);

  useEffect(() => {
    // Les boutons de synchro n'apparaissent que si le connecteur est configuré.
    if (user.role === 'admin') api.get('/auth/config').then(setConfig).catch(() => {});
  }, [user.role]);

  // Lance une synchronisation (Intune ou scan SNMP) et rafraîchit la liste.
  async function runSync(kind, path, format) {
    setSyncing(kind);
    setSyncMsg(null);
    try {
      const s = await api.post(path);
      setSyncMsg({ ok: true, text: format(s) });
      setAssets(await api.get('/assets'));
    } catch (err) {
      setSyncMsg({ ok: false, text: err.message });
    } finally {
      setSyncing(null);
    }
  }

  const syncIntune = () =>
    runSync(
      'intune',
      '/inventory/intune/sync',
      (s) => `Intune : ${s.total} appareil(s) — ${s.created} créé(s), ${s.updated} à jour${s.errors ? `, ${s.errors} erreur(s)` : ''}.`
    );

  const scanSnmp = () =>
    runSync(
      'snmp',
      '/inventory/snmp/scan',
      (s) => `Scan SNMP : ${s.responded} réponse(s) sur ${s.scanned} IP — ${s.created} créé(s), ${s.updated} à jour.`
    );

  const columns = [
    {
      key: 'name',
      label: 'Nom',
      value: (a) => a.name,
      filter: 'text',
      render: (a) => <span className="font-medium">{a.name}</span>,
    },
    { key: 'type', label: 'Type', value: (a) => ASSET_TYPE[a.type], tdClassName: 'text-ink-soft' },
    {
      key: 'location',
      label: 'Localisation',
      value: (a) => a.location,
      className: 'hidden sm:table-cell',
      tdClassName: 'hidden sm:table-cell text-ink-soft',
      render: (a) => a.location ?? '—',
    },
    {
      key: 'assignedUser',
      label: 'Utilisateur',
      value: (a) => a.assignedUser?.name,
      className: 'hidden md:table-cell',
      tdClassName: 'hidden md:table-cell text-ink-soft',
      render: (a) => a.assignedUser?.name ?? '—',
    },
    {
      key: 'purchaseDate',
      label: 'Achat',
      value: (a) => a.purchaseDate ?? '',
      filter: false,
      className: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell text-xs text-ink-faint',
      render: (a) => formatDate(a.purchaseDate),
    },
    {
      key: 'source',
      label: 'Source',
      value: (a) => ASSET_SOURCE[a.source]?.label,
      className: 'hidden sm:table-cell',
      tdClassName: 'hidden sm:table-cell',
      render: (a) => <Badge {...ASSET_SOURCE[a.source]} />,
    },
    {
      key: 'lastSeenAt',
      label: 'Vu',
      value: (a) => a.lastSeenAt ?? '',
      filter: false,
      className: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell text-xs text-ink-faint',
      render: (a) => {
        if (!a.lastSeenAt) return '—';
        const stale = isStaleAsset(a, staleDays);
        return (
          <span
            className={stale ? 'flex items-center gap-1 text-accent' : undefined}
            title={stale ? 'Aucune remontée récente' : undefined}
          >
            {formatRelative(a.lastSeenAt)}
            {stale && (
              <>
                <IconAlert size={12} />
                <span className="sr-only">Aucune remontée récente</span>
              </>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'État',
      value: (a) => ASSET_STATUS[a.status].label,
      render: (a) => <Badge {...ASSET_STATUS[a.status]} />,
    },
  ];

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title="Inventaire"
        description={`${assets?.length ?? 0} équipement${(assets?.length ?? 0) > 1 ? 's' : ''} suivi${(assets?.length ?? 0) > 1 ? 's' : ''}`}
        actions={
          isStaff && (
            <>
              {user.role === 'admin' && config.snmp && (
                <Button onClick={scanSnmp} disabled={syncing !== null} aria-busy={syncing === 'snmp'}>
                  {syncing === 'snmp' ? 'Scan en cours…' : 'Scanner le réseau'}
                </Button>
              )}
              {user.role === 'admin' && config.intune && (
                <Button onClick={syncIntune} disabled={syncing !== null} aria-busy={syncing === 'intune'}>
                  {syncing === 'intune' ? 'Synchronisation…' : 'Synchroniser Intune'}
                </Button>
              )}
              <Button variant="primary" onClick={() => setCreating(true)}>
                Ajouter un actif
              </Button>
            </>
          )
        }
      />

      {/* Le compte rendu de synchronisation est annoncé : l'opération dure
          plusieurs secondes et son résultat apparaît loin du bouton cliqué. */}
      {syncMsg &&
        (syncMsg.ok ? (
          <p role="status" className="text-sm text-status-resolved">
            {syncMsg.text}
          </p>
        ) : (
          <ErrorText>{syncMsg.text}</ErrorText>
        ))}

      {creating && (
        <Card title="Nouvel actif">
          <AssetForm
            onCancel={() => setCreating(false)}
            onSaved={(asset) => navigate(`/inventaire/${asset.id}`)}
          />
        </Card>
      )}

      <Card>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : assets === null ? (
          <TableSkeleton rows={8} columns={5} />
        ) : (
          <DataTable
            rows={assets}
            columns={columns}
            caption="Inventaire des équipements"
            rowLink={(a) => `/inventaire/${a.id}`}
            onRowClick={(a) => navigate(`/inventaire/${a.id}`)}
            emptyText="Aucun actif"
            emptyHint={
              isStaff
                ? 'Ajoutez un équipement à la main, ou branchez une source d’inventaire (agent, Intune, scan réseau).'
                : 'Aucun équipement ne vous est attribué pour le moment.'
            }
            emptyAction={
              isStaff && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Ajouter un actif
                </Button>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
