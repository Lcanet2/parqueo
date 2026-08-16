import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Button, Card, Field, Input, ErrorText, PageHeader } from '../components/ui.jsx';
import { IconTrash } from '../components/icons.jsx';
import { ROLE } from '../lib/labels.js';
import { ThemeChoice } from '../components/ThemeToggle.jsx';

// Mon compte : informations du compte connecté et changement de mot de passe.
// Les comptes Microsoft n'ont pas de mot de passe local : le formulaire est
// remplacé par un renvoi vers Microsoft.
export default function Account() {
  const { user, updateUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const estSso = user.provider === 'entra';

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      await api.patch('/auth/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lecture space-y-4">
      <PageHeader title="Mon compte" />

      <Card title="Informations">
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar name={user.name} id={user.id} avatar={user.avatar} />
          <div className="min-w-0">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-sm text-ink-soft">{user.email}</div>
          </div>
          <div className="ml-auto text-xs text-ink-faint">{ROLE[user.role]}</div>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-faint">
          Le nom, l'adresse email et le rôle sont gérés par l'administration.
        </p>
      </Card>

      <PhotoDeProfil user={user} onChange={updateUser} />

      <Card title="Apparence">
        <div className="space-y-2 px-4 py-4">
          <ThemeChoice />
          <p className="text-xs text-ink-faint">
            « Système » suit le réglage de votre appareil. Le choix est propre à ce
            navigateur : il ne suit pas votre compte sur un autre poste.
          </p>
        </div>
      </Card>

      <Card title="Mot de passe">
        {estSso ? (
          <p className="px-4 py-4 text-sm text-ink-soft">
            Ce compte se connecte avec Microsoft. Le mot de passe se change directement
            dans votre compte Microsoft.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
            <Field label="Mot de passe actuel">
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Nouveau mot de passe">
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Confirmer le nouveau mot de passe">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>

            <p className="text-xs text-ink-faint">
              8 caractères minimum. Vos autres sessions ouvertes restent actives jusqu'à
              leur expiration.
            </p>

            <ErrorText>{error}</ErrorText>
            {done && (
              <p role="status" className="text-sm text-status-resolved">
                Mot de passe mis à jour.
              </p>
            )}

            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

// Photo de profil. Elle remplace les initiales partout où le compte apparaît :
// listes de tickets, conversation, participants, barre latérale.
function PhotoDeProfil({ user, onChange }) {
  const champ = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function envoyer(fichier) {
    if (!fichier) return;
    setError(null);

    // Contrôlé aussi côté serveur ; ici c'est pour éviter d'envoyer 8 Mo sur une
    // connexion lente avant d'apprendre que c'est refusé.
    if (fichier.size > 2 * 1024 * 1024) {
      setError('Image trop lourde : 2 Mo maximum.');
      return;
    }

    setBusy(true);
    try {
      const donnees = new FormData();
      donnees.append('file', fichier);
      onChange(await api.upload('/auth/avatar', donnees));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function retirer() {
    setError(null);
    setBusy(true);
    try {
      onChange(await api.delete('/auth/avatar'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Photo de profil">
      <div className="flex flex-wrap items-center gap-4 px-4 py-4">
        <Avatar name={user.name} id={user.id} avatar={user.avatar} size="lg" />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={champ}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                envoyer(e.target.files[0]);
                e.target.value = ''; // permet de renvoyer deux fois le même fichier
              }}
            />
            <Button onClick={() => champ.current?.click()} disabled={busy} aria-busy={busy}>
              {user.avatar ? 'Changer la photo' : 'Choisir une photo'}
            </Button>
            {user.avatar && (
              <Button variant="danger" onClick={retirer} disabled={busy}>
                <IconTrash size={14} />
                Retirer
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-faint">
            PNG, JPEG, WebP ou GIF, 2 Mo maximum. Sans photo, vos initiales sont
            affichées.
          </p>
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </Card>
  );
}
