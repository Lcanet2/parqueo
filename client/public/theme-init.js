// Thème posé avant le premier rendu, et non depuis React : monté après la
// peinture, il laisserait apparaître un éclair de page blanche avant de
// basculer en sombre. Script classique et synchrone, chargé dans <head> ; il
// duplique la logique de src/lib/theme.js parce qu'il doit s'exécuter avant que
// le moindre module ne soit chargé.
//
// Fichier séparé plutôt que script en ligne : la Content-Security-Policy
// (docker/Caddyfile) n'autorise que les scripts servis par l'application.
(function () {
  try {
    var p = localStorage.getItem('parqueo:theme');
    // Seuls 'light' et 'dark' sont des choix ; toute autre valeur — dont le
    // 'system' écrit par les versions qui proposaient ce troisième bouton —
    // signifie « rien de choisi », donc on suit l'appareil.
    var choisi = p === 'light' || p === 'dark';
    var dark =
      p === 'dark' || (!choisi && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
