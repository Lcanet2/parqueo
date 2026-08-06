import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useResource } from '../lib/useResource.js';
import { Spinner, ErrorState } from '../components/ui.jsx';
import { IconForm, IconPencil, IconChevronRight } from '../components/icons.jsx';

// Catalogue de demandes : formulaires prédéfinis + demande libre.
export default function TicketCatalog() {
  const { data: forms, error, reload } = useResource(() => api.get('/forms'), []);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!forms) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Nouvelle demande</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Choisissez le type de demande — ou décrivez librement votre problème.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/tickets/nouveau/libre"
          className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
        >
          <span className="mt-0.5 rounded-md bg-accent-soft p-2 text-accent">
            <IconPencil size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Signaler un problème</span>
              <IconChevronRight className="text-ink-faint transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              Décrivez librement votre souci : panne, bug, question…
            </span>
          </span>
        </Link>

        {forms.map((f) => (
          <Link
            key={f.id}
            to={`/demandes/${f.id}`}
            className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
          >
            <span className="mt-0.5 rounded-md bg-canvas p-2 text-ink-soft">
              <IconForm size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{f.name}</span>
                <IconChevronRight className="text-ink-faint transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {f.description ?? f.category?.name}
              </span>
            </span>
          </Link>
        ))}
      </div>

      {forms.length === 0 && (
        <p className="text-xs text-ink-faint">
          Aucun formulaire prédéfini pour le moment — les administrateurs peuvent en créer dans
          Administration → Formulaires.
        </p>
      )}
    </div>
  );
}
