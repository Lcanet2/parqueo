import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, Spinner, Card } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import { ASSET_TYPE, ASSET_STATUS, formatDate } from '../lib/labels.js';
import AssetForm from '../components/AssetForm.jsx';

export default function Assets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assets, setAssets] = useState(null);
  const [creating, setCreating] = useState(false);

  const isStaff = user.role !== 'user';

  useEffect(() => {
    api.get('/assets').then(setAssets);
  }, []);

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
      key: 'status',
      label: 'État',
      value: (a) => ASSET_STATUS[a.status].label,
      render: (a) => <Badge {...ASSET_STATUS[a.status]} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Inventaire</h1>
        {isStaff && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            Ajouter un actif
          </Button>
        )}
      </div>

      {creating && (
        <Card title="Nouvel actif">
          <AssetForm
            onCancel={() => setCreating(false)}
            onSaved={(asset) => navigate(`/inventaire/${asset.id}`)}
          />
        </Card>
      )}

      <Card>
        {assets === null ? (
          <Spinner />
        ) : (
          <DataTable
            rows={assets}
            columns={columns}
            onRowClick={(a) => navigate(`/inventaire/${a.id}`)}
            emptyText="Aucun actif ne correspond à ces critères"
          />
        )}
      </Card>
    </div>
  );
}
