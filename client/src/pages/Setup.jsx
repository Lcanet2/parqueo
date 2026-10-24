import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Field, ErrorText } from '../components/ui.jsx';
import AuthFrame from '../components/AuthFrame.jsx';

// Premier démarrage. Cet écran remplace le compte admin@parqueo.local /
// admin1234 livré avec l'application : la personne qui installe crée son propre
// compte, et aucune instance ne tourne avec des identifiants publics.
export default function Setup() {
  const { completeSetup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.post('/setup', {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      completeSetup(res);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Bienvenue"
      intro="Créez le compte administrateur pour commencer. C'est la seule étape."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Votre nom" required>
          <Input value={form.name} onChange={set('name')} autoComplete="name" autoFocus required />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={set('email')}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Mot de passe" required hint="8 caractères minimum.">
          <Input
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirmer le mot de passe" required>
          <Input
            type="password"
            value={form.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <Button variant="primary" type="submit" disabled={busy} aria-busy={busy} className="w-full">
          {busy ? 'Création…' : 'Créer le compte et entrer'}
        </Button>
      </form>

      <p className="mt-5 text-xs text-ink-faint">
        Ce compte est administrateur : il pourra créer les autres, ou brancher la
        connexion Microsoft Entra ID depuis Paramètres.
      </p>
    </AuthFrame>
  );
}
