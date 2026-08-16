import { useState } from 'react';
import { Select, Button } from './ui.jsx';
import { IconArrowLeft, IconArrowRight } from './icons.jsx';

// Appareil de pagination commun à toute l'appli (tableaux et listes) pour une
// expérience uniforme : mêmes tailles de page et même pied « X–Y sur Z ».
export const PAGE_SIZES = ['10', '25', '50', '100', '500', 'all'];

// Découpe une liste déjà filtrée en pages. La page courante est bornée : si la
// liste rétrécit (recherche), on ne reste jamais sur une page vide.
export function usePaged(rows, initialPageSize = '25') {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  const total = rows.length;
  const isAll = pageSize === 'all';
  const size = isAll ? total || 1 : Number(pageSize);
  const pageCount = isAll ? 1 : Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pageCount);
  const pageRows = isAll ? rows : rows.slice((safePage - 1) * size, safePage * size);

  return {
    pageRows,
    total,
    page: safePage,
    pageSize,
    setPage,
    setPageSize: (v) => {
      setPageSize(v);
      setPage(1);
    },
  };
}

// Pied de pagination : compteur + sélecteur « par page » + Précédent/Suivant.
export function Pagination({ total, page, pageSize, onPage, onPageSize, unit = 'ligne' }) {
  if (total === 0) return null;
  const isAll = pageSize === 'all';
  const size = isAll ? 0 : Number(pageSize);
  const pageCount = isAll ? 1 : Math.max(1, Math.ceil(total / size));
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2"
    >
      {/* `aria-live` : après un changement de filtre ou de page, le nouveau
          décompte est annoncé au lieu de ne changer qu'à l'écran. */}
      <span className="text-xs tabular-nums text-ink-soft" aria-live="polite">
        {isAll || total <= size ? `${total} ${unit}${total > 1 ? 's' : ''}` : `${from}–${to} sur ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          Par page
          <Select value={pageSize} onChange={(e) => onPageSize(e.target.value)} className="w-auto">
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'Tout' : s}</option>
            ))}
          </Select>
        </label>
        {!isAll && total > size && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              <IconArrowLeft size={14} />
              Précédent
            </Button>
            <span className="px-1 text-xs tabular-nums text-ink-faint">
              {page} / {pageCount}
            </span>
            <Button variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              Suivant
              <IconArrowRight size={14} />
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
