import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { Card, Select, Spinner, ErrorText } from '../components/ui.jsx';
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

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-ink-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'left-4.5' : 'left-0.5'
        }`}
      />
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

  const toggle = (key) => (
    <Toggle checked={settings[key] !== false} onChange={(v) => set(key, v)} />
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Paramètres</h1>
        <span
          className={`text-xs text-ink-faint transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`}
        >
          Enregistré ✓
        </span>
      </div>
      <p className="text-sm text-ink-soft">
        Ces réglages s'appliquent immédiatement à tous les comptes.
      </p>

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
    </div>
  );
}
