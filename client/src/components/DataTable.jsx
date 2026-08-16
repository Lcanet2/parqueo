import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Select, Input, EmptyState } from './ui.jsx';
import { compare, cycleSort, SortHeader } from './table.jsx';
import { Pagination } from './Pagination.jsx';

// Tableau générique client : un filtre par colonne (dropdown des valeurs
// distinctes, ou recherche texte), tri cyclique au clic sur l'en-tête, et
// pagination uniforme (10/25/50/100/500/Tout) — le même appareil que la liste
// des tickets, pour une expérience cohérente sur toute l'appli.
//
// Colonne : {
//   key,                      identifiant unique
//   label,                    en-tête
//   value: (row) => …,        valeur triée/filtrée (et cellule par défaut)
//   render: (row) => node,    cellule personnalisée (sinon value)
//   filter: 'select'|'text'|false,  type de filtre (défaut 'select' si value)
//   sortable: bool,           tri (défaut true si value)
//   className,                classes responsive partagées en-tête + cellule
// }
//
// `rowLink: (row) => '/chemin'` transforme la première cellule en vrai lien :
// la ligne reste cliquable à la souris, mais elle devient aussi atteignable au
// clavier et ouvrable dans un onglet — un `onClick` sur `<tr>` ne l'était pas.

const EMPTY = '__empty__'; // option « (vide) » pour filtrer les valeurs absentes

const norm = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

export default function DataTable({
  rows,
  columns,
  rowKey = (r) => r.id,
  onRowClick,
  rowLink,
  emptyText = 'Aucune donnée',
  emptyHint,
  emptyAction,
  caption,
  initialPageSize = '25',
}) {
  const [filters, setFilters] = useState({}); // { [key]: string }
  const [sort, setSort] = useState(null); // { key, dir }
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  const isAll = pageSize === 'all';
  const size = isAll ? 0 : Number(pageSize);

  // Options distinctes par colonne « select » (calculées sur toutes les lignes).
  const options = useMemo(() => {
    const out = {};
    for (const col of columns) {
      if ((col.filter ?? (col.value ? 'select' : false)) !== 'select') continue;
      const set = new Set();
      let hasEmpty = false;
      for (const r of rows) {
        const v = norm(col.value(r));
        if (v === '') hasEmpty = true;
        else set.add(v);
      }
      out[col.key] = { values: [...set].sort((a, b) => compare(a, b)), hasEmpty };
    }
    return out;
  }, [rows, columns]);

  // Filtrage.
  const filtered = useMemo(() => {
    return rows.filter((r) =>
      columns.every((col) => {
        const f = filters[col.key];
        if (!f) return true;
        const kind = col.filter ?? (col.value ? 'select' : false);
        if (kind === 'text') return norm(col.value(r)).toLowerCase().includes(f.toLowerCase());
        if (kind === 'select') return f === EMPTY ? norm(col.value(r)) === '' : norm(col.value(r)) === f;
        return true;
      })
    );
  }, [rows, columns, filters]);

  // Tri.
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => factor * compare(col.value(a), col.value(b)));
  }, [filtered, columns, sort]);

  const total = sorted.length;
  const pageCount = isAll ? 1 : Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pageCount);
  const pageRows = isAll ? sorted : sorted.slice((safePage - 1) * size, safePage * size);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }
  function onSort(key) {
    const col = columns.find((c) => c.key === key);
    if (!col || col.sortable === false || !col.value) return;
    setSort((s) => cycleSort(s, key));
  }
  function changePageSize(v) {
    setPageSize(v);
    setPage(1);
  }

  // Ni sur un lien déjà géré, ni pendant une sélection de texte.
  function handleRowClick(e, row) {
    if (e.target.closest('a, button, select, input')) return;
    if (window.getSelection()?.toString()) return;
    onRowClick(row);
  }

  const hasFilterRow = columns.some((c) => (c.filter ?? (c.value ? 'select' : false)) !== false);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-faint">
              {columns.map((col) => (
                <SortHeader
                  key={col.key}
                  label={col.label}
                  sortKey={col.key}
                  sort={sort}
                  onSort={onSort}
                  sortable={col.sortable !== false && !!col.value}
                  className={col.className ?? ''}
                />
              ))}
            </tr>
            {hasFilterRow && (
              <tr className="border-b border-line">
                {columns.map((col) => {
                  const kind = col.filter ?? (col.value ? 'select' : false);
                  return (
                    <th key={col.key} className={`px-2 py-1.5 font-normal ${col.className ?? ''}`}>
                      {kind === 'select' ? (
                        <Select
                          aria-label={`Filtrer par ${String(col.label).toLowerCase()}`}
                          value={filters[col.key] ?? ''}
                          onChange={(e) => setFilter(col.key, e.target.value)}
                          className="w-full text-xs"
                        >
                          <option value="">Tous</option>
                          {options[col.key]?.values.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                          {options[col.key]?.hasEmpty && <option value={EMPTY}>(vide)</option>}
                        </Select>
                      ) : kind === 'text' ? (
                        <Input
                          aria-label={`Filtrer par ${String(col.label).toLowerCase()}`}
                          value={filters[col.key] ?? ''}
                          onChange={(e) => setFilter(col.key, e.target.value)}
                          placeholder="Filtrer…"
                          className="text-xs"
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? (e) => handleRowClick(e, r) : undefined}
                className={`border-b border-line last:border-0 hover:bg-canvas ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col, i) => {
                  const cell = col.render ? col.render(r) : col.value ? col.value(r) : null;
                  return (
                    <td key={col.key} className={`px-4 py-2.5 ${col.tdClassName ?? col.className ?? ''}`}>
                      {i === 0 && rowLink ? (
                        <Link to={rowLink(r)} className="block rounded-sm hover:text-accent">
                          {cell}
                        </Link>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total === 0 ? (
        <EmptyState title={emptyText} action={emptyAction}>
          {emptyHint}
        </EmptyState>
      ) : (
        <Pagination
          total={total}
          page={safePage}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={changePageSize}
        />
      )}
    </div>
  );
}
