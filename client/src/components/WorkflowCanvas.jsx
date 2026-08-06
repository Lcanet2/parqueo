import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { Button, Input, Select, Textarea, Field, ErrorText } from './ui.jsx';
import { TICKET_STATUS, TICKET_PRIORITY } from '../lib/labels.js';
import { STEP_CATALOG, TRIGGERS, catalogFor, defaultStepConfig, CONDITION_FIELDS } from '../lib/workflowBlocks.js';
import { IconZap } from './icons.jsx';

// Éditeur de workflow en canvas façon n8n : blocs déplaçables reliés par des
// fils, pan et zoom. Un bloc « condition » a deux sorties (oui / non). Le graphe
// de fils est envoyé tel quel au moteur serveur (parcours de graphe à états).

const NODE_W = 210;
const PORT_Y = 22; // port d'entrée / sortie simple
const YES_Y = 20; // sortie « oui » d'une condition
const NO_Y = 48; // sortie « non » d'une condition
const uid = () => crypto.randomUUID();

const isBranch = (type) => STEP_CATALOG[type]?.branch;

// --- Conversions modèle <-> API ---
function toModel(wf) {
  const nodes = wf.steps.map((s) => ({
    key: s.key || uid(),
    type: s.type,
    config: { ...defaultStepConfig[s.type], ...s.config },
    x: s.x ?? 0,
    y: s.y ?? 0,
  }));
  const conns = [];
  for (const [from, val] of Object.entries(wf.edges ?? {})) {
    if (val && typeof val === 'object') {
      if (val.yes) conns.push({ from, port: 'yes', to: val.yes });
      if (val.no) conns.push({ from, port: 'no', to: val.no });
    } else if (typeof val === 'string') {
      conns.push({ from, port: 'out', to: val });
    }
  }
  // Compat : pas de graphe mais des blocs → chaîne linéaire.
  if (!conns.length && nodes.length) {
    let prev = 'trigger';
    for (const n of nodes) {
      conns.push({ from: prev, port: 'out', to: n.key });
      prev = n.key;
    }
  }
  if (nodes.length && nodes.every((n) => !n.x && !n.y)) {
    nodes.forEach((n, i) => {
      n.x = 330;
      n.y = 40 + i * 120;
    });
  }
  return { nodes, conns, triggerPos: wf.layout?.trigger ?? { x: 60, y: 120 } };
}

function serialize(model) {
  const edges = {};
  for (const c of model.conns) {
    if (c.port === 'out') edges[c.from] = c.to;
    else edges[c.from] = { ...(typeof edges[c.from] === 'object' ? edges[c.from] : {}), [c.port]: c.to };
  }
  const steps = model.nodes.map((n) => ({ key: n.key, type: n.type, config: n.config, x: n.x, y: n.y }));
  return { edges, steps };
}

// Blocs atteignables depuis le déclencheur (les autres sont ignorés à l'exécution).
function reachable(model) {
  const out = new Set();
  const stack = ['trigger'];
  while (stack.length) {
    const k = stack.pop();
    for (const c of model.conns) {
      if (c.from === k && !out.has(c.to)) {
        out.add(c.to);
        stack.push(c.to);
      }
    }
  }
  return out;
}

