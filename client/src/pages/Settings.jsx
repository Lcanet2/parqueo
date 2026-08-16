import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { Card, Select, Spinner, ErrorText, PageHeader } from '../components/ui.jsx';
import { IconCheck } from '../components/icons.jsx';
import { TICKET_PRIORITY } from '../lib/labels.js';

const AUTO_CLOSE_CHOICES = [
  { value: 0, label: 'Désactivée' },
  { value: 3, label: 'Après 3 jours' },
  { value: 7, label: 'Après 7 jours' },
  { value: 14, label: 'Après 14 jours' },
  { value: 30, label: 'Après 30 jours' },
];

const STALE_CHOICES = [
  { value: 0, label: 'Désactivé' },
  { value: 7, label: 'Après 7 jours' },
  { value: 30, label: 'Après 30 jours' },
  { value: 60, label: 'Après 60 jours' },
  { value: 90, label: 'Après 90 jours' },
];

// Le réglage et son explication portent des identifiants, pour que
// l'interrupteur ait un nom et une description au lieu d'être annoncé
// « bouton, activé » sans dire de quoi.
function Row({ label, hint, children }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div id={`${id}-label`} className="text-sm">
          {label}
        </div>
        {hint && (
          <div id={`${id}-hint`} className="text-xs text-ink-faint">
            {hint}
          </div>
        )}
      </div>
      <div className="shrink-0">
        {typeof children === 'function'
          ? children({ labelledBy: `${id}-label`, describedBy: hint ? `${id}-hint` : undefined })
          : children}
      </div>
    </div>
  );
}

