import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Paramètres globaux de l'application (définis par l'administration dans
// Paramètres) — chargés une fois par session et exposés à toutes les pages.
const SettingsContext = createContext({ settings: null, error: null, refresh: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  // Le contexte traite lui-même son erreur : aucun appelant ne peut oublier de
  // le faire. En cas d'échec on retombe sur un objet vide plutôt que de laisser
  // toute l'application derrière un spinner — chaque page a des valeurs par
  // défaut raisonnables pour les réglages qu'elle consulte.
  const refresh = useCallback(
    () =>
      api.get('/settings/app').then(
        (value) => {
          setSettings(value);
          setError(null);
        },
        (err) => {
          setSettings((current) => current ?? {});
          setError(err.message);
        }
      ),
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SettingsContext.Provider value={{ settings, error, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
