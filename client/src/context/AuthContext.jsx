import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
