import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, Spinner, Card, EmptyState, ErrorText } from '../components/ui.jsx';
import AssetForm from '../components/AssetForm.jsx';
import { ASSET_TYPE, ASSET_STATUS, TICKET_STATUS, TICKET_PRIORITY, formatDate } from '../lib/labels.js';

export default function AssetDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  const isStaff = user.role !== 'user';

  const load = useCallback(() => {
    api.get(`/assets/${id}`).then(setAsset).catch(() => setNotFound(true));
  }, [id]);

  useEffect(load, [load]);

  if (notFound) {
    return (
      <p className="text-sm text-ink-soft">
        Actif introuvable. <Link to="/inventaire" className="text-accent">Retour à l'inventaire</Link>
      </p>
    );
  }
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
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs text-ink-faint">
            <Link to="/inventaire" className="hover:text-accent">Inventaire</Link> / {asset.name}
          </div>
          <h1 className="text-lg font-semibold tracking-tight">{asset.name}</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge {...ASSET_STATUS[asset.status]} />
            <span className="text-xs text-ink-faint">{ASSET_TYPE[asset.type]}</span>
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
          </dl>
        </Card>
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
