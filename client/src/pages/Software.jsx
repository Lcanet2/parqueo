import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import {
  Badge,
  Card,
  Spinner,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  TableSkeleton,
} from '../components/ui.jsx';
import { IconX } from '../components/icons.jsx';
import { useResource } from '../lib/useResource.js';
import DataTable from '../components/DataTable.jsx';
import { ASSET_TYPE, ASSET_STATUS } from '../lib/labels.js';

// Catalogue de logiciels du parc (technicien/admin). La liste montre le nombre
// d'installations ; sélectionner un logiciel détaille les postes concernés.
export default function Software() {
  const { data: list, error, reload } = useResource(() => api.get('/software'), []);
  const [selected, setSelected] = useState(null); // { id, name, publisher, installs: [...] }
  const [loadingDetail, setLoadingDetail] = useState(false);

  function openSoftware(row) {
    setLoadingDetail(true);
    setSelected({ id: row.id, name: row.name, publisher: row.publisher, installs: null });
    api
      .get(`/software/${row.id}`)
      .then((s) => setSelected(s))
      .catch((err) => setSelected({ ...row, installs: [], error: err.message }))
      .finally(() => setLoadingDetail(false));
  }

  const columns = [
    {
      key: 'name',
      label: 'Logiciel',
      value: (s) => s.name,
      filter: 'text',
      // Bouton et non simple texte : le détail s'ouvre dans le panneau du bas
      // (pas de route dédiée), et la ligne doit rester actionnable au clavier.
      render: (s) => (
        <button
          type="button"
          onClick={() => openSoftware(s)}
          aria-expanded={selected?.id === s.id}
          className="cursor-pointer rounded-sm text-left font-medium hover:text-accent"
        >
          {s.name}
        </button>
      ),
    },
    {
      key: 'publisher',
      label: 'Éditeur',
      value: (s) => s.publisher,
      className: 'hidden sm:table-cell',
      tdClassName: 'hidden sm:table-cell text-ink-soft',
      render: (s) => s.publisher || '—',
    },
    {
      key: 'installs',
      label: 'Postes',
      value: (s) => s.installs,
      filter: false,
      tdClassName: 'text-ink-soft tabular-nums',
    },
  ];

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title="Logiciels"
        description="Catalogue des logiciels remontés par l'inventaire. Sélectionnez-en un pour voir les postes concernés."
      />

      <Card>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : list === null ? (
          <TableSkeleton rows={8} columns={3} />
        ) : (
          <DataTable
            rows={list}
            columns={columns}
            caption="Logiciels inventoriés"
            onRowClick={openSoftware}
            emptyText="Aucun logiciel inventorié"
            emptyHint="Les logiciels apparaissent ici dès qu'une source d'inventaire (agent GLPI, Intune) remonte les installations des postes."
          />
        )}
      </Card>

      {selected && (
        <Card
          title={`${selected.name}${selected.publisher ? ` — ${selected.publisher}` : ''}`}
          action={
            <IconButton label="Fermer le détail du logiciel" onClick={() => setSelected(null)}>
              <IconX />
            </IconButton>
          }
        >
          {loadingDetail || selected.installs === null ? (
            <Spinner />
          ) : selected.installs.length === 0 ? (
            <EmptyState title="Aucune installation">
              Ce logiciel n'est installé sur aucun poste de l'inventaire.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {selected.installs.map((inst) => (
                <li key={inst.id}>
                  <Link
                    to={`/inventaire/${inst.asset.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-canvas"
                  >
                    <span className="font-medium">
                      {inst.asset.name}
                      <span className="ml-2 text-xs text-ink-faint">{ASSET_TYPE[inst.asset.type]}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {inst.version && <span className="text-xs text-ink-faint">v{inst.version}</span>}
                      <Badge {...ASSET_STATUS[inst.asset.status]} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
