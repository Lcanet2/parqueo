import { useEffect, useState } from 'react';
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
import Combobox from '../components/Combobox.jsx';
import { ASSET_TYPE, ASSET_STATUS } from '../lib/labels.js';

// Filtre de la colonne « Postes » : par rareté. Un logiciel présent sur un seul
// poste est souvent le plus intéressant (installation sauvage, licence isolée) ;
// « aucune » repère les entrées du catalogue dont tous les postes ont disparu.
const TRANCHES_POSTES = [
  { value: '0', label: 'Aucune installation', test: (s) => s.installs === 0 },
  { value: '1', label: 'Un seul poste', test: (s) => s.installs === 1 },
  { value: '2-10', label: '2 à 10 postes', test: (s) => s.installs >= 2 && s.installs <= 10 },
  { value: 'gt10', label: 'Plus de 10 postes', test: (s) => s.installs > 10 },
];

// Catalogue de logiciels du parc (technicien/admin). La liste montre le nombre
// d'installations ; sélectionner un logiciel détaille les postes concernés.
// Choisir un poste restreint le catalogue à ce qui y est installé.
export default function Software() {
  const [assetId, setAssetId] = useState('');
  const [assets, setAssets] = useState([]);
  const { data: list, error, loading, reload } = useResource(
    () => api.get(assetId ? `/software?assetId=${assetId}` : '/software'),
    [assetId]
  );

  useEffect(() => {
    // Liste des postes du sélecteur : accessoire, son échec laisse le catalogue
    // complet utilisable.
    api.get('/assets').then(setAssets).catch(() => setAssets([]));
  }, []);
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
    // Version installée sur le poste choisi (seulement quand un poste l'est).
    ...(assetId
      ? [
          {
            key: 'versions',
            label: 'Version',
            value: (s) => s.versions?.join(', ') ?? '',
            filter: 'text',
            tdClassName: 'text-ink-soft tabular-nums',
            render: (s) => s.versions?.join(', ') || '—',
          },
        ]
      : []),
    {
      key: 'installs',
      label: assetId ? 'Postes (parc)' : 'Postes',
      value: (s) => s.installs,
      filterOptions: TRANCHES_POSTES,
      tdClassName: 'text-ink-soft tabular-nums',
    },
  ];

  const poste = assets.find((a) => String(a.id) === assetId);

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title="Logiciels"
        description="Catalogue des logiciels remontés par l'inventaire. Sélectionnez-en un pour voir les postes concernés."
        actions={
          <div className="w-72 max-w-full">
            <Combobox
              ariaLabel="Filtrer par poste"
              value={assetId}
              onChange={(v) => {
                setAssetId(v);
                setSelected(null);
              }}
              options={assets.map((a) => ({ value: String(a.id), label: a.name }))}
              placeholder="Filtrer par poste…"
              emptyLabel="Tous les postes"
            />
          </div>
        }
      />

      <Card>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : list === null || loading ? (
          <TableSkeleton rows={8} columns={assetId ? 4 : 3} />
        ) : (
          <DataTable
            // Remonté à chaque changement de poste : les filtres de colonnes
            // portaient sur l'ancienne liste et la colonne Version apparaît.
            key={assetId || 'tous'}
            rows={list}
            columns={columns}
            caption="Logiciels inventoriés"
            onRowClick={openSoftware}
            emptyText={poste ? `Aucun logiciel remonté pour ${poste.name}` : 'Aucun logiciel inventorié'}
            emptyHint={
              poste
                ? 'Ce poste n’a pas encore envoyé de liste de logiciels : seuls l’agent GLPI et les rapports d’inventaire en fournissent (pas Intune ni le scan SNMP).'
                : "Les logiciels apparaissent ici dès que l'agent GLPI ou un rapport d'inventaire remonte les installations des postes (Intune et le scan SNMP n'en fournissent pas)."
            }
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
