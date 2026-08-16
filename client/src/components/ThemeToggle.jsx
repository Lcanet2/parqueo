import { useEffect, useState } from 'react';
import { getPreference, setPreference, watchSystemTheme } from '../lib/theme.js';
import { IconSun, IconMoon, IconDevice } from './icons.jsx';

const OPTIONS = [
  { value: 'system', label: 'Système', Icon: IconDevice },
  { value: 'light', label: 'Clair', Icon: IconSun },
  { value: 'dark', label: 'Sombre', Icon: IconMoon },
];

// État partagé par les deux commandes (barre latérale et page « Mon compte ») :
// changer le thème dans l'une doit rafraîchir l'autre.
function usePreference() {
  const [preference, set] = useState(getPreference);
  useEffect(watchSystemTheme, []);
  return [
    preference,
    (next) => {
      setPreference(next);
      set(next);
    },
  ];
}

// Commande compacte de la barre latérale : un bouton qui fait défiler les trois
// choix. Le libellé accessible dit l'état courant ET ce que le clic va faire —
// « Thème : système. Passer en clair » — parce qu'une icône seule ne dit ni
// l'un ni l'autre.
export function ThemeToggle() {
  const [preference, choose] = usePreference();
  const index = OPTIONS.findIndex((o) => o.value === preference);
  const current = OPTIONS[index] ?? OPTIONS[0];
  const next = OPTIONS[(index + 1) % OPTIONS.length];

  return (
    <button
      type="button"
      onClick={() => choose(next.value)}
      aria-label={`Thème : ${current.label.toLowerCase()}. Passer en ${next.label.toLowerCase()}`}
      title={`Thème : ${current.label.toLowerCase()}`}
      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
    >
      <current.Icon />
    </button>
  );
}

// Commande explicite de la page « Mon compte » : les trois choix visibles d'un
// coup, en groupe de boutons radio — le bouton qui fait défiler ne se découvre
// pas, et « Système » a besoin d'être nommé pour être compris.
export function ThemeChoice() {
  const [preference, choose] = usePreference();

  return (
    <div role="radiogroup" aria-label="Thème de l'interface" className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => {
        const active = preference === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(o.value)}
            className={[
              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors [@media(pointer:coarse)]:min-h-11',
              active
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line bg-surface text-ink-soft hover:border-field hover:text-ink',
            ].join(' ')}
          >
            <o.Icon size={14} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
