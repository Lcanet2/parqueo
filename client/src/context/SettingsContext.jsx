import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Paramètres globaux de l'application (définis par l'administration dans
// Paramètres) — chargés une fois par session et exposés à toutes les pages.
const SettingsContext = createContext({ settings: null, refresh: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  const refresh = () => api.get('/settings/app').then(setSettings);

  useEffect(() => {
    refresh().catch(() => setSettings({}));
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, refresh }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
