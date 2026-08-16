// Thème clair / sombre.
//
// Deux choix seulement : 'light' et 'dark'. Tant que rien n'a été choisi, le
// réglage du système fait foi — c'est le comportement attendu d'une application
// aujourd'hui, et ça évite d'imposer du blanc à quelqu'un dont tout le poste est
// en sombre. Mais ça reste un point de départ, pas une option : dès le premier
// clic, le choix est figé et le système n'a plus voix au chapitre.
//
// La préférence est conservée dans le navigateur ; c'est un réglage de poste, au
// même titre que le zoom, pas une donnée de compte — un même utilisateur peut
// vouloir le sombre sur son portable le soir et le clair sur le poste du bureau
// en plein jour.
//
// Ce que la préférence donne au bout du compte, c'est un attribut
// `data-theme="light|dark"` sur <html> : tous les tokens de couleur en
// dépendent, et aucun composant n'a besoin de savoir quel thème est actif.

const KEY = 'parqueo:theme';
export const THEMES = ['light', 'dark'];

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

// `null` = aucun choix enregistré, on suit le système. Une valeur ancienne
// (« system », écrite par les versions qui proposaient ce troisième bouton) est
// traitée comme telle : ces navigateurs retombent naturellement sur le système
// sans qu'on ait à nettoyer leur stockage.
export function getPreference() {
  const stored = localStorage.getItem(KEY);
  return THEMES.includes(stored) ? stored : null;
}

// Thème effectivement appliqué. Sans choix enregistré, celui du système.
export function resolveTheme(preference = getPreference()) {
  return preference ?? (media().matches ? 'dark' : 'light');
}

export function applyTheme(preference = getPreference()) {
  document.documentElement.dataset.theme = resolveTheme(preference);
}

export function setPreference(preference) {
  if (!THEMES.includes(preference)) return;
  localStorage.setItem(KEY, preference);
  applyTheme(preference);
}

// Tant que rien n'a été choisi, suivre l'OS pendant que la page est ouverte :
// sans ça, une bascule automatique au coucher du soleil ne serait prise en
// compte qu'au prochain rechargement. Dès qu'un choix existe, on n'écoute plus.
export function watchSystemTheme() {
  const mq = media();
  const onChange = () => {
    if (getPreference() === null) applyTheme(null);
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
