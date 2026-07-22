// Petits composants partagés — volontairement minimalistes.

// Avatar à initiales, couleur stable par utilisateur (paires fond/texte des tokens statut).
const AVATAR_COLORS = [
  { bg: 'var(--color-status-new-bg)', fg: 'var(--color-status-new)' },
  { bg: 'var(--color-status-progress-bg)', fg: 'var(--color-status-progress)' },
  { bg: 'var(--color-status-waiting-bg)', fg: 'var(--color-status-waiting)' },
  { bg: 'var(--color-status-resolved-bg)', fg: 'var(--color-status-resolved)' },
  { bg: 'var(--color-accent-soft)', fg: 'var(--color-accent)' },
  { bg: 'var(--color-status-closed-bg)', fg: 'var(--color-status-closed)' },
];

export function Avatar({ name = '?', id = 0, size = 'md' }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const color = AVATAR_COLORS[id % AVATAR_COLORS.length];
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs' };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizes[size]}`}
      style={{ background: color.bg, color: color.fg }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Badge({ label, fg, bg }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: fg, background: bg }}
    >
      {label}
    </span>
  );
}

export function Button({ variant = 'default', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-strong',
    default: 'border border-line bg-surface text-ink hover:bg-canvas',
    ghost: 'text-ink-soft hover:bg-canvas hover:text-ink',
    danger: 'border border-line bg-surface text-accent hover:bg-accent-soft',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-ink-faint focus:outline-none ${props.className ?? ''}`}
    />
  );
}

export function Select({ children, className = '', ...props }) {
  const width = /(^|\s)w-/.test(className) ? '' : 'w-full';
  return (
    <select
      {...props}
      className={`${width} rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-ink-faint focus:outline-none ${className}`}
    >
      {children}
    </select>
  );
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink-faint focus:outline-none ${props.className ?? ''}`}
    />
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }) {
  return <p className="px-4 py-8 text-center text-sm text-ink-faint">{children}</p>;
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <p className="text-sm text-accent">{children}</p>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink-soft" />
    </div>
  );
}
