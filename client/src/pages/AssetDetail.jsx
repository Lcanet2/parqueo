import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, Spinner, Card, EmptyState, ErrorText, ErrorState } from '../components/ui.jsx';
import AssetForm from '../components/AssetForm.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import {
  ASSET_TYPE,
  ASSET_STATUS,
  ASSET_SOURCE,
  TICKET_STATUS,
  TICKET_PRIORITY,
  formatDate,
  formatRelative,
  isStaleAsset,
} from '../lib/labels.js';

// RAM stockée en Mo : affichée en Go dès qu'elle dépasse 1 Go.
function formatRam(mb) {
  if (!mb) return '—';
  return mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} Go` : `${mb} Mo`;
}

export default function AssetDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  const isStaff = user.role !== 'user';

  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .get(`/assets/${id}`)
      .then(setAsset)
      // 404 = actif inexistant ou invisible ; toute autre erreur (réseau,
      // serveur) mérite son propre message plutôt qu'un « introuvable » trompeur.
      .catch((err) => (err.status === 404 ? setNotFound(true) : setLoadError(err.message)));
  }, [id]);

  useEffect(load, [load]);

  if (notFound) {
    return (
      <p className="text-sm text-ink-soft">
        Actif introuvable. <Link to="/inventaire" className="text-accent">Retour à l'inventaire</Link>
      </p>
    );
  }
  if (loadError) return <ErrorState error={loadError} onRetry={load} />;
  if (!asset) return <Spinner />;

  async function remove() {
    if (!confirm(`Supprimer l'actif « ${asset.name} » ?`)) return;
    setError(null);
    try {
      await api.delete(`/assets/${asset.id}`);
      navigate('/inventaire');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-page space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs text-ink-faint">
            <Link to="/inventaire" className="hover:text-accent">Inventaire</Link> / {asset.name}
          </div>
          <h1 className="text-lg font-semibold tracking-tight">{asset.name}</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge {...ASSET_STATUS[asset.status]} />
            <span className="text-xs text-ink-faint">{ASSET_TYPE[asset.type]}</span>
            {asset.source !== 'manual' && <Badge {...ASSET_SOURCE[asset.source]} />}
          </div>
        </div>
        {isStaff && !editing && (
          <div className="flex gap-2">
            <Button onClick={() => setEditing(true)}>Modifier</Button>
            {user.role === 'admin' && (
              <Button variant="danger" onClick={remove}>Supprimer</Button>
            )}
          </div>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      {editing ? (
        <Card title="Modifier l'actif">
          <AssetForm
            asset={asset}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              load();
            }}
          />
        </Card>
      ) : (
        <>
          <Card title="Informations">
            <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-faint">Localisation</dt>
                <dd>{asset.location ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Utilisateur assigné</dt>
                <dd>{asset.assignedUser?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Date d'achat</dt>
                <dd>{formatDate(asset.purchaseDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Ajouté le</dt>
                <dd>{formatDate(asset.createdAt)}</dd>
              </div>
              {asset.serial && (
                <div>
                  <dt className="text-xs text-ink-faint">Numéro de série</dt>
                  <dd className="font-mono text-xs">{asset.serial}</dd>
                </div>
              )}
              {asset.model && (
                <div>
                  <dt className="text-xs text-ink-faint">Modèle</dt>
                  <dd>{[asset.manufacturer, asset.model].filter(Boolean).join(' ')}</dd>
                </div>
              )}
            </dl>
          </Card>

          {asset.source !== 'manual' && (
            <Card
              title="Matériel"
              action={
                <span className="flex items-center gap-2 text-xs text-ink-faint">
                  <Badge {...ASSET_SOURCE[asset.source]} />
                  <span className={isStaleAsset(asset, settings?.assetStaleDays ?? 0) ? 'text-accent' : undefined}>
                    vu {formatRelative(asset.lastSeenAt)}
                    {isStaleAsset(asset, settings?.assetStaleDays ?? 0) && ' ⚠'}
                  </span>
                </span>
              }
            >
              <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-faint">Système</dt>
                  <dd>{asset.os ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Processeur</dt>
                  <dd>{asset.cpu ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Mémoire</dt>
                  <dd>{formatRam(asset.ramMb)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Stockage</dt>
                  <dd>{asset.diskGb ? `${asset.diskGb} Go` : '—'}</dd>
                </div>
              </dl>
            </Card>
          )}

          {asset.software?.length > 0 && (
            <Card title={`Logiciels installés (${asset.software.length})`}>
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {asset.software.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                    <span className="font-medium">{s.software.name}</span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {[s.version, s.software.publisher].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Card title="Tickets liés">
        {asset.tickets.length === 0 ? (
          <EmptyState>Aucun ticket lié à cet actif</EmptyState>
        ) : (
          <ul>
            {asset.tickets.map((t) => (
              <li key={t.id} className="border-b border-line last:border-0">
                <Link
                  to={`/tickets/${t.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-canvas"
                >
                  <span className="text-sm font-medium">
                    <span className="mr-1.5 text-ink-faint">#{t.id}</span>
                    {t.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge {...TICKET_PRIORITY[t.priority]} />
                    <Badge {...TICKET_STATUS[t.status]} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
