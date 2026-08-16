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
// n'est donc pas porté par la seule couleur d'accent.
function navClass({ isActive }) {
  return [
    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
    '[@media(pointer:coarse)]:min-h-11',
    isActive
      ? 'bg-accent-soft font-medium text-accent'
      : 'text-ink-soft hover:bg-canvas hover:text-ink',
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
    <div className="min-h-screen md:flex">
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
      <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div className="mb-6 flex items-center justify-between gap-2 px-3">
          <Link to="/" className="min-w-0 text-[15px]">
            <Brand />
          </Link>
          <ThemeToggle />
        </div>
        {nav}
        <div className="border-t border-line pt-3">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <Link
              to="/compte"
              title="Mon compte"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md transition-colors hover:text-accent"
            >
              <Avatar name={user.name} id={user.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-ink-faint">{ROLE[user.role]}</span>
              </span>
            </Link>
            <IconButton label="Se déconnecter" onClick={onLogout} variant="danger">
              <IconLogout />
            </IconButton>
          </div>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link to="/" className="text-[15px]">
            <Brand />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/compte" className="text-sm text-ink-soft">
              Mon compte
            </Link>
            <button onClick={onLogout} className="text-sm text-ink-soft">
              Déconnexion
            </button>
          </div>
        </div>
        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
              <l.Icon />
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* `tabIndex={-1}` : sans lui, le lien d'évitement déplacerait le défilement
          sans déplacer le focus clavier, qui repartirait du haut de la page. */}
      <main id="contenu" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 focus:outline-none md:px-8 md:py-6">
        <Outlet />
      </main>
    </div>
  );
}
