import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Select, Field, ErrorText } from './ui.jsx';
import Combobox from './Combobox.jsx';
import { ASSET_TYPE, ASSET_STATUS } from '../lib/labels.js';

// Formulaire création/édition d'actif, réutilisé par la liste et la fiche.
export default function AssetForm({ asset, onSaved, onCancel }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    type: asset?.type ?? 'pc',
    location: asset?.location ?? '',
    purchaseDate: asset?.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
    status: asset?.status ?? 'in_service',
    assignedUserId: asset?.assignedUserId ? String(asset.assignedUserId) : '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Liste d'affectation : accessoire. En cas d'échec le menu reste vide,
    // l'actif peut être créé sans utilisateur assigné.
    const source = user.role === 'admin' ? '/users' : '/users/assignable';
    api.get(source).then(setUsers).catch(() => setUsers([]));
  }, [user.role]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload = {
      name: form.name,
      type: form.type,
      location: form.location || null,
      purchaseDate: form.purchaseDate || null,
      status: form.status,
      assignedUserId: form.assignedUserId ? Number(form.assignedUserId) : null,
    };
    try {
      const saved = asset
        ? await api.patch(`/assets/${asset.id}`, payload)
        : await api.post('/assets', payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Ex. : PC-COMPTA-03" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(ASSET_TYPE).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Localisation">
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Ex. : Bureau 204" />
        </Field>
        <Field label="Date d'achat">
          <Input type="date" value={form.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} />
        </Field>
        <Field label="État">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(ASSET_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Utilisateur assigné">
          <Combobox
            value={form.assignedUserId}
            onChange={(v) => set('assignedUserId', v)}
            options={users.map((u) => ({ value: String(u.id), label: u.name }))}
            placeholder="Rechercher une personne…"
            emptyLabel="Aucun"
          />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" onClick={onCancel}>Annuler</Button>}
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Enregistrement…' : asset ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
    </form>
  );
}
