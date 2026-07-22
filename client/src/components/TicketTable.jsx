import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, EmptyState } from './ui.jsx';
import { TICKET_STATUS, TICKET_PRIORITY, formatDateTime } from '../lib/labels.js';

// Rangs d'ordre pour le tri local (widgets) — l'ordre des clés dans labels.js
// fait foi : new < in_progress < … et low < medium < high. Côté serveur, ces
// colonnes sont des enums Postgres, donc déjà triées dans cet ordre.
const STATUS_RANK = Object.fromEntries(Object.keys(TICKET_STATUS).map((k, i) => [k, i]));
const PRIORITY_RANK = Object.fromEntries(Object.keys(TICKET_PRIORITY).map((k, i) => [k, i]));

// Chaque colonne : sa clé de tri, son libellé et la valeur comparée en mode local.
const COLUMNS = {
  ticket: { label: 'Ticket', value: (t) => t.id },
  status: { label: 'Statut', value: (t) => STATUS_RANK[t.status] ?? -1 },
  priority: { label: 'Priorité', value: (t) => PRIORITY_RANK[t.priority] ?? -1 },
  category: { label: 'Catégorie', value: (t) => t.category?.name?.toLowerCase() ?? '' },
  assignee: { label: 'Assigné à', value: (t) => t.assignee?.name?.toLowerCase() ?? '' },
  updated: { label: 'Mis à jour', value: (t) => new Date(t.updatedAt).getTime() },
};

function compare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Cycle d'un en-tête : décroissant → croissant → sans tri (null).
function cycle(current, key) {
  if (current?.key !== key) return { key, dir: 'desc' };
  if (current.dir === 'desc') return { key, dir: 'asc' };
  return null;
}

// En-tête cliquable.
function SortHeader({ col, sort, onSort, className = '' }) {
  const active = sort?.key === col;
  const arrow = active ? (sort.dir === 'desc' ? '↓' : '↑') : '';
  return (
    <th className={`px-4 py-2 font-medium ${className}`}>
      <button
        onClick={() => onSort(col)}
        className={`flex cursor-pointer items-center gap-1 transition-colors hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {COLUMNS[col].label}
        <span className="w-2 tabular-nums">{arrow}</span>
      </button>
    </th>
  );
}

// Table de tickets réutilisable. Lignes entièrement cliquables ; cliquer un
// libellé de colonne trie (décroissant → croissant → reset).
//
// Deux modes selon les props :
//   • Contrôlé (page Tickets) : `sort` + `onSort` fournis → le tri est piloté
//     par le parent (serveur, sur l'ensemble du jeu, pagination respectée).
//   • Local (widgets dashboard) : sans props → tri en mémoire sur les lignes
//     affichées.
export default function TicketTable({ tickets, dense = false, emptyText = 'Aucun ticket', sort: sortProp, onSort: onSortProp }) {
  const navigate = useNavigate();
  const controlled = typeof onSortProp === 'function';
  const [localSort, setLocalSort] = useState(null);
  const sort = controlled ? sortProp ?? null : localSort;

  function handleSort(key) {
    const next = cycle(sort, key);
    if (controlled) onSortProp(next);
    else setLocalSort(next);
  }

  const rows = useMemo(() => {
    if (controlled || !sort) return tickets; // en mode contrôlé, le serveur a déjà trié
    const value = COLUMNS[sort.key].value;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...tickets].sort((a, b) => factor * compare(value(a), value(b)));
  }, [tickets, sort, controlled]);

  if (!tickets.length) return <EmptyState>{emptyText}</EmptyState>;

  const props = { sort, onSort: handleSort };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-faint">
            <SortHeader col="ticket" {...props} />
            <SortHeader col="status" {...props} />
            <SortHeader col="priority" {...props} />
            {!dense && <SortHeader col="category" className="hidden lg:table-cell" {...props} />}
            {!dense && <SortHeader col="assignee" className="hidden md:table-cell" {...props} />}
            <SortHeader col="updated" className="hidden sm:table-cell" {...props} />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              onClick={() => navigate(`/tickets/${t.id}`)}
              className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas"
            >
              <td className="px-4 py-2.5">
                <div className="font-medium text-ink">
                  <span className="mr-1.5 text-ink-faint">#{t.id}</span>
                  {t.title}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
                  <Avatar name={t.author?.name} id={t.author?.id ?? 0} size="sm" />
                  {t.author?.name}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <Badge {...TICKET_STATUS[t.status]} />
              </td>
              <td className="px-4 py-2.5">
                <Badge {...TICKET_PRIORITY[t.priority]} />
              </td>
              {!dense && (
                <td className="hidden px-4 py-2.5 text-ink-soft lg:table-cell">
                  {t.category?.name}
                </td>
              )}
              {!dense && (
                <td className="hidden px-4 py-2.5 md:table-cell">
                  {t.assignee ? (
                    <span className="flex items-center gap-1.5 text-ink-soft">
                      <Avatar name={t.assignee.name} id={t.assignee.id} size="sm" />
                      {t.assignee.name}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              )}
              <td className="hidden px-4 py-2.5 text-xs text-ink-faint sm:table-cell">
                {formatDateTime(t.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