export default function WorkflowCanvas({ draft, refs, onSaved, onCancel }) {
  const [meta, setMeta] = useState({ name: draft.name, active: draft.active, trigger: draft.trigger });
  const [conditions, setConditions] = useState(draft.conditions);
  const [model, setModel] = useState(() => toModel(draft));
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState('trigger');
  const [connecting, setConnecting] = useState(null); // { from, port, x, y }
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [error, setError] = useState(null);

  const wrapRef = useRef(null);
  const drag = useRef(null);

  const nodePos = (key) =>
    key === 'trigger' ? model.triggerPos : model.nodes.find((n) => n.key === key) ?? { x: 0, y: 0 };
  const portY = (port) => (port === 'yes' ? YES_Y : port === 'no' ? NO_Y : PORT_Y);
  const outPos = (key, port) => ({ x: nodePos(key).x + NODE_W, y: nodePos(key).y + portY(port) });
  const inPos = (key) => ({ x: nodePos(key).x, y: nodePos(key).y + PORT_Y });

  function toCanvas(clientX, clientY) {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  }

  // --- Pointeur ---
  function onPointerDownBg(e) {
    if (e.target !== e.currentTarget) return;
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    wrapRef.current.setPointerCapture(e.pointerId);
    setSelected(null);
    setPaletteOpen(false);
  }
  function startNodeDrag(e, key) {
    e.stopPropagation();
    const p = toCanvas(e.clientX, e.clientY);
    const pos = nodePos(key);
    drag.current = { kind: 'node', key, ox: p.x - pos.x, oy: p.y - pos.y };
    wrapRef.current.setPointerCapture(e.pointerId);
    setSelected(key);
  }
  function startWire(e, from, port) {
    e.stopPropagation();
    const p = toCanvas(e.clientX, e.clientY);
    setConnecting({ from, port, x: p.x, y: p.y });
    wrapRef.current.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (drag.current?.kind === 'pan') {
      setPan({ x: drag.current.px + (e.clientX - drag.current.sx), y: drag.current.py + (e.clientY - drag.current.sy) });
    } else if (drag.current?.kind === 'node') {
      const p = toCanvas(e.clientX, e.clientY);
      const { key, ox, oy } = drag.current;
      const x = p.x - ox;
      const y = p.y - oy;
      if (key === 'trigger') setModel((m) => ({ ...m, triggerPos: { x, y } }));
      else setModel((m) => ({ ...m, nodes: m.nodes.map((n) => (n.key === key ? { ...n, x, y } : n)) }));
    } else if (connecting) {
      const p = toCanvas(e.clientX, e.clientY);
      setConnecting((c) => ({ ...c, x: p.x, y: p.y }));
    }
  }

  function onPointerUp(e) {
    if (connecting) {
      const p = toCanvas(e.clientX, e.clientY);
      const target = model.nodes.find(
        (n) => Math.hypot(n.x - p.x, n.y + PORT_Y - p.y) < 26 && n.key !== connecting.from
      );
      if (target && canConnect(connecting.from, target.key, model.conns)) {
        setConn(connecting.from, connecting.port, target.key);
      }
      setConnecting(null);
    }
    drag.current = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const before = { x: (cx - pan.x) / zoom, y: (cy - pan.y) / zoom };
    const nz = Math.min(1.6, Math.max(0.4, zoom * (e.deltaY < 0 ? 1.12 : 0.9)));
    setPan({ x: cx - before.x * nz, y: cy - before.y * nz });
    setZoom(nz);
  }

  // --- Graphe ---
  function setConn(from, port, to) {
    setModel((m) => ({
      ...m,
      conns: [...m.conns.filter((c) => !(c.from === from && c.port === port)), { from, port, to }],
    }));
  }
  function addNode(type) {
    const r = wrapRef.current.getBoundingClientRect();
    const center = { x: (r.width / 2 - pan.x) / zoom, y: (r.height / 2 - pan.y) / zoom };
    const key = uid();
    const node = { key, type, config: { ...defaultStepConfig[type] }, x: center.x - NODE_W / 2, y: center.y - 30 };
    setModel((m) => {
      const conns = [...m.conns];
      // Raccord auto depuis le bloc sélectionné s'il a une sortie simple libre.
      const src = selected;
      const srcOk = src && (src === 'trigger' || (m.nodes.find((n) => n.key === src) && !isBranch(m.nodes.find((n) => n.key === src).type)));
      if (srcOk && !conns.some((c) => c.from === src && c.port === 'out')) {
        conns.push({ from: src, port: 'out', to: key });
      }
      return { ...m, nodes: [...m.nodes, node], conns };
    });
    setSelected(key);
    setPaletteOpen(false);
  }
  function deleteNode(key) {
    setModel((m) => ({
      ...m,
      nodes: m.nodes.filter((n) => n.key !== key),
      conns: m.conns.filter((c) => c.from !== key && c.to !== key),
    }));
    setSelected(null);
  }
  function updateNodeConfig(key, patch) {
    setModel((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.key === key ? { ...n, config: { ...n.config, ...patch } } : n)),
    }));
  }
  function changeTrigger(trigger) {
    setMeta((mt) => ({ ...mt, trigger }));
    if (trigger !== 'status_changed') setConditions((c) => ({ ...c, toStatus: '' }));
    if (trigger !== 'ticket_created') {
      // Les blocs d'attente n'ont de sens qu'à la création : on les retire.
      setModel((m) => {
        const gates = new Set(m.nodes.filter((n) => STEP_CATALOG[n.type].gate).map((n) => n.key));
        return {
          ...m,
          nodes: m.nodes.filter((n) => !gates.has(n.key)),
          conns: m.conns.filter((c) => !gates.has(c.from) && !gates.has(c.to)),
        };
      });
    }
  }

  async function save() {
    setError(null);
    if (!meta.name.trim()) return setError('Le workflow doit avoir un nom');
    const { edges, steps } = serialize(model);
    const reach = reachable(model);
    const orphans = model.nodes.filter((n) => !reach.has(n.key)).length;
    if (orphans > 0 && !confirm(`${orphans} bloc(s) non relié(s) au déclencheur seront ignorés. Enregistrer quand même ?`)) {
      return;
    }
    try {
      await api.put(`/workflows/${draft.id}`, {
        name: meta.name,
        trigger: meta.trigger,
        active: meta.active,
        conditions,
        layout: { trigger: model.triggerPos },
        edges,
        steps,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  const selectedNode = model.nodes.find((n) => n.key === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={meta.name}
          onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          placeholder="Nom du workflow"
          className="max-w-xs font-semibold"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={meta.active}
            onChange={(e) => setMeta((m) => ({ ...m, active: e.target.checked }))}
            className="h-4 w-4 accent-(--color-accent)"
          />
          Actif
        </label>
        <div className="relative">
          <Button onClick={() => setPaletteOpen((v) => !v)}>+ Ajouter un bloc</Button>
          {paletteOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
              {catalogFor(meta.trigger).map(([type, spec]) => (
                <button
                  key={type}
                  onClick={() => addNode(type)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-canvas"
                >
                  <span className="text-ink-soft">
                    <spec.icon />
                  </span>
                  {spec.label}
                  {spec.gate && <span className="ml-auto text-xs text-ink-faint">attente</span>}
                  {spec.branch && <span className="ml-auto text-xs text-ink-faint">branche</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))}>−</Button>
          <span className="w-10 text-center text-xs text-ink-faint">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" onClick={() => setZoom((z) => Math.min(1.6, z * 1.2))}>+</Button>
          <Button variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Recentrer</Button>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="relative h-[calc(100vh-13rem)] min-h-[520px] overflow-hidden rounded-lg border border-line bg-canvas">
        <div
          ref={wrapRef}
          onPointerDown={onPointerDownBg}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          className="absolute inset-0 touch-none"
          style={{
            backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            cursor: drag.current?.kind === 'pan' ? 'grabbing' : 'grab',
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
              {model.conns.map((c, i) => (
                <Wire
                  key={i}
                  a={outPos(c.from, c.port)}
                  b={inPos(c.to)}
                  color={c.port === 'yes' ? 'var(--color-status-resolved)' : c.port === 'no' ? 'var(--color-accent)' : 'var(--color-ink-faint)'}
                />
              ))}
              {connecting && <Wire a={outPos(connecting.from, connecting.port)} b={{ x: connecting.x, y: connecting.y }} dashed />}
            </svg>

            <NodeBox
              pos={model.triggerPos}
              accent="var(--color-accent)"
              Icon={IconZap}
              title="Quand"
              subtitle={TRIGGERS[meta.trigger].short}
              selected={selected === 'trigger'}
              outs={[{ port: 'out', y: PORT_Y }]}
              onDown={(e) => startNodeDrag(e, 'trigger')}
              onOut={startWire}
              fromKey="trigger"
            />

            {model.nodes.map((n) => {
              const spec = STEP_CATALOG[n.type];
              const branch = isBranch(n.type);
              return (
                <NodeBox
                  key={n.key}
                  pos={n}
                  accent={spec.accent}
                  Icon={spec.icon}
                  title={spec.label}
                  subtitle={nodeSummary(n, refs)}
                  gate={spec.gate}
                  selected={selected === n.key}
                  hasIn
                  outs={branch ? [{ port: 'yes', y: YES_Y, label: 'oui' }, { port: 'no', y: NO_Y, label: 'non' }] : [{ port: 'out', y: PORT_Y }]}
                  minHeight={branch ? 62 : undefined}
                  onDown={(e) => startNodeDrag(e, n.key)}
                  onOut={startWire}
                  onDelete={() => deleteNode(n.key)}
                  fromKey={n.key}
                />
              );
            })}
          </div>
        </div>

        {(selected === 'trigger' || selectedNode) && (
          <div className="absolute right-2 top-2 bottom-2 w-72 overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-lg">
            {selected === 'trigger' ? (
              <TriggerPanel
                meta={meta}
                conditions={conditions}
                refs={refs}
                onTrigger={changeTrigger}
                onCond={(k, v) => setConditions((c) => ({ ...c, [k]: v }))}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{STEP_CATALOG[selectedNode.type].label}</span>
                  <button onClick={() => deleteNode(selectedNode.key)} className="cursor-pointer text-xs text-accent hover:underline">
                    Supprimer
                  </button>
                </div>
                <StepConfig node={selectedNode} refs={refs} onConfig={(patch) => updateNodeConfig(selectedNode.key, patch)} />
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-ink-faint">
        Glissez les blocs, tirez un fil depuis un point de sortie vers un autre bloc pour définir l'ordre. Un
        bloc « condition » a deux sorties <span className="text-status-resolved">oui</span> /{' '}
        <span className="text-accent">non</span>. Molette pour zoomer, glissez le fond pour vous déplacer.
      </p>

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Annuler</Button>
        <Button variant="primary" onClick={save}>Enregistrer le workflow</Button>
      </div>
    </div>
  );
}

function Wire({ a, b, dashed, color = 'var(--color-ink-faint)' }) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return (
    <path
      d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeDasharray={dashed ? '5 4' : undefined}
    />
  );
}

function canConnect(from, to, conns) {
  if (to === 'trigger' || from === to) return false;
  // Évite les cycles : `to` ne doit pas déjà mener à `from`.
  const seen = new Set();
  const stack = [to];
  while (stack.length) {
    const k = stack.pop();
    if (k === from) return false;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const c of conns) if (c.from === k) stack.push(c.to);
  }
  return true;
}

function NodeBox({ pos, accent, Icon, title, subtitle, gate, selected, hasIn, outs, minHeight, onDown, onOut, onDelete, fromKey }) {
  return (
    <div
      onPointerDown={onDown}
      className={[
        'group absolute w-[210px] cursor-grab rounded-lg bg-surface shadow-sm select-none active:cursor-grabbing',
        gate ? 'border-2 border-dashed' : 'border',
        selected ? 'ring-2 ring-accent' : '',
      ].join(' ')}
      style={{ left: pos.x, top: pos.y, minHeight, borderColor: selected ? 'var(--color-accent)' : 'var(--color-line)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          {subtitle && <div className="truncate text-xs text-ink-faint">{subtitle}</div>}
        </div>
        {gate && (
          <span className="rounded bg-status-progress-bg px-1 text-[9px] font-semibold uppercase tracking-wide text-status-progress">
            wait
          </span>
        )}
        {onDelete && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="hidden cursor-pointer text-xs text-ink-faint hover:text-accent group-hover:block"
            title="Supprimer"
          >
            ✕
          </button>
        )}
      </div>
      {hasIn && (
        <span className="absolute h-3 w-3 rounded-full border-2 border-surface bg-ink-faint" style={{ left: -6, top: PORT_Y - 6 }} />
      )}
      {outs.map((o) => (
        <span key={o.port} className="absolute flex items-center" style={{ right: -7, top: o.y - 7 }}>
          {o.label && (
            <span
              className="mr-2 text-[10px] font-semibold"
              style={{ color: o.port === 'yes' ? 'var(--color-status-resolved)' : 'var(--color-accent)' }}
            >
              {o.label}
            </span>
          )}
          <span
            onPointerDown={(e) => onOut(e, fromKey, o.port)}
            title="Tirer un fil"
            className="h-3.5 w-3.5 cursor-crosshair rounded-full border-2 border-surface hover:scale-125"
            style={{ background: o.port === 'yes' ? 'var(--color-status-resolved)' : o.port === 'no' ? 'var(--color-accent)' : 'var(--color-accent)' }}
          />
        </span>
      ))}
    </div>
  );
}

function nodeSummary(node, refs) {
  const c = node.config ?? {};
  switch (node.type) {
    case 'assign_team':
      return refs.teams.find((t) => t.id === Number(c.teamId))?.name ?? 'équipe à choisir';
    case 'assign_user':
      return refs.users.find((u) => u.id === Number(c.userId))?.name ?? 'personne à choisir';
    case 'set_priority':
      return TICKET_PRIORITY[c.priority]?.label ?? '';
    case 'set_status':
      return TICKET_STATUS[c.status]?.label ?? '';
    case 'add_note':
      return c.body?.trim() ? `« ${c.body.slice(0, 24)}… »` : 'note vide';
    case 'send_email':
      return c.to === 'author' ? 'au demandeur' : c.to === 'assignee' ? "à l'assigné" : c.email || 'adresse fixe';
    case 'webhook':
      return c.url ? c.url.replace(/^https?:\/\//, '').slice(0, 24) : 'URL à définir';
    case 'condition':
      return conditionSummary(c);
    case 'wait_assigned':
      return 'jusqu\'à prise en charge';
    case 'wait_status':
      return `jusqu'au statut « ${TICKET_STATUS[c.status]?.label ?? '?'} »`;
    default:
      return '';
  }
}

function conditionSummary(c) {
  if (c.field === 'assigned') return 'déjà pris en charge ?';
  const label = CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? '';
  const val =
    c.field === 'priority'
      ? TICKET_PRIORITY[c.value]?.label
      : c.field === 'status'
        ? TICKET_STATUS[c.value]?.label
        : c.value;
  return `${label} « ${val ?? '?'} » ?`;
}

function TriggerPanel({ meta, conditions, refs, onTrigger, onCond }) {
  return (
    <div className="space-y-3">
      <span className="text-sm font-semibold">Déclencheur &amp; conditions</span>
      <Field label="Quand">
        <Select value={meta.trigger} onChange={(e) => onTrigger(e.target.value)}>
          {Object.entries(TRIGGERS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
      </Field>
      <div className="border-t border-line pt-3">
        <p className="mb-2 text-xs font-medium text-ink-soft">Seulement si…</p>
        <div className="space-y-2">
          <Field label="Catégorie">
            <Select value={conditions.categoryId} onChange={(e) => onCond('categoryId', e.target.value)}>
              <option value="">Toutes</option>
              {refs.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Formulaire d'origine">
            <Select value={conditions.formId} onChange={(e) => onCond('formId', e.target.value)}>
              <option value="">Tous</option>
              {refs.forms.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité">
            <Select value={conditions.priority} onChange={(e) => onCond('priority', e.target.value)}>
              <option value="">Toutes</option>
              {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          </Field>
          {meta.trigger === 'status_changed' && (
            <Field label="Nouveau statut">
              <Select value={conditions.toStatus} onChange={(e) => onCond('toStatus', e.target.value)}>
                <option value="">Tous</option>
                {Object.entries(TICKET_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

function StepConfig({ node, refs, onConfig }) {
  const cfg = node.config;
  const set = (k, v) => onConfig({ [k]: v });
  switch (node.type) {
    case 'assign_team':
      return (
        <Field label="Équipe">
          <Select value={cfg.teamId} onChange={(e) => set('teamId', e.target.value)}>
            <option value="">Choisir…</option>
            {refs.teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
      );
    case 'assign_user':
      return (
        <Field label="Personne">
          <Select value={cfg.userId} onChange={(e) => set('userId', e.target.value)}>
            <option value="">Choisir…</option>
            {refs.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
      );
    case 'set_priority':
      return (
        <Field label="Nouvelle priorité">
          <Select value={cfg.priority} onChange={(e) => set('priority', e.target.value)}>
            {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </Field>
      );
    case 'set_status':
      return (
        <Field label="Nouveau statut">
          <Select value={cfg.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(TICKET_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </Field>
      );
    case 'add_note':
      return (
        <Field label="Note ajoutée au ticket">
          <Textarea rows={3} value={cfg.body} onChange={(e) => set('body', e.target.value)} placeholder="Ex. : Pris en charge automatiquement." />
          <VariableHint />
        </Field>
      );
    case 'send_email':
      return (
        <div className="space-y-3">
          <Field label="Destinataire">
            <Select value={cfg.to} onChange={(e) => set('to', e.target.value)}>
              <option value="author">Le demandeur</option>
              <option value="assignee">L'assigné</option>
              <option value="custom">Adresse fixe…</option>
            </Select>
          </Field>
          {cfg.to === 'custom' && (
            <Field label="Adresse email">
              <Input type="email" value={cfg.email} onChange={(e) => set('email', e.target.value)} placeholder="alerte@entreprise.fr" />
            </Field>
          )}
          <Field label="Objet">
            <Input value={cfg.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Ticket #{{ticket.id}} pris en charge" />
          </Field>
          <Field label="Message">
            <Textarea rows={3} value={cfg.body} onChange={(e) => set('body', e.target.value)} />
            <VariableHint />
          </Field>
        </div>
      );
    case 'webhook':
      return (
        <div className="space-y-3">
          <Field label="URL du webhook">
            <Input value={cfg.url} onChange={(e) => set('url', e.target.value)} placeholder="https://n8n.exemple.fr/webhook/…" />
          </Field>
          <Field label="Jeton secret (en-tête X-Parqueo-Token)">
            <Input value={cfg.secret} onChange={(e) => set('secret', e.target.value)} />
          </Field>
          <p className="text-xs text-ink-faint">Le ticket complet est envoyé en POST JSON.</p>
        </div>
      );
    case 'condition':
      return <ConditionConfig cfg={cfg} refs={refs} onConfig={onConfig} />;
    case 'wait_assigned':
      return (
        <p className="text-sm text-ink-soft">
          Le ticket reste ici tant que <strong>personne ne l'a pris en charge</strong>. Dès qu'il est assigné,
          le workflow reprend au bloc suivant.
        </p>
      );
    case 'wait_status':
      return (
        <Field label="Reprendre quand le statut devient">
          <Select value={cfg.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(TICKET_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </Field>
      );
    default:
      return null;
  }
}

// Config d'un bloc condition : champ testé + valeur ; deux sorties oui / non.
function ConditionConfig({ cfg, refs, onConfig }) {
  function changeField(field) {
    const value =
      field === 'priority' ? 'high' : field === 'status' ? 'resolved' : field === 'category' ? String(refs.categories[0]?.id ?? '') : field === 'form' ? String(refs.forms[0]?.id ?? '') : '';
    onConfig({ field, value });
  }
  return (
    <div className="space-y-3">
      <Field label="Tester si…">
        <Select value={cfg.field} onChange={(e) => changeField(e.target.value)}>
          {CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>
      </Field>
      {cfg.field === 'priority' && (
        <Field label="Priorité">
          <Select value={cfg.value} onChange={(e) => onConfig({ value: e.target.value })}>
            {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </Field>
      )}
      {cfg.field === 'status' && (
        <Field label="Statut">
          <Select value={cfg.value} onChange={(e) => onConfig({ value: e.target.value })}>
            {Object.entries(TICKET_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </Field>
      )}
      {cfg.field === 'category' && (
        <Field label="Catégorie">
          <Select value={cfg.value} onChange={(e) => onConfig({ value: e.target.value })}>
            {refs.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      )}
      {cfg.field === 'form' && (
        <Field label="Formulaire">
          <Select value={cfg.value} onChange={(e) => onConfig({ value: e.target.value })}>
            {refs.forms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </Field>
      )}
      <p className="text-xs text-ink-faint">
        Le ticket suit la sortie <span className="text-status-resolved">oui</span> si le test est vrai, sinon{' '}
        <span className="text-accent">non</span>.
      </p>
    </div>
  );
}

function VariableHint() {
  return (
    <p className="mt-1 text-xs text-ink-faint">
      Variables : <code>{'{{ticket.title}}'}</code>, <code>{'{{author.name}}'}</code>,{' '}
      <code>{'{{category.name}}'}</code>…
    </p>
  );
}
