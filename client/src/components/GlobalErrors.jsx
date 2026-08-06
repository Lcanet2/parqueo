import { useEffect, useState } from 'react';

// Filet de sécurité : un appel d'API dont l'échec n'est pas traité par la page
// remonte ici au lieu de disparaître silencieusement dans la console. Les 401
// sont ignorés — la déconnexion est déjà gérée globalement (api/client.js).
export default function GlobalErrors() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    function onRejection(event) {
      const err = event.reason;
      if (err?.name !== 'ApiError' || err.status === 401) return;
      event.preventDefault();
      setMessage(err.message);
    }
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div
        role="alert"
        className="pointer-events-auto flex items-center gap-3 rounded-md border border-accent bg-accent-soft px-4 py-2.5"
      >
        <span className="text-sm text-ink">{message}</span>
        <button
          type="button"
          onClick={() => setMessage(null)}
          aria-label="Fermer"
          className="shrink-0 cursor-pointer text-ink-faint transition-colors hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
