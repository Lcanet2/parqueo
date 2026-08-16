import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Renseigné quand la session est coupée par le serveur : affiché sur l'écran
  // de connexion pour expliquer le retour au login.
  const [sessionMessage, setSessionMessage] = useState(null);
  // Instance jamais installée : aucun compte n'existe encore en base. Tant que
  // c'est vrai, toute l'application redirige vers l'écran d'installation.
  const [needsSetup, setNeedsSetup] = useState(false);

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

    // Une session valide vaut preuve que l'installation est faite : on
    // n'interroge /setup/status que faute de session, pour ne pas ajouter un
    // aller-retour à chaque chargement de page.
    (async () => {
      if (getToken()) {
        try {
          setUser(await api.get('/auth/me'));
          setLoading(false);
          return;
        } catch {
          setToken(null);
        }
      }
      try {
        const { needsSetup: requis } = await api.get('/setup/status');
        setNeedsSetup(requis);
      } catch {
        // API injoignable : l'écran de connexion et GlobalErrors le disent déjà.
      }
      setLoading(false);
    })();
  }, []);

  async function login(email, password) {
    const { token, user } = await api.post('/auth/login', { email, password });
    setToken(token);
    setUser(user);
    setSessionMessage(null);
  }

  // Fin de l'installation : le serveur a renvoyé un jeton, on entre directement
  // dans l'application sans repasser par l'écran de connexion.
  function completeSetup({ token, user: created }) {
    setToken(token);
    setUser(created);
    setNeedsSetup(false);
  }

  function logout() {
    setToken(null);
    setUser(null);
    setSessionMessage(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, sessionMessage, needsSetup, completeSetup }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
