import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Button, Card, ErrorText, ErrorState, EmptyState, Spinner, Badge } from './ui.jsx';
import WorkflowCanvas from './WorkflowCanvas.jsx';
import { TRIGGERS, conditionsSummary } from '../lib/workflowBlocks.js';

// Normalise un workflow de l'API vers le brouillon d'édition du canvas.
function toDraft(wf) {
  return {
    id: wf.id,
    name: wf.name,
    active: wf.active,
    trigger: wf.trigger,
    conditions: {
      categoryId: wf.conditions?.categoryId ?? '',
      formId: wf.conditions?.formId ?? '',
      priority: wf.conditions?.priority ?? '',
      toStatus: wf.conditions?.toStatus ?? '',
    },
    steps: wf.steps.map((s) => ({ type: s.type, config: { ...s.config }, x: s.x, y: s.y })),
    layout: wf.layout ?? {},
  };
}

export default function WorkflowsTab() {
  const [workflows, setWorkflows] = useState(null);
  const [refs, setRefs] = useState({ categories: [], teams: [], users: [], forms: [] });
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    setLoadError(null);
    api.get('/workflows').then(setWorkflows).catch((err) => setLoadError(err.message));
    // Référentiels des menus de configuration des blocs : accessoires.
    Promise.all([
      api.get('/categories'),
      api.get('/teams'),
      api.get('/users/assignable'),
      api.get('/forms?all=1'),
    ])
      .then(([categories, teams, users, forms]) => setRefs({ categories, teams, users, forms }))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function createWorkflow() {
    setError(null);
    try {
      const wf = await api.post('/workflows', { name: 'Nouveau workflow', trigger: 'ticket_created' });
      setDraft(toDraft(wf));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(wf) {
    await api.put(`/workflows/${wf.id}`, {
      name: wf.name,
      trigger: wf.trigger,
      active: !wf.active,
      conditions: wf.conditions,
      layout: wf.layout,
      steps: wf.steps.map((s) => ({ type: s.type, config: s.config, x: s.x, y: s.y })),
    });
    load();
  }

  async function remove(wf) {
    if (!confirm(`Supprimer le workflow « ${wf.name} » ?`)) return;
    await api.delete(`/workflows/${wf.id}`);
    load();
  }

  if (loadError) return <ErrorState error={loadError} onRetry={load} />;
  if (!workflows) return <Spinner />;

  if (draft) {
    return (
      <WorkflowCanvas
        draft={draft}
        refs={refs}
        onSaved={() => {
          setDraft(null);
          load();
        }}
        onCancel={() => setDraft(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          Les workflows automatisent le traitement : quand un ticket correspond, il parcourt les blocs et
          reste sur un bloc « attente » jusqu'à ce que sa condition soit remplie.
        </p>
        <Button variant="primary" onClick={createWorkflow}>Nouveau workflow</Button>
      </div>
      <ErrorText>{error}</ErrorText>

      <Card title={`Workflows (${workflows.length})`}>
        {workflows.length === 0 ? (
          <EmptyState>Aucun workflow — créez le premier</EmptyState>
        ) : (
          <ul>
            {workflows.map((wf) => (
              <li key={wf.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{wf.name}</span>
                    {!wf.active && (
                      <Badge label="Inactif" fg="var(--color-ink-soft)" bg="var(--color-status-closed-bg)" />
                    )}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {TRIGGERS[wf.trigger]?.label ?? wf.trigger} · {conditionsSummary(wf.conditions, refs)} ·{' '}
                    {wf.steps.length} bloc{wf.steps.length > 1 ? 's' : ''}
                  </div>
                </div>
                <span className="flex gap-1">
                  <Button variant="ghost" onClick={() => setDraft(toDraft(wf))}>Modifier</Button>
                  <Button variant="ghost" onClick={() => toggleActive(wf)}>
                    {wf.active ? 'Désactiver' : 'Activer'}
                  </Button>
                  <Button variant="ghost" onClick={() => remove(wf)}>Supprimer</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
