import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useResource } from '../lib/useResource.js';
import {
  Button,
  SearchInput,
  Select,
  Card,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from '../components/ui.jsx';
import TicketTable from '../components/TicketTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { TICKET_STATUS, TICKET_PRIORITY } from '../lib/labels.js';

const SORTS = [
  { value: '', label: 'Activité récente' },
  { value: 'oldest', label: 'Plus anciens' },
  { value: 'priority', label: 'Priorité haute d’abord' },
];

const DEFAULT_PAGE_SIZE = '25';

// Colonne du tableau (clé TicketTable) ↔ colonne de tri de l'API.
const COL_PARAM = {
  ticket: 'id',
  status: 'status',
  priority: 'priority',
  category: 'category',
  assignee: 'assignee',
  updated: 'updated',
};
const PARAM_COL = Object.fromEntries(Object.entries(COL_PARAM).map(([k, v]) => [v, k]));

// Paramètre d'URL « colonne-direction » → objet { key, dir } pour la flèche d'en-tête.
function parseSort(sortParam) {
  const [col, dir] = String(sortParam ?? '').split('-');
  if (PARAM_COL[col] && (dir === 'asc' || dir === 'desc')) return { key: PARAM_COL[col], dir };
  return null;
}

export default function Tickets() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [counts, setCounts] = useState(null); // conservés pendant les rechargements pour éviter le clignotement des chips
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [categories, setCategories] = useState([]);
  const [teams, setTeams] = useState([]);
  const [assignables, setAssignables] = useState([]);

  const isStaff = user.role !== 'user';

  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const assignee = params.get('assignee') ?? '';
  const author = params.get('author') ?? '';
  const category = params.get('category') ?? '';
  const team = params.get('team') ?? '';
  const sort = params.get('sort') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(Number(params.get('page')) || 1, 1);
  const pageSize = params.get('pageSize') ?? DEFAULT_PAGE_SIZE;

  // Listes de référence des filtres : leur échec ne bloque pas la page, il vide
  // simplement le menu concerné — la liste principale porte le message d'erreur.
  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => {});
    if (isStaff) {
      api.get('/teams').then(setTeams).catch(() => {});
      api.get('/users/assignable').then(setAssignables).catch(() => {});
    }
  }, [isStaff]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (priority) p.set('priority', priority);
    if (assignee === 'me') p.set('assigneeId', user.id);
    else if (assignee) p.set('assigneeId', assignee);
    if (author === 'me') p.set('authorId', user.id);
    if (category) p.set('categoryId', category);
    if (team) p.set('teamId', team);
    if (sort) p.set('sort', sort);
    if (q) p.set('q', q);
    p.set('page', page);
    p.set('pageSize', pageSize);
    return p.toString();
  }, [status, priority, assignee, author, category, team, sort, q, page, pageSize, user.id]);

  // Liste paginée côté serveur ; la réponse inclut les compteurs par statut pour les chips.
  const { data, error, loading, reload } = useResource(() => api.get(`/tickets?${query}`), [query]);

  useEffect(() => {
    if (data?.counts) setCounts(data.counts);
  }, [data]);

  // Tri par colonne (piloté par les en-têtes de TicketTable). Le tri s'applique
  // à l'ensemble du jeu côté serveur ; le reset (next === null) revient au défaut.
  const tableSort = parseSort(sort);
  function onSortColumn(next) {
    setFilter('sort', next ? `${COL_PARAM[next.key]}-${next.dir}` : '');
  }
  // Le menu déroulant ne reflète que ses propres présélections ; un tri par
  // colonne le laisse au neutre pour éviter un état incohérent.
  const selectSort = SORTS.some((s) => s.value === sort) ? sort : '';

  // Changer un filtre ramène à la première page.
  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (key !== 'page') next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function clearFilters() {
    setSearch('');
    setParams(status ? new URLSearchParams({ status }) : new URLSearchParams(), { replace: true });
  }

  const hasFilters = priority || assignee || author || category || team || q;
  const visible = loading || error ? null : data?.items ?? null;
  const totalAll = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  const chips = [
    { value: '', label: 'Tous', count: totalAll },
    { value: 'open', label: 'Ouverts', count: counts?.open ?? 0 },
    ...Object.entries(TICKET_STATUS).map(([value, s]) => ({
      value,
      label: s.label,
      count: counts?.[value] ?? 0,
    })),
  ];

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title="Tickets"
        actions={
          <Link to="/tickets/nouveau">
            <Button variant="primary">Nouveau ticket</Button>
          </Link>
        }
      />

      {/* Filtres rapides par statut. Le compteur est porté par le libellé, pas
          par la couleur : la puce active est repérable sans distinguer le rouge. */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par statut">
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={status === c.value}
            onClick={() => setFilter('status', c.value)}
            className={[
              'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors [@media(pointer:coarse)]:min-h-11',
              status === c.value
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line bg-surface text-ink-soft hover:border-ink-faint hover:text-ink',
            ].join(' ')}
          >
            {c.label}
            <span className="text-xs tabular-nums opacity-70">{c.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter('q', search.trim());
          }}
        >
          <SearchInput
            placeholder="Rechercher un ticket…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <Select
              aria-label="Catégorie"
              value={category}
              onChange={(e) => setFilter('category', e.target.value)}
              className="w-auto"
            >
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>

        <Select
              aria-label="Priorité"
              value={priority}
              onChange={(e) => setFilter('priority', e.target.value)}
              className="w-auto"
            >
          <option value="">Toutes priorités</option>
          {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>

        {isStaff && (
          <>
            <Select
              aria-label="Assigné à"
              value={assignee}
              onChange={(e) => setFilter('assignee', e.target.value)}
              className="w-auto"
            >
              <option value="">Tous assignés</option>
              <option value="me">Assignés à moi</option>
              <option value="none">Non assignés</option>
              {assignables
                .filter((u) => u.id !== user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
            </Select>
            <Select
              aria-label="Demandeur"
              value={author}
              onChange={(e) => setFilter('author', e.target.value)}
              className="w-auto"
            >
              <option value="">Tous demandeurs</option>
              <option value="me">Mes demandes</option>
            </Select>
            <Select
              aria-label="Équipe"
              value={team}
              onChange={(e) => setFilter('team', e.target.value)}
              className="w-auto"
            >
              <option value="">Toutes équipes</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </>
        )}

        <Select
          aria-label="Ordre de tri"
          value={selectSort}
          onChange={(e) => setFilter('sort', e.target.value)}
          className="w-auto"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>

        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            Effacer les filtres
          </Button>
        )}
      </div>

      <Card>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : visible === null ? (
          <TableSkeleton rows={6} columns={4} />
        ) : (
          <>
            <TicketTable
              tickets={visible}
              sort={tableSort}
              onSort={onSortColumn}
              emptyText={
                hasFilters || status ? 'Aucun ticket ne correspond à ces critères' : 'Aucun ticket'
              }
              emptyHint={
                hasFilters || status
                  ? 'Élargissez la recherche, ou effacez les filtres pour repartir de la liste complète.'
                  : 'Les demandes créées par les utilisateurs apparaîtront ici.'
              }
              emptyAction={
                hasFilters || status ? (
                  <Button onClick={clearFilters}>Effacer les filtres</Button>
                ) : (
                  <Link to="/tickets/nouveau">
                    <Button variant="primary">Nouveau ticket</Button>
                  </Link>
                )
              }
            />
            {/* Même pied de page que l'inventaire, les logiciels et l'aide : la
                page dupliquait cet appareil au lieu du composant commun. */}
            <Pagination
              total={data.total}
              page={page}
              pageSize={pageSize}
              unit="ticket"
              onPage={(p) => setFilter('page', p > 1 ? String(p) : '')}
              onPageSize={(v) => setFilter('pageSize', v)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
