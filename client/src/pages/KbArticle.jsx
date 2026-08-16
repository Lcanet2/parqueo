import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Button,
  Input,
  Select,
  Textarea,
  Field,
  Spinner,
  ErrorText,
  ErrorState,
  EmptyState,
  PageHeader,
} from '../components/ui.jsx';
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

  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    // Menu de catégories : accessoire, son échec ne bloque pas la lecture.
    if (isStaff) api.get('/categories').then(setCategories).catch(() => {});
  }, [isStaff]);

  const loadArticle = useCallback(() => {
    if (isNew) return;
    setLoadError(null);
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
      // Un 404 est un article qui n'existe pas ou n'est pas publié ; le reste
      // (panne réseau, erreur serveur) mérite un message distinct et un retry.
      .catch((err) => (err.status === 404 ? setNotFound(true) : setLoadError(err.message)));
  }, [id, isNew]);

  useEffect(loadArticle, [loadArticle]);

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
      <div className="mx-auto max-w-lecture">
        <EmptyState title="Article introuvable" action={<Link to="/aide"><Button>Retour à l'aide</Button></Link>}>
          Il a peut-être été supprimé, ou n'est pas encore publié.
        </EmptyState>
      </div>
    );
  }
  if (loadError) return <ErrorState error={loadError} onRetry={loadArticle} />;
  if (!isNew && !article) return <Spinner />;

  return (
    <div className="mx-auto max-w-lecture space-y-4">

      {editing ? (
        <>
        <PageHeader
          title={isNew ? 'Nouvel article' : 'Modifier l’article'}
          trail={[{ to: '/aide', label: 'Aide' }]}
        />
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
            <label className="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-ink-soft [@media(pointer:coarse)]:min-h-11">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              Publié (visible de tous)
            </label>
          </div>

          <ErrorText>{error}</ErrorText>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => (isNew ? navigate('/aide') : setEditing(false))}>
              Annuler
            </Button>
            <Button variant="primary" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
        </>
      ) : (
        <>
          <PageHeader
            title={article.title}
            trail={[{ to: '/aide', label: 'Aide' }]}
            description={
              <span className="text-xs text-ink-faint">
                {article.category ? `${article.category.name} · ` : ''}
                {article.author?.name} · mis à jour le {formatDate(article.updatedAt)}
                {!article.published && ' · Brouillon'}
              </span>
            }
            actions={
              isStaff && (
                <>
                  <Button onClick={() => setEditing(true)}>Modifier</Button>
                  <Button variant="danger" onClick={remove}>
                    Supprimer
                  </Button>
                </>
              )
            }
          />
          {/* `max-w-[68ch]` : au-delà, l'œil perd la ligne suivante en revenant
              à la marge. La carte, elle, garde toute la largeur. */}
          <article className="rounded-lg border border-line bg-surface px-5 py-4 text-sm whitespace-pre-wrap">
            <span className="block max-w-[68ch]">{article.body}</span>
          </article>
        </>
      )}
    </div>
  );
}
