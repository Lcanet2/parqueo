import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Renseigné quand la session est coupée par le serveur : affiché sur l'écran
  // de connexion pour expliquer le retour au login.
  const [sessionMessage, setSessionMessage] = useState(null);

  useEffect(() => {
    // Enregistré avant le premier appel : dès que l'API renvoie 401, la session
    // est vidée et l'utilisateur renvoyé sur l'écran de connexion.
    setUnauthorizedHandler(() => {
      setUser((current) => {
        if (current) setSessionMessage('Votre session a expiré, reconnectez-vous.');
        return null;
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    // Retour de connexion SSO : le serveur renvoie le jeton dans l'URL. On le
    // récupère, on le stocke, puis on nettoie l'URL pour ne pas le laisser traîner.
    const url = new URL(window.location.href);
    const ssoToken = url.searchParams.get('sso_token');
    if (ssoToken) {
      setToken(ssoToken);
      url.searchParams.delete('sso_token');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }

    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await api.post('/auth/login', { email, password });
    setToken(token);
    setUser(user);
    setSessionMessage(null);
  }

  function logout() {
    setToken(null);
    setUser(null);
    setSessionMessage(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, sessionMessage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
