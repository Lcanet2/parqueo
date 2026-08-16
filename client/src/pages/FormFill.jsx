import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import {
  Button,
  Input,
  Select,
  Textarea,
  Field,
  ErrorText,
  ErrorState,
  Spinner,
  EmptyState,
  PageHeader,
} from '../components/ui.jsx';

// Remplissage d'un formulaire de demande prédéfini.
export default function FormFill() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .get(`/forms/${id}`)
      .then(setForm)
      // 404 = formulaire retiré du catalogue ; le reste est une vraie panne.
      .catch((err) => (err.status === 404 ? setNotFound(true) : setLoadError(err.message)));
  }, [id]);

  useEffect(load, [load]);

  if (notFound) {
    return (
      <EmptyState
        title="Formulaire introuvable"
        action={
          <Link to="/tickets/nouveau">
            <Button>Retour au catalogue</Button>
          </Link>
        }
      >
        Il a peut-être été retiré du catalogue de demandes.
      </EmptyState>
    );
  }
  if (loadError) return <ErrorState error={loadError} onRetry={load} />;
  if (!form) return <Spinner />;

  function set(fieldId, value) {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ticket = await api.post(`/forms/${form.id}/submit`, { answers });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-form space-y-4">
      <PageHeader
        title={form.name}
        trail={[
          { to: '/tickets', label: 'Tickets' },
          { to: '/tickets/nouveau', label: 'Nouvelle demande' },
        ]}
        description={form.description}
      />

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-5">
        {form.fields.map((field) => {
          const value = answers[field.id] ?? '';

          if (field.type === 'checkbox') {
            return (
              <label
                key={field.id}
                className="flex cursor-pointer items-center gap-2.5 [@media(pointer:coarse)]:min-h-11"
              >
                <input
                  type="checkbox"
                  checked={Boolean(answers[field.id])}
                  onChange={(e) => set(field.id, e.target.checked)}
                  className="h-4 w-4 accent-(--color-accent)"
                />
                <span className="text-sm">{field.label}</span>
              </label>
            );
          }

          return (
            <Field key={field.id} label={field.label} required={field.required}>
              {field.type === 'textarea' ? (
                <Textarea rows={4} value={value} onChange={(e) => set(field.id, e.target.value)} required={field.required} />
              ) : field.type === 'select' ? (
                <Select value={value} onChange={(e) => set(field.id, e.target.value)} required={field.required}>
                  <option value="">Choisir…</option>
                  {JSON.parse(field.options ?? '[]').map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              ) : field.type === 'date' ? (
                <Input type="date" value={value} onChange={(e) => set(field.id, e.target.value)} required={field.required} />
              ) : (
                <Input value={value} onChange={(e) => set(field.id, e.target.value)} required={field.required} />
              )}
            </Field>
          );
        })}

        <ErrorText>{error}</ErrorText>

        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => navigate('/tickets/nouveau')}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Envoi…' : 'Envoyer la demande'}
          </Button>
        </div>
      </form>
    </div>
  );
}
