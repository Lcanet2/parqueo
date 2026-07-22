import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Button, Input, Select, Textarea, Field, ErrorText } from '../components/ui.jsx';
import Combobox from '../components/Combobox.jsx';
import { TICKET_PRIORITY } from '../lib/labels.js';

export default function TicketNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  // Paramètres : choix de la priorité par les utilisateurs, suggestions d'articles.
  const canSetPriority = user.role !== 'user' || settings?.userCanSetPriority !== false;
  const kbSuggest = settings?.kbSuggest !== false;
  const [categories, setCategories] = useState([]);
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', categoryId: '', assetId: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // Suggestions de la base de connaissances à partir du titre saisi — l'objectif
  // est de résoudre le problème avant même que le ticket soit créé.
  useEffect(() => {
    const title = form.title.trim();
    if (!kbSuggest || title.length < 4) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      api.get(`/kb?q=${encodeURIComponent(title)}&take=3`).then(setSuggestions).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [form.title, kbSuggest]);

  useEffect(() => {
    api.get('/categories').then((cats) => {
      setCategories(cats);
      if (cats.length) setForm((f) => ({ ...f, categoryId: f.categoryId || String(cats[0].id) }));
    });
    api.get('/assets').then(setAssets).catch(() => setAssets([]));
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ticket = await api.post('/tickets', {
        title: form.title,
        description: form.description,
        priority: form.priority,
        categoryId: Number(form.categoryId),
        assetId: form.assetId ? Number(form.assetId) : undefined,
      });
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.upload(`/tickets/${ticket.id}/attachments`, fd);
      }
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <div className="mb-1 text-xs text-ink-faint">
          <span>Nouvelle demande / Signaler un problème</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Signaler un problème</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <Field label="Titre">
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ex. : mon PC ne démarre plus"
            autoFocus
            required
          />
        </Field>

        {suggestions.length > 0 && (
          <div className="rounded-md border border-line bg-canvas px-3.5 py-2.5">
            <p className="mb-1.5 text-xs font-medium text-ink-soft">
              Ces articles peuvent peut-être vous aider :
            </p>
            <ul className="space-y-1">
              {suggestions.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/aide/${a.id}`}
                    target="_blank"
                    className="text-sm text-accent underline-offset-2 hover:underline"
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={5}
            placeholder="Décrivez le problème : depuis quand, ce que vous avez essayé…"
            required
          />
        </Field>

        <div className={`grid gap-3 ${canSetPriority ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Field label="Catégorie">
            <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          {canSetPriority && (
            <Field label="Priorité">
              <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {assets.length > 0 && (
          <Field label="Équipement concerné (optionnel)">
            <Combobox
              value={form.assetId}
              onChange={(v) => set('assetId', v)}
              options={assets.map((a) => ({ value: String(a.id), label: a.name }))}
              placeholder="Rechercher un équipement…"
              emptyLabel="Aucun"
            />
          </Field>
        )}

        <Field label="Pièce jointe (optionnel)">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0] ?? null)}
            className="block w-full text-sm text-ink-soft file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => navigate(-1)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Création…' : 'Créer le ticket'}
          </Button>
        </div>
      </form>
    </div>
  );
}
