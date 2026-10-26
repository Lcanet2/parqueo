// Mot-symbole Parqueo — le P n'est pas une lettre du mot, c'est le symbole de marque :
// hampe = un connecteur, panse = un nœud plein. Le texte écrit ici est donc « arqueo »,
// d'où l'aria-label qui rétablit le nom complet pour les lecteurs d'écran.
//
// Le tracé est cadré au ras de la lettre (viewBox 6 3 12 18) et posé sur la ligne de base ;
// les tailles sont en em pour suivre la taille de texte du parent — .7em correspond à la
// hauteur de capitale d'Overpass, et .467em au ratio exact du tracé (12/18).
//
// La panse bleue est aussi le motif de toute l'interface : la pastille d'état
// (`.status-mark`) en reprend la forme, plate à gauche et ronde à droite.
//
// `mono` : posé sur l'aplat bleu de la barre latérale, le P passe tout entier
// à la couleur du texte — blanc sur bleu, comme sur un vrai panneau.
export default function Brand({ className = '', mono = false }) {
  return (
    <span
      aria-label="Parqueo"
      className={`font-bold tracking-[-0.02em] whitespace-nowrap ${className}`}
    >
      <svg
        viewBox="6 3 12 18"
        fill="none"
        aria-hidden="true"
        className="mr-[.05em] inline-block h-[.7em] w-[.467em] align-baseline"
      >
        <path d="M7 3h6a5 5 0 0 1 0 10H7z" className={mono ? 'fill-current' : 'fill-accent'} />
        <path d="M7 4v16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      arqueo
    </span>
  );
}
