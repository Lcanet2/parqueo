import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Field, ErrorText } from '../components/ui.jsx';
import Brand from '../components/Brand.jsx';

export default function Login() {
  const { login, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ssoOn, setSsoOn] = useState(false);

  // Le serveur indique si le SSO est configuré (affichage du bouton).
  useEffect(() => {
    api.get('/auth/config').then((c) => setSsoOn(c.sso)).catch(() => {});
    // Erreur renvoyée par le callback SSO (?sso_error=…).
    const err = new URLSearchParams(window.location.search).get('sso_error');
    if (err) setError(err);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-1 text-lg">
            <Brand />
          </div>
          <p className="text-sm text-ink-soft">Connectez-vous pour continuer</p>
        </div>
        {sessionMessage && !error && (
          <p className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-center text-sm text-ink-soft">
            {sessionMessage}
          </p>
        )}
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-line bg-surface p-6"
        >
          {ssoOn && (
            <>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  window.location.href = '/api/auth/sso/login';
                }}
              >
                Se connecter avec Microsoft
              </Button>
              <div className="flex items-center gap-3 text-xs text-ink-faint">
                <span className="h-px flex-1 bg-line" />
                ou
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" type="submit" disabled={busy} className="w-full">
            {busy ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  );
}
