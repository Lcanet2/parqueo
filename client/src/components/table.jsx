import { IconSortArrow } from './icons.jsx';

// Appareil de tri commun à la liste des tickets et aux tableaux génériques :
// les deux composants avaient chacun leur copie de `compare`, du cycle de tri et
// de l'en-tête cliquable, avec des flèches en caractères texte.

export function compare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Cycle d'un en-tête : décroissant → croissant → sans tri (null).
export function cycleSort(current, key) {
  if (current?.key !== key) return { key, dir: 'desc' };
  if (current.dir === 'desc') return { key, dir: 'asc' };
  return null;
}

// `aria-sort` sur la cellule d'en-tête : un lecteur d'écran annonce la colonne
// triée et son sens, que la flèche ne dit qu'à l'œil.
export function SortHeader({ label, sortKey, sort, onSort, sortable = true, className = '' }) {
  const active = sortable && sort?.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : sortable ? 'none' : undefined}
      className={`px-4 py-2 font-medium ${className}`}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          title={`Trier par ${String(label).toLowerCase()}`}
          className={`flex cursor-pointer items-center gap-1 rounded-sm transition-colors hover:text-ink ${
            active ? 'text-ink' : ''
          }`}
        >
          {label}
          <span className="flex w-3 justify-center">
            {active && <IconSortArrow dir={sort.dir} size={10} />}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}
