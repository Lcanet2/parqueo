import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Button, Input, Select, Textarea, Field, Card, ErrorText, EmptyState, Spinner, Badge } from './ui.jsx';
import { TICKET_PRIORITY } from '../lib/labels.js';

const FIELD_TYPES = [
  { value: 'text', label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'select', label: 'Liste de choix' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Case à cocher' },
];

const emptyForm = () => ({
  name: '',
  description: '',
  categoryId: '',
  priority: 'medium',
  active: true,
  fields: [],
});

// Convertit un formulaire de l'API vers l'état d'édition local.
function toDraft(form) {
  return {
    id: form.id,
    name: form.name,
    description: form.description ?? '',
    categoryId: String(form.categoryId),
    priority: form.priority,
    active: form.active,
    fields: form.fields.map((f) => ({
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options ? JSON.parse(f.options).join(', ') : '',
    })),
  };
}

export default function FormsTab() {
  const [forms, setForms] = useState(null);
  const [categories, setCategories] = useState([]);
  const [draft, setDraft] = useState(null); // null = pas d'édition en cours
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.get('/forms?all=1').then(setForms);
    api.get('/categories').then(setCategories);
  }, []);
  useEffect(load, [load]);

  function set(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setField(idx, key, value) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === idx ? { ...f, [key]: value } : f)),
    }));
  }

  function moveField(idx, dir) {
    setDraft((d) => {
      const target = idx + dir;
      if (target < 0 || target >= d.fields.length) return d;
      const fields = [...d.fields];
      [fields[idx], fields[target]] = [fields[target], fields[idx]];
      return { ...d, fields };
    });
  }

  async function save(e) {
    e.preventDefault();
    setError(null);
    const payload = {
      name: draft.name,
      description: draft.description,
      categoryId: Number(draft.categoryId),
      priority: draft.priority,
      active: draft.active,
      fields: draft.fields.map((f) => ({
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.type === 'select' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
      })),
    };
    try {
      if (draft.id) await api.patch(`/forms/${draft.id}`, payload);
      else await api.post('/forms', payload);
      setDraft(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(form) {
    if (!confirm(`Supprimer le formulaire « ${form.name} » ?`)) return;
    await api.delete(`/forms/${form.id}`);
    load();
  }

  async function toggleActive(form) {
    await api.patch(`/forms/${form.id}`, { active: !form.active });
    load();
  }

  if (!forms) return <Spinner />;

  if (draft) {
    return (
      <Card title={draft.id ? `Modifier « ${draft.name} »` : 'Nouveau formulaire'}>
        <form onSubmit={save} className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom (devient le titre des tickets)">
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} required placeholder="Ex. : Demande de matériel" />
            </Field>
            <Field label="Catégorie (peut cibler un workflow)">
              <Select value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)} required>
                <option value="">Choisir…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description (affichée dans le catalogue)">
            <Textarea rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priorité des tickets créés">
              <Select value={draft.priority} onChange={(e) => set('priority', e.target.value)}>
                {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => set('active', e.target.checked)}
                className="h-4 w-4 accent-(--color-accent)"
              />
              <span className="text-sm">Visible dans le catalogue</span>
            </label>
          </div>

          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Questions du formulaire</span>
              <Button
                type="button"
                onClick={() => set('fields', [...draft.fields, { label: '', type: 'text', required: false, options: '' }])}
              >
                + Ajouter une question
              </Button>
            </div>
            {draft.fields.length === 0 && (
              <p className="py-2 text-sm text-ink-faint">
                Aucune question — le ticket sera créé avec le nom du formulaire seul.
              </p>
            )}
            <ul className="space-y-2">
              {draft.fields.map((f, idx) => (
                <li key={idx} className="rounded-md border border-line bg-canvas p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-40 flex-1">
                      <Field label="Question">
                        <Input value={f.label} onChange={(e) => setField(idx, 'label', e.target.value)} required />
                      </Field>
                    </div>
                    <Field label="Type">
                      <Select value={f.type} onChange={(e) => setField(idx, 'type', e.target.value)} className="w-36">
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => setField(idx, 'required', e.target.checked)}
                        className="h-4 w-4 accent-(--color-accent)"
                      />
                      Requis
                    </label>
                    <span className="flex gap-1 pb-1">
                      <Button type="button" variant="ghost" onClick={() => moveField(idx, -1)} disabled={idx === 0}>↑</Button>
                      <Button type="button" variant="ghost" onClick={() => moveField(idx, 1)} disabled={idx === draft.fields.length - 1}>↓</Button>
                      <Button type="button" variant="ghost" onClick={() => set('fields', draft.fields.filter((_, i) => i !== idx))}>✕</Button>
                    </span>
                  </div>
                  {f.type === 'select' && (
                    <div className="mt-2">
                      <Field label="Choix possibles (séparés par des virgules)">
                        <Input
                          value={f.options}
                          onChange={(e) => setField(idx, 'options', e.target.value)}
                          placeholder="Écran, Clavier, Souris"
                        />
                      </Field>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setDraft(null)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">
          Les formulaires apparaissent dans le catalogue « Nouvelle demande » et créent des tickets pré-remplis.
        </p>
        <Button variant="primary" onClick={() => setDraft(emptyForm())}>Nouveau formulaire</Button>
      </div>

      <Card title={`Formulaires (${forms.length})`}>
        {forms.length === 0 ? (
          <EmptyState>Aucun formulaire — créez le premier</EmptyState>
        ) : (
          <ul>
            {forms.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{f.name}</span>
                    {!f.active && (
                      <Badge label="Masqué" fg="var(--color-ink-soft)" bg="var(--color-status-closed-bg)" />
                    )}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {f.category?.name} · {f.fields.length} question{f.fields.length > 1 ? 's' : ''} · priorité{' '}
                    {TICKET_PRIORITY[f.priority].label.toLowerCase()}
                  </div>
                </div>
                <span className="flex gap-1">
                  <Button variant="ghost" onClick={() => setDraft(toDraft(f))}>Modifier</Button>
                  <Button variant="ghost" onClick={() => toggleActive(f)}>
                    {f.active ? 'Masquer' : 'Publier'}
                  </Button>
                  <Button variant="ghost" onClick={() => remove(f)}>Supprimer</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
