import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { IconAlert } from './icons.jsx';

// Trois rôles à essayer sur l'instance publique. L'administrateur d'abord :
// c'est celui qui montre les workflows, l'inventaire et les réglages.
export const COMPTES_DEMO = [
  { email: 'admin@parqueo.local', libelle: 'Administrateur' },
  { email: 'tech@parqueo.local', libelle: 'Technicien' },
  { email: 'user@parqueo.local', libelle: 'Utilisateur' },
];
export const MOT_DE_PASSE_DEMO = 'test1234';

// Le serveur dit s'il tourne en mode démonstration ; le client ne le devine pas
// depuis l'adresse, pour qu'une démo montée sur un autre domaine se comporte
// pareil. `null` tant que la réponse n'est pas arrivée.
export function useDemo() {
  const [demo, setDemo] = useState(null);
  useEffect(() => {
    api
      .get('/auth/config')
      .then((c) => setDemo(Boolean(c.demo)))
      .catch(() => setDemo(false));
  }, []);
  return demo;
}

// Bandeau permanent : un visiteur doit savoir en un coup d'œil qu'il est sur une
// vitrine, que ses saisies disparaîtront, et où trouver le vrai produit.
export default function DemoBanner() {
  const demo = useDemo();
  if (!demo) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-accent/30 bg-accent-soft px-4 py-1.5 text-center text-xs text-accent-strong">
      <span className="flex items-center gap-1.5 font-medium">
        <IconAlert size={13} />
        Instance de démonstration
      </span>
      <span className="text-ink-soft">
        Les données sont réinitialisées chaque nuit. N'y saisissez rien de réel.
      </span>
      <a
        href="https://parqueo.fr/docs/installation/"
        className="rounded-sm font-medium underline underline-offset-2 hover:text-accent"
      >
        Installer Parqueo chez vous
      </a>
    </div>
  );
}
