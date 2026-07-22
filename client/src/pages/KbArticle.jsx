import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Select, Textarea, Field, Spinner, ErrorText } from '../components/ui.jsx';
import { formatDate } from '../lib/labels.js';

// Consultation et édition d'un article — /aide/nouveau (création) et /aide/:id.
export default function KbArticle() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStaff = user.role !== 'user';

  const [article, setArticle] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(isNew);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', categoryId: '', published: true });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStaff) api.get('/categories').then(setCategories);
  }, [isStaff]);

  useEffect(() => {
    if (isNew) return;
    api
      .get(`/kb/${id}`)
      .then((a) => {
        setArticle(a);
        setForm({
          title: a.title,
          body: a.body,
          categoryId: a.categoryId ? String(a.categoryId) : '',
          published: a.published,
        });
      })
      .catch(() => setNotFound(true));
  }, [id, isNew]);

  async function save(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = {
        title: form.title,
        body: form.body,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        published: form.published,
      };
      if (isNew) {
        const created = await api.post('/kb', data);
        navigate(`/aide/${created.id}`, { replace: true });
      } else {
        const updated = await api.patch(`/kb/${id}`, data);
        setArticle(updated);
        setEditing(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Supprimer définitivement cet article ?')) return;
    await api.delete(`/kb/${id}`);
    navigate('/aide');
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-ink-soft">
          Article introuvable. <Link to="/aide" className="text-accent">Retour à l'aide</Link>
        </p>
      </div>
    );
  }
  if (!isNew && !article) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="mb-1 text-xs text-ink-faint">
        <Link to="/aide" className="hover:text-accent">Aide</Link> /{' '}
        {isNew ? 'Nouvel article' : article.title}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <Field label="Titre">
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex. : réinitialiser son mot de passe Windows"
              autoFocus
              required
            />
          </Field>
          <Field label="Contenu">
            <Textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={12}
              placeholder="Étapes de résolution, captures, liens…"
              required
            />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Field label="Catégorie (optionnel)">
                <Select
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  <option value="">Aucune</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 py-1.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
              />
              Publié (visible de tous)
            </label>
          </div>

          <ErrorText>{error}</ErrorText>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => (isNew ? navigate('/aide') : setEditing(false))}>
              Annuler
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{article.title}</h1>
              <p className="mt-1 text-xs text-ink-faint">
                {article.category ? `${article.category.name} · ` : ''}
                {article.author?.name} · mis à jour le {formatDate(article.updatedAt)}
                {!article.published && ' · Brouillon'}
              </p>
            </div>
            {isStaff && (
              <div className="flex shrink-0 gap-2">
                <Button onClick={() => setEditing(true)}>Modifier</Button>
                <Button variant="danger" onClick={remove}>Supprimer</Button>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-line bg-surface px-5 py-4 text-sm whitespace-pre-wrap">
            {article.body}
          </div>
        </>
      )}
    </div>
  );
}
