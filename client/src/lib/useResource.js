import { useCallback, useEffect, useState } from 'react';

// Chargement d'une ressource d'API avec ses trois états, au lieu du
// `api.get(…).then(setState)` sans `.catch` qui laisse la page tourner
// indéfiniment sur son spinner quand l'appel échoue.
//
//   const { data, error, loading, reload } = useResource(() => api.get('/tickets'), [filtres]);
//
// `loader` doit être stable ou reconstruit à chaque changement de `deps`.

export function useResource(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const load = useCallback(
    (signal) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      return run().then(
        (data) => {
          if (!signal?.cancelled) setState({ data, error: null, loading: false });
        },
        (err) => {
          // Un 401 est déjà traité globalement (déconnexion) : inutile
          // d'afficher en plus une erreur sur la page qu'on quitte.
          if (signal?.cancelled || err.status === 401) return;
          setState({ data: null, error: err.message, loading: false });
        }
      );
    },
    [run]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const reload = useCallback(() => load(), [load]);

  return { ...state, reload, set: (data) => setState({ data, error: null, loading: false }) };
}
