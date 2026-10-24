import { cloneElement, isValidElement, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconInbox, IconSearch, IconAlert, IconChevronRight } from './icons.jsx';

// Briques partagées de l'interface — volontairement minimalistes, mais toutes
// soumises aux mêmes règles : cible tactile d'au moins 44 px sur écran tactile,
// focus clavier visible (l'anneau global d'index.css), et jamais de couleur
// comme seul porteur d'information.

// Cible tactile : sur un pointeur grossier (doigt), les contrôles compacts de
// l'interface dense passent à 44 px de haut. Sur souris, la densité est gardée.
const TOUCH = '[@media(pointer:coarse)]:min-h-11';

// Avatar à initiales, teinte stable par personne. Les teintes sont celles des
// personnes, pas celles des états : six tons pâles espacés de 60° au moins, qui
// n'apparaissent dans aucun graphique et ne peuvent pas passer pour un statut.
const PERSON_HUES = [212, 152, 32, 352, 92, 272];

// `avatar` est le nom de fichier renvoyé par l'API ; sans lui, on retombe sur
// les initiales. L'image est chargée par une balise <img> ordinaire : son
// adresse contient un secret de 32 caractères qui tient lieu d'autorisation,
// ce qui évite un appel authentifié par pastille (une liste de tickets en
// affiche jusqu'à cent). Voir server/src/routes/avatars.js.
export function Avatar({ name = '?', id = 0, avatar = null, size = 'md' }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hue = PERSON_HUES[id % PERSON_HUES.length];
  const sizes = { sm: 'h-6 w-6 text-[11px]', md: 'h-8 w-8 text-xs', lg: 'h-16 w-16 text-lg' };
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${sizes[size]}`;

  // Si le fichier a disparu — volume non restauré, sauvegarde partielle — le
  // navigateur afficherait son icône d'image cassée dans chaque ligne de la
  // liste. On revient alors aux initiales, qui ne dépendent que du nom.
  const [absente, setAbsente] = useState(false);

  if (avatar && !absente) {
    return (
      <img
        src={`/api/avatars/${avatar}`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setAbsente(true)}
        className={`${base} bg-canvas object-cover`}
      />
    );
  }

  return (
    <span
      className={`${base} bg-[hsl(var(--h)_60%_92%)] text-[hsl(var(--h)_45%_28%)] dark:bg-[hsl(var(--h)_22%_22%)] dark:text-[hsl(var(--h)_60%_82%)]`}
      style={{ '--h': hue }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

// Deux formes. Une paire pâle (fond teinté, texte de la même teinte) pour les
// priorités et les étiquettes. Et, quand `mark` est donné, la pastille d'état :
// la panse du P à la couleur de l'état, le libellé à l'encre — une file de
// cinquante tickets ne devient pas un mur de pastilles colorées.
export function Badge({ label, fg, bg, mark }) {
  if (mark) {
    return (
      <span className="inline-flex flex-none items-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-ink">
        <span className="status-mark" style={{ color: fg }} data-parked={mark === 'parked' ? '' : undefined} />
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex flex-none items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: fg, background: bg }}
    >
      {label}
    </span>
  );
}

export function Button({ variant = 'default', className = '', ...props }) {
  // `whitespace-nowrap` : un libellé de bouton ne se coupe pas (« Nouveau
  // workflow » passait sur deux lignes à côté d'un paragraphe dans un en-tête).
  const base = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-[background-color,border-color,color,scale] active:scale-[.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer ${TOUCH}`;
  const variants = {
    // L'action principale est quasi noire : le bleu de la marque est gardé pour
    // les données, un bouton bleu sur chaque écran l'aurait banalisé.
    primary: 'bg-primary text-on-primary hover:bg-primary-strong',
    default: 'border border-line bg-surface text-ink hover:bg-canvas hover:border-field',
    ghost: 'text-ink-soft hover:bg-canvas hover:text-ink',
    danger: 'border border-line bg-surface text-negative hover:bg-negative-soft hover:border-negative',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

// Bouton sans texte : le libellé accessible est obligatoire, sinon le bouton est
// muet pour un lecteur d'écran. Le `title` sert d'infobulle à la souris.
export function IconButton({ label, children, variant = 'ghost', className = '', ...props }) {
  const variants = {
    ghost: 'text-ink-soft hover:bg-canvas hover:text-ink',
    danger: 'text-ink-soft hover:bg-negative-soft hover:text-negative',
    active: 'bg-active text-ink',
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={props.title ?? label}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// `border-field` et non `border-line` : à 1.3:1, la bordure d'origine ne
// permettait pas de distinguer un champ de saisie du fond blanc de la carte.
// La largeur n'est PAS dans cette base : `w-full` et `w-auto` sont deux
// utilitaires du même groupe, celui qui gagne est le dernier écrit dans la
// feuille compilée, pas le dernier de la chaîne de classes — une base contenant
// `w-full` écrasait donc le `w-auto` des menus de filtre.
const CONTROL = `rounded-md border border-field bg-surface text-sm text-ink placeholder:text-ink-faint aria-invalid:border-negative ${TOUCH}`;

export function Input({ className = '', ...props }) {
  return <input {...props} className={`${CONTROL} w-full px-3 py-1.5 ${className}`} />;
}

// Recherche : type `search` (le navigateur propose l'effacement et l'historique)
// et icône de loupe — la seule affordance était jusqu'ici le texte indicatif,
// qui disparaît dès la première frappe.
export function SearchInput({ className = '', label = 'Rechercher', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        aria-label={props.placeholder ?? label}
        {...props}
        className={`${CONTROL} w-full py-1.5 pr-3 pl-8`}
      />
    </div>
  );
}

export function Select({ children, className = '', ...props }) {
  const width = /(^|\s)w-/.test(className) ? '' : 'w-full';
  return (
    <select {...props} className={`${CONTROL} ${width} px-2.5 py-1.5 ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }) {
  return <textarea {...props} className={`${CONTROL} w-full px-3 py-2 ${className}`} />;
}

// Champ de formulaire : libellé visible (jamais le seul texte indicatif),
// texte d'aide et message d'erreur rattachés au contrôle par aria-describedby,
// et `aria-invalid` posé automatiquement — un lecteur d'écran annonce alors le
// champ comme en erreur au lieu de laisser la bordure rouge parler seule.
export function Field({ label, hint, error, required = false, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control =
    isValidElement(children) && (describedBy || error)
      ? cloneElement(children, {
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
        })
      : children;

  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
        {required && (
          <span className="text-negative" title="Champ obligatoire">
            {' '}
            *
          </span>
        )}
      </span>
      {hint && (
        <span id={hintId} className="mb-1 block text-xs text-ink-faint">
          {hint}
        </span>
      )}
      {control}
      {error && (
        <span id={errorId} role="alert" className="mt-1 block text-xs text-negative">
          {error}
        </span>
      )}
    </label>
  );
}

// Colonne flex : quand la carte reçoit une hauteur (h-full dans la grille du
// tableau de bord), le corps occupe la place restante sous l'en-tête au lieu de
// laisser un vide en bas. Sans hauteur imposée, le rendu est inchangé.
export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3.5 pb-1.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-xs text-ink-faint">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

// En-tête de page : même rythme sur les quinze écrans (fil d'Ariane, titre,
// phrase d'explication, actions à droite) au lieu d'un `<h1>` recopié à la main
// avec un alignement différent à chaque page.
export function PageHeader({ title, trail = [], description, actions }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {trail.length > 0 && (
          <nav aria-label="Fil d'Ariane" className="mb-1 flex items-center gap-1 text-xs text-ink-faint">
            {trail.map((step, i) => (
              <span key={step.label} className="flex items-center gap-1">
                {step.to ? (
                  <Link to={step.to} className="rounded-sm hover:text-ink">
                    {step.label}
                  </Link>
                ) : (
                  <span>{step.label}</span>
                )}
                {/* Le séparateur relie deux segments : il n'y en a pas après le
                    dernier, qui est la page courante. */}
                {i < trail.length - 1 && <IconChevronRight size={12} />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[22px] leading-tight font-bold tracking-[-0.015em]">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// État vide : une phrase de constat ne suffit pas — on dit aussi quoi faire
// ensuite. `children` reste accepté comme titre pour les appels courts.
export function EmptyState({ icon: Glyph = IconInbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-canvas text-ink-faint">
        <Glyph size={20} />
      </span>
      <p className="text-sm font-medium text-ink">{title ?? children}</p>
      {title && children && <p className="mt-1 max-w-sm text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// `role="alert"` : le message est annoncé quand il apparaît, au lieu de n'exister
// que pour qui regarde l'écran au bon endroit.
export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-negative">
      {children}
    </p>
  );
}

// Échec de chargement d'une page : message explicite et bouton de reprise,
// plutôt qu'un spinner qui tourne dans le vide.
export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center text-negative">
        <IconAlert size={20} />
      </span>
      <p className="text-sm font-medium text-ink">Le chargement a échoué</p>
      <p className="mt-1 max-w-sm text-sm text-ink-soft">{error}</p>
      {onRetry && (
        <div className="mt-4">
          <Button onClick={onRetry}>Réessayer</Button>
        </div>
      )}
    </div>
  );
}

export function Spinner({ label = 'Chargement…' }) {
  return (
    <div className="flex justify-center py-12" role="status" aria-live="polite">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink-soft" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// Blocs gris de la même taille que le contenu attendu. Un spinner centré fait
// sauter la page au moment où les données arrivent ; la silhouette réserve la
// place et le décalage cumulatif reste nul.
export function Skeleton({ className = '' }) {
  return <span className={`block animate-pulse rounded bg-line ${className}`} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, columns = 4 }) {
  return (
    <div className="px-4 py-3" role="status" aria-live="polite">
      <span className="sr-only">Chargement de la liste…</span>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line py-3 last:border-0">
          {/* La première colonne est plus large : la silhouette rappelle un
              tableau (libellé long, colonnes courtes) et non une grille vide. */}
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={c === 0 ? 'h-4 flex-[3]' : 'h-4 flex-1'} />
          ))}
        </div>
      ))}
    </div>
  );
}
