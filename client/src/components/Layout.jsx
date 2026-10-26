import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Avatar, IconButton } from './ui.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import Brand from './Brand.jsx';
import { ROLE } from '../lib/labels.js';
import {
  IconDashboard,
  IconTickets,
  IconInventory,
  IconSoftware,
  IconBook,
  IconAdmin,
  IconSettings,
  IconLogout,
} from './icons.jsx';

// NavLink pose lui-même `aria-current="page"` sur le lien actif : l'état actif
// n'est donc pas porté par la seule couleur.
// La barre latérale est le panneau bleu : libellés en blanc atténué, et la page
// courante prend la forme de la panse du P, en blanc — plate contre le bord
// gauche de la barre, ronde à droite, du même blanc que la feuille où l'on
// travaille. Sur téléphone, la rangée défile : la pastille y est ronde des
// deux côtés, faute de bord où s'appuyer.
function navClass({ isActive }, { edge = true } = {}) {
  return [
    'flex h-8 items-center gap-2.5 text-sm transition-colors whitespace-nowrap',
    '[@media(pointer:coarse)]:min-h-11',
    edge ? '-ml-3 rounded-r-full pr-3 pl-5.5' : 'rounded-full px-3',
    isActive
      ? 'bg-surface font-medium text-ink [&_svg]:text-accent'
      : 'text-on-sign-soft hover:bg-sign-hover hover:text-on-sign',
  ].join(' ');
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  // L'inventaire peut être masqué aux utilisateurs finals dans Paramètres.
  const showInventory = user.role !== 'user' || settings?.assetsVisibleToUsers !== false;

  const links = [
    { to: '/', label: 'Tableau de bord', end: true, Icon: IconDashboard },
    { to: '/tickets', label: 'Tickets', Icon: IconTickets },
    ...(showInventory ? [{ to: '/inventaire', label: 'Inventaire', Icon: IconInventory }] : []),
    ...(user.role !== 'user' ? [{ to: '/logiciels', label: 'Logiciels', Icon: IconSoftware }] : []),
    { to: '/aide', label: 'Aide', Icon: IconBook },
  ];
  if (user.role === 'admin') {
    links.push({ to: '/admin', label: 'Administration', Icon: IconAdmin });
    links.push({ to: '/parametres', label: 'Paramètres', Icon: IconSettings });
  }

  function onLogout() {
    logout();
    navigate('/login');
  }

  const nav = (
    <nav aria-label="Navigation principale" className="flex flex-col gap-0.5 md:flex-1">
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
          <l.Icon />
          {l.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    // Le cadre (barre latérale, le panneau bleu) et la feuille (la page,
    // blanche) posée dessus, comme la plaque blanche d'un panneau. Sur
    // téléphone le cadre se réduit à la barre du haut et la feuille devient
    // l'écran. Dans le cadre, l'anneau de focus passe au blanc : l'encre ne se
    // verrait pas sur le bleu.
    <div className="min-h-screen bg-sign md:flex">
      {/* Lien d'évitement : au clavier, la première tabulation d'une page permet
          de sauter les huit liens de navigation répétés sur chaque écran. Il
          n'apparaît qu'une fois focalisé. */}
      <a
        href="#contenu"
        className="sr-only rounded-md bg-ink px-3 py-2 text-sm font-medium text-surface focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Aller au contenu
      </a>

      {/* Sidebar desktop */}
      <aside className="hidden w-57 shrink-0 flex-col px-3 pt-4 pb-3 text-on-sign md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto [--color-focus:var(--color-on-sign)]">
        {/* La marque était à 15 px, soit moins que les libellés de navigation
            juste en dessous : elle passait pour une ligne de menu parmi les
            autres. 22 px la remettent au rang d'en-tête. */}
        <div className="mb-7 flex items-center justify-between gap-2 pr-1 pl-2.5">
          <Link to="/" className="min-w-0 text-[23px] leading-none">
            <Brand mono />
          </Link>
          <ThemeToggle onSign />
        </div>
        {nav}
        <div className="pt-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <Link
              to="/compte"
              title="Mon compte"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md transition-colors hover:text-on-sign-soft"
            >
              <Avatar name={user.name} id={user.id} avatar={user.avatar} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-on-sign-soft">{ROLE[user.role]}</span>
              </span>
            </Link>
            <IconButton label="Se déconnecter" onClick={onLogout} variant="sign">
              <IconLogout />
            </IconButton>
          </div>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-10 bg-sign text-on-sign md:hidden [--color-focus:var(--color-on-sign)]">
        <div className="flex h-12 items-center justify-between px-4">
          <Link to="/" className="text-[19px] leading-none">
            <Brand mono />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle onSign />
            <Link to="/compte" className="text-sm text-on-sign-soft hover:text-on-sign">
              Mon compte
            </Link>
            <button onClick={onLogout} className="text-sm text-on-sign-soft hover:text-on-sign">
              Déconnexion
            </button>
          </div>
        </div>
        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={(state) => navClass(state, { edge: false })}>
              <l.Icon />
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* `tabIndex={-1}` : sans lui, le lien d'évitement déplacerait le défilement
          sans déplacer le focus clavier, qui repartirait du haut de la page. */}
      <main
        id="contenu"
        tabIndex={-1}
        className="min-w-0 flex-1 bg-surface px-4 py-5 focus:outline-none md:my-2 md:mr-2 md:min-h-[calc(100vh-1rem)] md:rounded-(--radius-sheet) md:px-8 md:py-7"
      >
        <Outlet />
      </main>
    </div>
  );
}
