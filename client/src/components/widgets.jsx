import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState } from './ui.jsx';
import TicketTable from './TicketTable.jsx';
import { METRICS, isOpen } from '../lib/dashboard.js';
import { TICKET_STATUS, TICKET_PRIORITY, ASSET_TYPE, ASSET_STATUS, formatDate } from '../lib/labels.js';

// Tokens (thème clair/sombre) plutôt que hex figés — cohérent avec le reste des
// graphiques : « créés » en bleu (statut nouveau), « clôturés » en vert (résolu).
const SERIES = { created: 'var(--color-status-new)', closed: 'var(--color-status-resolved)' };
const DAY = 24 * 60 * 60 * 1000;

// ---------- Briques graphiques partagées ----------

// Liste de barres horizontales : libellé, barre fine, compteur.
function BarList({ rows, color = 'var(--color-status-new)', emptyText = 'Aucune donnée' }) {
  const max = Math.max(...rows.map((r) => r.count), 0);
  if (max === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <ul className="space-y-2 px-4 py-3">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3" title={`${r.label} : ${r.count}`}>
          <span className="w-28 shrink-0 truncate text-xs text-ink-soft">{r.label}</span>
          <span className="h-2 flex-1 rounded-[2px] bg-canvas">
            <span
              className="block h-2 rounded-[2px]"
              style={{ width: `${(r.count / max) * 100}%`, background: r.color ?? color }}
            />
          </span>
          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-soft">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

// Barre segmentée générique + légende cliquable (libellé + compteur, jamais couleur seule).
function SegmentedBar({ items, total, linkFor }) {
  if (total === 0) return <EmptyState>Aucune donnée</EmptyState>;
  return (
    <div className="px-4 py-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded">
        {items
          .filter((i) => i.count > 0)
          .map((i) => (
            <div
              key={i.key}
              title={`${i.label} : ${i.count}`}
              style={{ background: i.fg, flexGrow: i.count }}
              className="min-w-1 rounded-[2px]"
            />
          ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {items.map((i) => {
          const inner = (
            <>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: i.fg }} />
              {i.label}
              <span className="tabular-nums text-ink-faint">{i.count}</span>
            </>
          );
          const cls = 'flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink';
          return linkFor ? (
            <Link key={i.key} to={linkFor(i.key)} className={cls}>
              {inner}
            </Link>
          ) : (
            <span key={i.key} className={cls}>
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Colonnes hebdomadaires, 1 ou 2 séries, légende obligatoire si 2 séries.
function WeeklyColumns({ series, weeks }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // Lundi de la semaine courante
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const buckets = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const from = new Date(start.getTime() - w * 7 * DAY);
    const to = new Date(from.getTime() + 7 * DAY);
    buckets.push({
      label: from.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      values: series.map((s) => s.dates.filter((d) => d >= from && d < to).length),
      from,
    });
  }
  const max = Math.max(1, ...buckets.flatMap((b) => b.values));

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex h-28 items-end gap-1 border-b border-line pb-px">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="flex h-full flex-1 items-end justify-center gap-0.5"
            title={`Semaine du ${b.label} — ${series.map((s, i) => `${s.label} : ${b.values[i]}`).join(', ')}`}
          >
            {b.values.map((v, i) => (
              <div
                key={i}
                className="w-full max-w-3 rounded-t-[3px]"
                style={{ height: `${(v / max) * 100}%`, background: series[i].color, minHeight: v > 0 ? 3 : 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {buckets.map((b, i) => (
          <div key={b.label} className="flex-1 text-center text-[10px] text-ink-faint">
            {weeks > 8 && i % 2 === 1 ? '' : b.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Donut SVG : segments en arcs avec écart, total au centre, légende à côté
// (libellé + compteur, jamais couleur seule). Tooltip natif par segment.
function DonutChart({ items, total, centerLabel }) {
  if (total === 0) return <EmptyState>Aucune donnée</EmptyState>;
  const visible = items.filter((i) => i.count > 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  const gap = visible.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0 -rotate-90">
        {visible.map((i) => {
          const len = Math.max((i.count / total) * C - gap, 1);
          const seg = (
            <circle
              key={i.key}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={i.fg}
              strokeWidth="14"
              strokeLinecap="butt"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            >
              <title>{`${i.label} : ${i.count}`}</title>
            </circle>
          );
          offset += (i.count / total) * C;
          return seg;
        })}
        <g className="rotate-90" style={{ transformOrigin: '60px 60px' }}>
          <text x="60" y="57" textAnchor="middle" className="fill-(--color-ink) text-xl font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {total}
          </text>
          <text x="60" y="73" textAnchor="middle" className="fill-(--color-ink-faint) text-[10px]">
            {centerLabel}
          </text>
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: i.fg }} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{i.label}</span>
            <span className="tabular-nums text-ink">{i.count}</span>
            <span className="w-9 text-right tabular-nums text-ink-faint">
              {Math.round((i.count / total) * 100)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Palette catégorielle (ordre fixe) pour les données sans couleur sémantique.
const CATEGORICAL = [
  'var(--color-status-new)',
  'var(--color-status-progress)',
  'var(--color-status-waiting)',
  'var(--color-status-resolved)',
  'var(--color-accent)',
  'var(--color-status-closed)',
];

// ---------- Widgets ----------

function StatWidget({ data, config }) {
  const metric = METRICS[config.metric] ?? METRICS.open_total;
  const value = metric.calc(data);
  const accent = metric.accent && value > 0;
  return (
    <Link to={metric.to} className="block h-full">
      <div className="flex h-full flex-col justify-between rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-faint">
        <div className="text-xs font-medium text-ink-soft">{metric.label}</div>
        <div
          className="mt-1 text-2xl font-semibold tabular-nums tracking-tight"
          style={accent ? { color: 'var(--color-accent)' } : undefined}
        >
          {value}
        </div>
      </div>
    </Link>
  );
}

function StatusBarWidget({ data }) {
  const items = Object.entries(TICKET_STATUS).map(([key, s]) => ({
    key,
    label: s.label,
    fg: s.fg,
    count: data.tickets.filter((t) => t.status === key).length,
  }));
  return (
    <Card title="Répartition par statut" action={<span className="text-xs tabular-nums text-ink-faint">{data.tickets.length} tickets</span>}>
      <SegmentedBar items={items} total={data.tickets.length} linkFor={(k) => `/tickets?status=${k}`} />
    </Card>
  );
}

function WeeklyFlowWidget({ data, config }) {
  const weeks = Number(config.weeks) || 8;
  const closed = data.tickets.filter((t) => ['resolved', 'closed'].includes(t.status));
  return (
    <Card title="Flux hebdomadaire" action={<span className="text-xs text-ink-faint">clôture ≈ dernière activité</span>}>
      <WeeklyColumns
        weeks={weeks}
        series={[
          { label: 'Créés', color: SERIES.created, dates: data.tickets.map((t) => new Date(t.createdAt)) },
          { label: 'Clôturés', color: SERIES.closed, dates: closed.map((t) => new Date(t.updatedAt)) },
        ]}
      />
    </Card>
  );
}

function CategoryBarsWidget({ data, config }) {
  const pool = config.scope === 'all' ? data.tickets : data.tickets.filter(isOpen);
  const byCat = {};
  for (const t of pool) {
    const name = t.category?.name ?? 'Sans catégorie';
    byCat[name] = (byCat[name] ?? 0) + 1;
  }
  const rows = Object.entries(byCat)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  return (
    <Card title="Tickets par catégorie" action={<span className="text-xs text-ink-faint">{config.scope === 'all' ? 'tous' : 'ouverts'}</span>}>
      <BarList rows={rows} emptyText="Aucun ticket" />
    </Card>
  );
}

function PriorityBarsWidget({ data }) {
  const rows = Object.entries(TICKET_PRIORITY).map(([key, p]) => ({
    label: p.label,
    color: p.fg,
    count: data.tickets.filter((t) => t.priority === key && isOpen(t)).length,
  }));
  return (
    <Card title="Tickets ouverts par priorité">
      <BarList rows={rows} emptyText="Aucun ticket ouvert" />
    </Card>
  );
}

function TechLoadWidget({ data }) {
  const byTech = {};
  for (const t of data.tickets.filter(isOpen)) {
    const name = t.assignee?.name ?? 'Non assigné';
    byTech[name] = (byTech[name] ?? 0) + 1;
  }
  const rows = Object.entries(byTech)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return (
    <Card title="Charge par technicien">
      <BarList rows={rows} emptyText="Aucun ticket ouvert" />
    </Card>
  );
}

function TeamLoadWidget({ data }) {
  const byTeam = {};
  for (const t of data.tickets.filter(isOpen)) {
    const name = t.team?.name ?? 'Sans équipe';
    byTeam[name] = (byTeam[name] ?? 0) + 1;
  }
  const rows = Object.entries(byTeam)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  return (
    <Card title="Charge par équipe">
      <BarList rows={rows} emptyText="Aucun ticket ouvert" />
    </Card>
  );
}

function AgeBarsWidget({ data }) {
  const buckets = [
    { label: '< 24 h', max: DAY },
    { label: '1 à 3 jours', max: 3 * DAY },
    { label: '3 à 7 jours', max: 7 * DAY },
    { label: '1 à 4 semaines', max: 28 * DAY },
    { label: '> 1 mois', max: Infinity },
  ];
  const rows = buckets.map((b) => ({ label: b.label, count: 0 }));
  for (const t of data.tickets.filter(isOpen)) {
    const age = Date.now() - new Date(t.createdAt);
    const idx = buckets.findIndex((b) => age < b.max);
    rows[idx === -1 ? rows.length - 1 : idx].count++;
  }
  return (
    <Card title="Âge des tickets ouverts">
      <BarList rows={rows} color="var(--color-status-progress)" emptyText="Aucun ticket ouvert" />
    </Card>
  );
}

function AssetTypeBarsWidget({ data }) {
  const rows = Object.entries(ASSET_TYPE).map(([key, label]) => ({
    label,
    count: data.assets.filter((a) => a.type === key).length,
  }));
  return (
    <Card title="Actifs par type">
      <BarList rows={rows} emptyText="Aucun actif" />
    </Card>
  );
}

function AssetStatusBarWidget({ data }) {
  const items = Object.entries(ASSET_STATUS).map(([key, s]) => ({
    key,
    label: s.label,
    fg: s.fg,
    count: data.assets.filter((a) => a.status === key).length,
  }));
  return (
    <Card title="État du parc" action={<span className="text-xs tabular-nums text-ink-faint">{data.assets.length} actifs</span>}>
      <SegmentedBar items={items} total={data.assets.length} />
    </Card>
  );
}

// Donut configurable : statut, catégorie, priorité ou état du parc.
function DonutWidget({ data, config }) {
  const source = config.source ?? 'status';
  let items = [];
  let total = 0;
  let title = '';
  let centerLabel = 'tickets';

  if (source === 'status') {
    title = 'Statuts (donut)';
    items = Object.entries(TICKET_STATUS).map(([key, s]) => ({
      key,
      label: s.label,
      fg: s.fg,
      count: data.tickets.filter((t) => t.status === key).length,
    }));
    total = data.tickets.length;
  } else if (source === 'priority') {
    title = 'Priorités (donut)';
    const open = data.tickets.filter(isOpen);
    items = Object.entries(TICKET_PRIORITY).map(([key, p]) => ({
      key,
      label: p.label,
      fg: p.fg,
      count: open.filter((t) => t.priority === key).length,
    }));
    total = open.length;
    centerLabel = 'ouverts';
  } else if (source === 'category') {
    title = 'Catégories (donut)';
    const byCat = {};
    for (const t of data.tickets) {
      const name = t.category?.name ?? 'Sans catégorie';
      byCat[name] = (byCat[name] ?? 0) + 1;
    }
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    // Au-delà de 5 catégories, on replie le reste dans « Autres ».
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
    items = top.map(([label, count], i) => ({ key: label, label, fg: CATEGORICAL[i], count }));
    if (rest > 0) items.push({ key: '__autres', label: 'Autres', fg: CATEGORICAL[5], count: rest });
    total = data.tickets.length;
  } else {
    title = 'État du parc (donut)';
    items = Object.entries(ASSET_STATUS).map(([key, s]) => ({
      key,
      label: s.label,
      fg: s.fg,
      count: data.assets.filter((a) => a.status === key).length,
    }));
    total = data.assets.length;
    centerLabel = 'actifs';
  }

  return (
    <Card title={title}>
      <DonutChart items={items} total={total} centerLabel={centerLabel} />
    </Card>
  );
}

const TICKET_SCOPES = {
  todo: {
    title: 'À traiter',
    filter: (t, user) => isOpen(t) && (!t.assigneeId || t.assigneeId === user.id),
  },
  mine_assigned: { title: 'Assignés à moi', filter: (t, user) => t.assigneeId === user.id && isOpen(t) },
  mine_authored: { title: 'Mes demandes', filter: (t, user) => t.authorId === user.id },
  high: { title: 'Priorité haute ouverte', filter: (t) => t.priority === 'high' && isOpen(t) },
  recent: { title: 'Activité récente', filter: () => true },
};

function TicketListWidget({ data, config }) {
  const scope = TICKET_SCOPES[config.scope] ?? TICKET_SCOPES.recent;
  const limit = Number(config.limit) || 5;
  const tickets = data.tickets.filter((t) => scope.filter(t, data.user)).slice(0, limit);
  return (
    <Card
      title={scope.title}
      action={
        <Link to="/tickets" className="text-xs text-ink-soft hover:text-accent">
          Tout voir
        </Link>
      }
    >
      <TicketTable dense tickets={tickets} emptyText="Aucun ticket dans cette vue" />
    </Card>
  );
}

function AssetListWidget({ data, config }) {
  const limit = Number(config.limit) || 5;
  const pool = config.scope === 'repair' ? data.assets.filter((a) => a.status === 'in_repair') : data.assets;
  const assets = pool.slice(0, limit);
  return (
    <Card
      title={config.scope === 'repair' ? 'Actifs en réparation' : 'Actifs récents'}
      action={
        <Link to="/inventaire" className="text-xs text-ink-soft hover:text-accent">
          Tout voir
        </Link>
      }
    >
      {assets.length === 0 ? (
        <EmptyState>Aucun actif dans cette vue</EmptyState>
      ) : (
        <ul>
          {assets.map((a) => (
            <li key={a.id} className="border-b border-line last:border-0">
              <Link to={`/inventaire/${a.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-canvas">
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-ink-faint">
                    {ASSET_TYPE[a.type]}
                    {a.assignedUser ? ` · ${a.assignedUser.name}` : ''}
                    {a.purchaseDate ? ` · acheté le ${formatDate(a.purchaseDate)}` : ''}
                  </div>
                </div>
                <Badge {...ASSET_STATUS[a.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const WIDGET_COMPONENTS = {
  stat: StatWidget,
  donut: DonutWidget,
  'status-bar': StatusBarWidget,
  'weekly-flow': WeeklyFlowWidget,
  'category-bars': CategoryBarsWidget,
  'priority-bars': PriorityBarsWidget,
  'tech-load': TechLoadWidget,
  'team-load': TeamLoadWidget,
  'age-bars': AgeBarsWidget,
  'asset-type-bars': AssetTypeBarsWidget,
  'asset-status-bar': AssetStatusBarWidget,
  'ticket-list': TicketListWidget,
  'asset-list': AssetListWidget,
};
