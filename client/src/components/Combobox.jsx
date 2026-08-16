import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconCheck } from './icons.jsx';

// Select recherchable : un champ texte filtre une liste d'options. Pour les
// listes longues (équipements, personnes) où un <select> natif devient pénible.
//
// options : [{ value, label }]  ·  value/onChange : valeur sélectionnée (string)
// allowEmpty ajoute une option de remise à zéro (emptyLabel).
//
// Le motif ARIA « combobox + listbox » est câblé (rôles, aria-expanded,
// aria-activedescendant) : sans lui, un lecteur d'écran annonçait un champ texte
// ordinaire et ne disait ni que des options existaient, ni laquelle était
// survolée par les flèches.
export default function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Rechercher…',
  allowEmpty = true,
  emptyLabel = 'Aucun',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listId = useId();
  const optionId = (i) => `${listId}-option-${i}`;

  const all = useMemo(
    () => (allowEmpty ? [{ value: '', label: emptyLabel }, ...options] : options),
    [options, allowEmpty, emptyLabel]
  );
  const selected = all.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all;
  }, [all, query]);

  // Fermeture au clic extérieur — on abandonne la recherche en cours.
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function choose(option) {
    onChange(option.value);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={open ? query : selected?.label ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={selected && !selected.value ? emptyLabel : placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? optionId(active) : undefined}
        autoComplete="off"
        className="w-full rounded-md border border-field bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-ink-faint">Aucun résultat</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value || '__empty'}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={[
                    'flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-sm',
                    i === active ? 'bg-canvas' : '',
                    o.value === value ? 'font-medium text-accent' : 'text-ink',
                    !o.value ? 'text-ink-soft' : '',
                  ].join(' ')}
                >
                  {o.label}
                  {o.value === value && o.value ? <IconCheck size={14} /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
