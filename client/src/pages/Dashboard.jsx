import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useResource } from '../lib/useResource.js';
import { Button, IconButton, Select, Spinner, ErrorState, PageHeader } from '../components/ui.jsx';
import { WIDGET_COMPONENTS } from '../components/widgets.jsx';
import {
  IconGrip,
  IconChevronLeft,
  IconChevronRight,
  IconSettings,
  IconX,
  IconCheck,
  IconPlus,
} from '../components/icons.jsx';
import {
  CATALOG,
  catalogForRole,
  metricsForRole,
  defaultLayout,
  sanitizeLayout,
  newWidget,
} from '../lib/dashboard.js';

const SIZE_CLASS = { 1: 'col-span-2 lg:col-span-1', 2: 'col-span-2', 4: 'col-span-2 lg:col-span-4' };
const SIZE_LABEL = { 1: 'S', 2: 'M', 4: 'L' };

const ROLE_TABS = [
  { value: 'admin', label: 'Dashboard des admins' },
  { value: 'technician', label: 'Dashboard des techniciens' },
  { value: 'user', label: 'Dashboard des utilisateurs' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [assets, setAssets] = useState(null);
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(false);
  // Rôle dont le layout est affiché/édité — seul l'admin peut en changer.
  const [editRole, setEditRole] = useState(user.role);
  // Permission (Paramètres) d'avoir un layout personnel par-dessus celui du rôle.
  const [canPersonalize, setCanPersonalize] = useState(false);
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState(null); // id du widget en cours de config
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [dragId, setDragId] = useState(null); // widget en cours de glisser-déposer

  // Dernier layout connu, pour persister à la fin d'un glisser sans dépendre du closure.
  const itemsRef = useRef(null);
  itemsRef.current = items;

  // Agrégats calculés en SQL : quelques kilo-octets, au lieu de l'intégralité
  // des tickets visibles (5 Mo à 10 000 tickets, à chaque chargement).
  const { data: stats, error: statsError, reload: reloadStats } = useResource(
    () => api.get('/tickets/stats'),
    []
  );

  // L'inventaire peut être fermé aux utilisateurs finals : une erreur ici n'est
  // pas anormale, on retombe sur une liste vide.
  useEffect(() => {
    api.get('/assets').then(setAssets).catch(() => setAssets([]));
  }, []);

  // Le layout du rôle vient du serveur (défini par l'administration) ; un
  // éventuel layout personnel (local) prime si la permission est accordée.
  useEffect(() => {
    api
      .get('/settings/dashboard')
      .then(({ layout, personal, canPersonalize: allowed }) => {
        setCanPersonalize(allowed);
        // Layout personnel (en base) prioritaire si autorisé, sinon celui du rôle.
        const base = !isAdmin && allowed ? personal ?? layout : layout;
        setItems(sanitizeLayout(base, user.role));
      })
      .catch(() => setItems(defaultLayout(user.role)));
  }, [user, isAdmin]);

  // Admin : enregistré pour le rôle édité, appliqué à tous ses comptes.
  // Non-admin autorisé : layout personnel stocké en base, visible de lui seul
  // mais retrouvé sur tous ses appareils.
  function update(next) {
    setItems(next);
    persist(next);
  }

  // Persiste le layout et remonte l'état à l'UI (au lieu d'avaler les erreurs).
  async function persist(next) {
    setSaveState('saving');
    try {
      if (isAdmin) await api.put(`/settings/dashboard/${editRole}`, { layout: next });
      else await api.put('/settings/dashboard/personal', { layout: next });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  // « Enregistré ✓ » s'efface tout seul après un court instant.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  // --- Glisser-déposer (réorganisation en mode édition) ---
  // Pendant le glisser on ne fait que réordonner visuellement ; on persiste une
  // seule fois au relâchement.
  function onDragOver(e, overId) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setItems((cur) => {
      const from = cur.findIndex((i) => i.id === dragId);
      const to = cur.findIndex((i) => i.id === overId);
      if (from === -1 || to === -1 || from === to) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function onDragEnd() {
    if (dragId) persist(itemsRef.current);
    setDragId(null);
  }

  function switchRole(role) {
    setEditRole(role);
    setConfiguring(null);
    setItems(null);
    api
      .get(`/settings/dashboard?role=${role}`)
      .then(({ layout }) => setItems(sanitizeLayout(layout, role)))
      .catch(() => setItems(defaultLayout(role)));
  }

  async function resetCurrent() {
    if (isAdmin) {
      await api.delete(`/settings/dashboard/${editRole}`).catch(() => {});
      setItems(defaultLayout(editRole));
    } else {
      await api.delete('/settings/dashboard/personal').catch(() => {});
      const { layout } = await api.get('/settings/dashboard');
      setItems(sanitizeLayout(layout, user.role));
    }
  }

  function stopEditing() {
    setEditing(false);
    setAdding(false);
    setConfiguring(null);
    if (isAdmin && editRole !== user.role) switchRole(user.role);
  }

  function move(id, dir) {
    const idx = items.findIndex((i) => i.id === id);
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    update(next);
  }

  function resize(id) {
    update(
      items.map((i) => {
        if (i.id !== id) return i;
        const sizes = CATALOG[i.type].sizes;
        const next = sizes[(sizes.indexOf(i.size) + 1) % sizes.length];
        return { ...i, size: next };
      })
    );
  }

  function remove(id) {
    update(items.filter((i) => i.id !== id));
  }

  function configure(id, key, value) {
    update(items.map((i) => (i.id === id ? { ...i, config: { ...i.config, [key]: value } } : i)));
  }

  function add(type) {
    update([...items, newWidget(type)]);
    setAdding(false);
  }

  if (statsError) return <ErrorState error={statsError} onRetry={reloadStats} />;
  if (!stats || !assets || !items) return <Spinner />;
  const data = { stats, assets, user };

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title="Tableau de bord"
        actions={
          editing ? (
            <>
              <SaveIndicator state={saveState} />
              <Button onClick={resetCurrent}>Réinitialiser</Button>
              <Button variant="primary" onClick={stopEditing}>
                Terminé
              </Button>
            </>
          ) : (
            <>
              {(isAdmin || canPersonalize) && (
                <Button onClick={() => setEditing(true)}>Personnaliser</Button>
              )}
              <Link to="/tickets/nouveau">
                <Button variant="primary">Nouveau ticket</Button>
              </Link>
            </>
          )
        }
      />

      {editing && (
        <div className="rounded-lg border border-dashed border-ink-faint bg-surface px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
            {isAdmin ? (
              <>
                <Select
                  aria-label="Rôle dont le tableau de bord est édité"
                  value={editRole}
                  onChange={(e) => switchRole(e.target.value)}
                  className="w-auto"
                >
                  {ROLE_TABS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </Select>
                <span className="text-xs text-ink-faint">
                  S'applique à tous les comptes de ce rôle · aperçu avec vos données
                </span>
              </>
            ) : (
              <span className="text-xs text-ink-faint">
                Personnalisation personnelle — visible uniquement par vous, sur tous vos
                appareils. « Réinitialiser » revient au tableau de bord défini par
                l'administration.
              </span>
            )}
          </div>
          {adding ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Ajouter un widget</span>
                <IconButton label="Fermer le catalogue de widgets" onClick={() => setAdding(false)}>
                  <IconX />
                </IconButton>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {catalogForRole(editRole).map(([type, spec]) => (
                  <button
                    key={type}
                    onClick={() => add(type)}
                    className="cursor-pointer rounded-md border border-line px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent-soft"
                  >
                    <div className="text-sm font-medium">{spec.name}</div>
                    <div className="text-xs text-ink-faint">{spec.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-1 text-sm text-ink-soft">
                Mode édition : glissez un widget par sa poignée
                <IconGrip className="text-ink" />
                (ou les flèches) pour le déplacer, redimensionnez (S/M/L), configurez
                <IconSettings size={14} className="text-ink" />
                ou retirez
                <IconX size={14} className="text-ink" />.
              </p>
              <Button onClick={() => setAdding(true)}>
                <IconPlus size={14} />
                Ajouter un widget
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item, idx) => {
          const spec = CATALOG[item.type];
          const Widget = WIDGET_COMPONENTS[item.type];
          if (!spec || !Widget) return null;
          return (
            <div
              key={item.id}
              // Colonne flex : la carte occupe la hauteur restante sous la
              // poignée d'édition, et remplit donc toute la cellule de grille —
              // les cartes d'une même rangée s'arrêtent au même niveau.
              className={`flex flex-col ${SIZE_CLASS[item.size] ?? SIZE_CLASS[2]} ${
                dragId === item.id ? 'opacity-40' : ''
              }`}
              onDragOver={editing ? (e) => onDragOver(e, item.id) : undefined}
              onDrop={editing ? (e) => e.preventDefault() : undefined}
            >
              {editing && (
                <div
                  className="mb-1 flex items-center justify-between rounded-md border border-dashed border-ink-faint bg-canvas px-2 py-1"
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={onDragEnd}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="cursor-grab text-ink-faint active:cursor-grabbing">
                      <IconGrip />
                    </span>
                    <span className="truncate text-xs font-medium text-ink-soft">{spec.name}</span>
                  </span>
                  {/* Chaque commande porte le nom du widget dans son libellé :
                      « Déplacer avant » répété huit fois ne dit pas lequel. */}
                  <span className="flex items-center gap-0.5">
                    <IconButton
                      label={`Déplacer « ${spec.name} » avant`}
                      onClick={() => move(item.id, -1)}
                      disabled={idx === 0}
                      className="h-7 w-7"
                    >
                      <IconChevronLeft size={14} />
                    </IconButton>
                    <IconButton
                      label={`Déplacer « ${spec.name} » après`}
                      onClick={() => move(item.id, 1)}
                      disabled={idx === items.length - 1}
                      className="h-7 w-7"
                    >
                      <IconChevronRight size={14} />
                    </IconButton>
                    {spec.sizes.length > 1 && (
                      <IconButton
                        label={`Taille de « ${spec.name} » (actuellement ${SIZE_LABEL[item.size]})`}
                        onClick={() => resize(item.id)}
                        className="h-7 w-7 text-xs font-semibold"
                      >
                        {SIZE_LABEL[item.size]}
                      </IconButton>
                    )}
                    {spec.config.length > 0 && (
                      <IconButton
                        label={`Configurer « ${spec.name} »`}
                        onClick={() => setConfiguring(configuring === item.id ? null : item.id)}
                        aria-expanded={configuring === item.id}
                        variant={configuring === item.id ? 'active' : 'ghost'}
                        className="h-7 w-7"
                      >
                        <IconSettings size={14} />
                      </IconButton>
                    )}
                    <IconButton
                      label={`Retirer « ${spec.name} »`}
                      onClick={() => remove(item.id)}
                      variant="danger"
                      className="h-7 w-7"
                    >
                      <IconX size={14} />
                    </IconButton>
                  </span>
                </div>
              )}
              {editing && configuring === item.id && (
                <div className="mb-1 space-y-2 rounded-md border border-line bg-surface p-2">
                  {spec.config.map((field) => (
                    <label key={field.key} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-xs text-ink-soft">{field.label}</span>
                      <Select
                        value={item.config[field.key] ?? ''}
                        onChange={(e) => configure(item.id, field.key, e.target.value)}
                      >
                        {(field.options === 'metrics'
                          ? metricsForRole(editRole).map(([value, m]) => ({ value, label: m.label }))
                          : field.choices
                        ).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                    </label>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1">
                <Widget data={data} config={item.config} />
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-faint">
          {isAdmin || canPersonalize
            ? 'Tableau de bord vide — cliquez sur « Personnaliser » puis « Ajouter un widget ».'
            : 'Tableau de bord vide — la configuration est gérée par l\'administration.'}
        </p>
      )}
    </div>
  );
}

// Retour visuel de la sauvegarde du layout (au lieu d'échouer en silence).
function SaveIndicator({ state }) {
  if (state === 'idle') return null;
  const map = {
    saving: { text: 'Enregistrement…', cls: 'text-ink-faint' },
    saved: { text: 'Enregistré', cls: 'text-status-resolved', icon: true },
    error: { text: 'Échec de l’enregistrement', cls: 'text-accent' },
  };
  const { text, cls, icon } = map[state];
  return (
    <span className={`flex items-center gap-1 text-xs ${cls}`} role="status">
      {icon && <IconCheck size={12} />}
      {text}
    </span>
  );
}
