// Thème clair / sombre.
//
// Trois valeurs de préférence : 'system' (défaut), 'light', 'dark'. La
// préférence est conservée dans le navigateur ; c'est un réglage de poste, au
// même titre que le zoom, pas une donnée de compte — un même utilisateur peut
// vouloir le sombre sur son portable le soir et le clair sur le poste du
// bureau en plein jour.
//
// Ce que la préférence donne au bout du compte, c'est un attribut
// `data-theme="light|dark"` sur <html> : tous les tokens de couleur en
// dépendent, et aucun composant n'a besoin de savoir quel thème est actif.

const KEY = 'parqueo:theme';
export const THEMES = ['system', 'light', 'dark'];

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getPreference() {
  const stored = localStorage.getItem(KEY);
  return THEMES.includes(stored) ? stored : 'system';
}

// Thème effectivement appliqué, une fois « système » résolu.
export function resolveTheme(preference = getPreference()) {
  if (preference === 'light' || preference === 'dark') return preference;
  return media().matches ? 'dark' : 'light';
}

export function applyTheme(preference = getPreference()) {
  document.documentElement.dataset.theme = resolveTheme(preference);
}

export function setPreference(preference) {
  if (preference === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, preference);
  applyTheme(preference);
}

// En mode « système », suivre le réglage de l'OS tant que la page est ouverte :
// sans ça, une bascule automatique au coucher du soleil ne serait prise en
// compte qu'au prochain rechargement.
export function watchSystemTheme() {
  const mq = media();
  const onChange = () => {
    if (getPreference() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
