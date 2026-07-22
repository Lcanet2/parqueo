import { Link } from 'react-router-dom';
import { TICKET_STATUS } from '../lib/labels.js';

// Tuile de stat cliquable — chaque tuile mène à la vue filtrée correspondante.
export function StatTile({ label, value, hint, to, accent = false }) {
  const content = (
    <div className="flex h-full flex-col justify-between rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-faint">
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="text-2xl font-semibold tabular-nums tracking-tight"
          style={accent ? { color: 'var(--color-accent)' } : undefined}
        >
          {value}
        </span>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

// Barre de répartition par statut : segments avec écart de 2px,
// légende avec libellé + compteur sous la barre (jamais couleur seule).
export function StatusBreakdown({ tickets }) {
  const counts = Object.keys(TICKET_STATUS).map((key) => ({
    key,
    ...TICKET_STATUS[key],
    count: tickets.filter((t) => t.status === key).length,
  }));
  const total = tickets.length;

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink-soft">Répartition par statut</span>
        <span className="text-xs tabular-nums text-ink-faint">{total} tickets</span>
      </div>
      {total === 0 ? (
        <p className="py-2 text-sm text-ink-faint">Aucun ticket</p>
      ) : (
        <>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded">
            {counts
              .filter((c) => c.count > 0)
              .map((c) => (
                <div
                  key={c.key}
                  title={`${c.label} : ${c.count}`}
                  style={{ background: c.fg, flexGrow: c.count }}
                  className="min-w-1 rounded-[2px]"
                />
              ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {counts.map((c) => (
              <Link
                key={c.key}
                to={`/tickets?status=${c.key}`}
                className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
              >
                <span className="h-2 w-2 rounded-[2px]" style={{ background: c.fg }} />
                {c.label}
                <span className="tabular-nums text-ink-faint">{c.count}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
