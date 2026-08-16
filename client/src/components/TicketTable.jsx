import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Badge, EmptyState } from './ui.jsx';
import { compare, cycleSort, SortHeader } from './table.jsx';
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

// Table de tickets réutilisable. Le titre de chaque ligne est un vrai lien : la
// ligne entière reste cliquable à la souris, mais la navigation au clavier
// atteint le ticket, et le clic du milieu ouvre un onglet — ce qu'un `onClick`
// posé sur `<tr>` ne permettait ni à l'un ni à l'autre.
//
// Deux modes selon les props :
//   • Contrôlé (page Tickets) : `sort` + `onSort` fournis → le tri est piloté
//     par le parent (serveur, sur l'ensemble du jeu, pagination respectée).
//   • Local (widgets dashboard) : sans props → tri en mémoire sur les lignes
//     affichées.
export default function TicketTable({
  tickets,
  dense = false,
  emptyText = 'Aucun ticket',
  emptyHint,
  emptyAction,
  sort: sortProp,
  onSort: onSortProp,
}) {
  const navigate = useNavigate();
  const controlled = typeof onSortProp === 'function';
  const [localSort, setLocalSort] = useState(null);
  const sort = controlled ? sortProp ?? null : localSort;

  function handleSort(key) {
    const next = cycleSort(sort, key);
    if (controlled) onSortProp(next);
    else setLocalSort(next);
  }

  const rows = useMemo(() => {
    if (controlled || !sort) return tickets; // en mode contrôlé, le serveur a déjà trié
    const value = COLUMNS[sort.key].value;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...tickets].sort((a, b) => factor * compare(value(a), value(b)));
  }, [tickets, sort, controlled]);

  if (!tickets.length) {
    return (
      <EmptyState title={emptyText} action={emptyAction}>
        {emptyHint}
      </EmptyState>
    );
  }

  const head = (key, className) => (
    <SortHeader
      key={key}
      label={COLUMNS[key].label}
      sortKey={key}
      sort={sort}
      onSort={handleSort}
      className={className}
    />
  );

  // Le clic sur la ligne ne doit pas se déclencher quand l'utilisateur
  // sélectionne du texte, ni doubler le lien du titre.
  function onRowClick(e, id) {
    if (e.target.closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    navigate(`/tickets/${id}`);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Liste des tickets</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-faint">
            {head('ticket')}
            {head('status')}
            {head('priority')}
            {!dense && head('category', 'hidden lg:table-cell')}
            {!dense && head('assignee', 'hidden md:table-cell')}
            {head('updated', 'hidden sm:table-cell')}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              onClick={(e) => onRowClick(e, t.id)}
              className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas"
            >
              <td className="px-4 py-2.5">
                <Link
                  to={`/tickets/${t.id}`}
                  className="block rounded-sm font-medium text-ink hover:text-accent"
                >
                  <span className="mr-1.5 text-ink-faint">#{t.id}</span>
                  {t.title}
                </Link>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
                  <Avatar name={t.author?.name} id={t.author?.id ?? 0} avatar={t.author?.avatar} size="sm" />
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
                      <Avatar name={t.assignee.name} id={t.assignee.id} avatar={t.assignee.avatar} size="sm" />
                      {t.assignee.name}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              )}
              <td className="hidden px-4 py-2.5 text-xs whitespace-nowrap text-ink-faint sm:table-cell">
                {formatDateTime(t.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
