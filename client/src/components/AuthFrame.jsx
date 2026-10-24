import Brand from './Brand.jsx';

// Cadre des écrans hors session (connexion, premier lancement) : le formulaire
// sur la feuille blanche, et à droite le P de la marque à très grande échelle,
// rogné par la fenêtre — le même motif que l'en-tête du site parqueo.fr. C'est
// le seul endroit de l'application où la marque prend de la place : une fois
// connecté, elle se réduit au logo et laisse la place au travail.
export default function AuthFrame({ title, intro, children }) {
  return (
    <div className="min-h-screen bg-frame md:grid md:grid-cols-[minmax(26rem,1fr)_minmax(0,1.15fr)]">
      <main className="flex min-h-screen flex-col bg-surface px-6 py-7 md:m-2 md:mr-0 md:min-h-[calc(100vh-1rem)] md:rounded-(--radius-sheet) md:border md:border-line md:px-14 md:py-10">
        <div className="text-[26px] leading-none">
          <Brand />
        </div>
        <div className="my-auto w-full max-w-sm py-10">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
          {intro && <p className="mt-2 text-[15px] text-ink-soft">{intro}</p>}
          <div className="mt-7">{children}</div>
        </div>
        <p className="text-xs text-ink-faint">
          Parqueo, ITSM auto-hébergé : vos tickets et votre parc restent sur ce serveur.
        </p>
      </main>
      <div aria-hidden="true" className="relative hidden overflow-hidden md:block">
        <svg
          viewBox="6 3 12 18"
          className="absolute top-[9vh] left-[9%] h-auto w-[86%]"
          fill="none"
        >
          <path d="M7 3h6a5 5 0 0 1 0 10H7z" className="fill-accent" />
          {/* À cette échelle la hampe est un rectangle franc : le bout arrondi du
              logo débordait en bosse au-dessus de la panse. */}
          <rect x="5.8" y="3" width="2.4" height="18" className="fill-ink" />
        </svg>
      </div>
    </div>
  );
}
