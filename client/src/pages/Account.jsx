import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Button, Card, Field, Input, ErrorText, PageHeader } from '../components/ui.jsx';
import { ROLE } from '../lib/labels.js';

// Mon compte : informations du compte connecté et changement de mot de passe.
// Les comptes Microsoft n'ont pas de mot de passe local : le formulaire est
// remplacé par un renvoi vers Microsoft.
export default function Account() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const estSso = user.provider === 'entra';

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      await api.patch('/auth/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lecture space-y-4">
      <PageHeader title="Mon compte" />

      <Card title="Informations">
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar name={user.name} id={user.id} />
          <div className="min-w-0">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-sm text-ink-soft">{user.email}</div>
          </div>
          <div className="ml-auto text-xs text-ink-faint">{ROLE[user.role]}</div>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-faint">
          Le nom, l'adresse email et le rôle sont gérés par l'administration.
        </p>
      </Card>

      <Card title="Mot de passe">
        {estSso ? (
          <p className="px-4 py-4 text-sm text-ink-soft">
            Ce compte se connecte avec Microsoft. Le mot de passe se change directement
            dans votre compte Microsoft.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
            <Field label="Mot de passe actuel">
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Nouveau mot de passe">
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Confirmer le nouveau mot de passe">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>

            <p className="text-xs text-ink-faint">
              8 caractères minimum. Vos autres sessions ouvertes restent actives jusqu'à
              leur expiration.
            </p>

            <ErrorText>{error}</ErrorText>
            {done && (
              <p role="status" className="text-sm text-status-resolved">
                Mot de passe mis à jour.
              </p>
            )}

            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
