import { useEffect, useState } from 'react';
import { setPreference, watchSystemTheme } from '../lib/theme.js';
import { resolveTheme } from '../lib/theme.js';
import { IconSun, IconMoon } from './icons.jsx';

const OPTIONS = [
  { value: 'light', label: 'Clair', Icon: IconSun },
  { value: 'dark', label: 'Sombre', Icon: IconMoon },
];

// État partagé par les deux commandes (barre latérale et page « Mon compte ») :
// changer le thème dans l'une doit rafraîchir l'autre.
function useTheme() {
  const [theme, set] = useState(resolveTheme);
  useEffect(() => {
    // Sans choix enregistré, l'OS peut basculer sous nos yeux : on garde
    // l'affichage en phase avec ce que voit réellement l'utilisateur.
    const stop = watchSystemTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const suivre = () => set(resolveTheme());
    mq.addEventListener('change', suivre);
    return () => {
      stop();
      mq.removeEventListener('change', suivre);
    };
  }, []);
  return [
    theme,
    (next) => {
      setPreference(next);
      set(next);
    },
  ];
}

// Commande compacte de la barre latérale : une simple bascule entre les deux
// thèmes. Le libellé accessible dit l'état courant ET ce que le clic va faire —
// « Thème : sombre. Passer en clair » — parce qu'une icône seule ne dit ni l'un
// ni l'autre.
export function ThemeToggle() {
  const [theme, choose] = useTheme();
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[0];
  const next = OPTIONS.find((o) => o.value !== current.value);

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

// Commande explicite de la page « Mon compte » : les deux choix visibles d'un
// coup, en groupe de boutons radio — la bascule de la barre latérale ne se
// découvre pas d'elle-même.
export function ThemeChoice() {
  const [theme, choose] = useTheme();

  return (
    <div role="radiogroup" aria-label="Thème de l'interface" className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => {
        const active = theme === o.value;
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