// Le piste de l'interrupteur mesure 20 px de haut : la zone cliquable est
// étendue par du remplissage pour atteindre les 44 px au doigt, sans grossir le
// dessin.
function Toggle({ checked, onChange, labelledBy, describedBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer items-center justify-center px-2 py-3 [@media(pointer:coarse)]:min-h-11"
    >
      <span
        className={`relative block h-5 w-9 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-field'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-all ${
            checked ? 'left-4.5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

// Paramètres globaux (admin) : chaque changement est enregistré immédiatement
// et s'applique à toute l'application.
export default function Settings() {
  const { settings, error: loadError, refresh } = useSettings();
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  if (!settings) return <Spinner />;

  async function set(key, value) {
    setError(null);
    try {
      await api.patch('/settings/app', { [key]: value });
      await refresh();
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  const toggle = (key) => (ids) => (
    <Toggle checked={settings[key] !== false} onChange={(v) => set(key, v)} {...ids} />
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Paramètres"
        description="Ces réglages s'appliquent immédiatement à tous les comptes."
        actions={
          <span
            role="status"
            className={`flex items-center gap-1 text-xs text-status-resolved transition-opacity ${
              saved ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <IconCheck size={12} />
            {saved ? 'Enregistré' : ''}
          </span>
        }
      />

      <ErrorText>{error ?? loadError}</ErrorText>

      <Card title="Tableaux de bord">
        <div className="divide-y divide-line">
          <Row
            label="Personnalisation par les techniciens"
            hint="Chaque technicien peut adapter son tableau de bord par-dessus celui défini pour son rôle"
          >
            {toggle('dashboardPersonalTechnician')}
          </Row>
          <Row
            label="Personnalisation par les utilisateurs"
            hint="Chaque utilisateur peut adapter son tableau de bord par-dessus celui défini pour son rôle"
          >
            {toggle('dashboardPersonalUser')}
          </Row>
        </div>
      </Card>

      <Card title="Tickets">
        <div className="divide-y divide-line">
          <Row label="Priorité par défaut" hint="Appliquée quand aucune priorité n'est choisie">
            <Select
              aria-label="Priorité par défaut"
              className="w-auto"
              value={settings.ticketDefaultPriority}
              onChange={(e) => set('ticketDefaultPriority', e.target.value)}
            >
              {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          </Row>
          <Row
            label="Choix de la priorité par les utilisateurs"
            hint="Désactivé : les demandeurs ne choisissent pas la priorité, le support la qualifie"
          >
            {toggle('userCanSetPriority')}
          </Row>
          <Row
            label="Clôture automatique des tickets résolus"
            hint="Un ticket résolu sans activité passe en « Fermé » au bout de ce délai"
          >
            <Select
              aria-label="Clôture automatique des tickets résolus"
              className="w-auto"
              value={settings.autoCloseDays}
              onChange={(e) => set('autoCloseDays', Number(e.target.value))}
            >
              {AUTO_CLOSE_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Row>
          <Row
            label="Enquête de satisfaction"
            hint="Deux liens « satisfait / insatisfait » dans l'email envoyé à la résolution d'un ticket"
          >
            {toggle('satisfactionSurvey')}
          </Row>
        </div>
      </Card>

      <Card title="Notifications email">
        <div className="divide-y divide-line">
          <Row label="Création de ticket" hint="Envoyée au demandeur et à l'assigné">
            {toggle('notifyOnCreate')}
          </Row>
          <Row label="Changement de statut" hint="Envoyée au demandeur et à l'assigné">
            {toggle('notifyOnStatus')}
          </Row>
          <Row label="Assignation" hint="Envoyée au technicien qui reçoit le ticket">
            {toggle('notifyOnAssign')}
          </Row>
          <Row label="Nouveau message" hint="Envoyée à l'autre partie de la conversation">
            {toggle('notifyOnComment')}
          </Row>
        </div>
      </Card>

      <Card title="Base de connaissances">
        <div className="divide-y divide-line">
          <Row
            label="Suggestions à la création de ticket"
            hint="Propose des articles d'aide pendant la saisie du titre"
          >
            {toggle('kbSuggest')}
          </Row>
          <Row
            label="Rédaction par les techniciens"
            hint="Désactivé : seuls les admins créent et modifient les articles"
          >
            {toggle('kbTechniciansWrite')}
          </Row>
        </div>
      </Card>

      <Card title="Inventaire">
        <div className="divide-y divide-line">
          <Row
            label="Inventaire visible par les utilisateurs"
            hint="Chaque utilisateur ne voit que ses propres équipements ; désactivé, la section disparaît pour eux"
          >
            {toggle('assetsVisibleToUsers')}
          </Row>
          <Row
            label="Signaler les actifs périmés"
            hint="Un équipement d'inventaire automatique sans remontée depuis ce délai est marqué en rouge. Son statut n'est jamais modifié."
          >
            <Select
              aria-label="Délai avant de signaler un actif périmé"
              className="w-auto"
              value={settings.assetStaleDays}
              onChange={(e) => set('assetStaleDays', Number(e.target.value))}
            >
              {STALE_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Row>
        </div>
      </Card>

      <APropos />
    </div>
  );
}

// Référence de l'instance, en fin de page : la version est la première chose
// qu'on demande en support, et la licence la première qu'on cherche avant de
// déployer un logiciel auto-hébergé en entreprise.
function APropos() {
  const [infos, setInfos] = useState(null);

  useEffect(() => {
    api.get('/about').then(setInfos).catch(() => {});
  }, []);

  return (
    <Card title="À propos">
      <div className="space-y-3 px-4 py-4 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-faint">Version</dt>
            <dd className="tabular-nums">{infos ? infos.version : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Licence</dt>
            <dd>
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {infos ? infos.license : 'AGPL-3.0'}
              </a>
            </dd>
          </div>
        </dl>

        <p className="border-t border-line pt-3 text-xs text-ink-soft">
          Parqueo est libre : vous l'installez et l'exploitez chez vous sans rien devoir.
          Si vous préférez déléguer l'hébergement, la migration depuis GLPI ou le
          support — ou si vous le proposez à des tiers et cherchez une licence
          adaptée —{' '}
          <a
            href="https://parqueo.fr/services"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            parqueo.fr/services
          </a>
          .
        </p>
      </div>
    </Card>
  );
}
