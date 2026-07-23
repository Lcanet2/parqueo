// Mot-symbole Parqueo — le P n'est pas une lettre du mot, c'est le symbole de marque :
// hampe = un connecteur, panse = un nœud plein. Le texte écrit ici est donc « arqueo »,
// d'où l'aria-label qui rétablit le nom complet pour les lecteurs d'écran.
//
// Le tracé est cadré au ras de la lettre (viewBox 6 3 12 18) et posé sur la ligne de base ;
// les tailles sont en em pour suivre la taille de texte du parent — .72em correspond à la
// hauteur de capitale d'Inter, et .48em au ratio exact du tracé (12/18).
export default function Brand({ className = '' }) {
  return (
    <span
      aria-label="Parqueo"
      className={`font-semibold tracking-tight whitespace-nowrap ${className}`}
    >
      <svg
        viewBox="6 3 12 18"
        fill="none"
        aria-hidden="true"
        className="mr-[.045em] inline-block h-[.72em] w-[.48em] align-baseline"
      >
        <path d="M7 3h6a5 5 0 0 1 0 10H7z" className="fill-accent" />
        <path d="M7 4v16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      arqueo
    </span>
  );
}
