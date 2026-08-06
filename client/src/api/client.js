const TOKEN_KEY = 'parqueo_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  // Serveur injoignable (coupure réseau, API arrêtée) : distingué des erreurs
  // renvoyées par l'API, qui ont un vrai code HTTP.
  get isNetwork() {
    return this.status === 0;
  }
}

// L'application s'abonne ici pour être prévenue quand l'API rejette le jeton
// (expiré au bout de 7 jours, compte supprimé, JWT_SECRET changé). Sans ça,
// l'utilisateur reste devant des pages vides sans comprendre pourquoi.
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: formData ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifiez votre connexion.');
  }

  // Le login a le droit de répondre 401 (mauvais identifiants) sans que cela
  // signifie une session expirée : il ne déclenche pas la déconnexion.
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    onUnauthorized?.();
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Erreur ${res.status}`);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', formData }),
};
