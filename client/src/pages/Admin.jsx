import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Button,
  Input,
  Select,
  Textarea,
  Field,
  Card,
  ErrorText,
  ErrorState,
  EmptyState,
  Spinner,
} from '../components/ui.jsx';
import { parseCsv } from '../lib/csv.js';
import FormsTab from '../components/FormsTab.jsx';
import WorkflowsTab from '../components/WorkflowsTab.jsx';
import DataTable from '../components/DataTable.jsx';
import { Pagination, usePaged } from '../components/Pagination.jsx';
import { ROLE } from '../lib/labels.js';

const TABS = [
  { key: 'users', label: 'Utilisateurs' },
  { key: 'teams', label: 'Équipes' },
  { key: 'categories', label: 'Catégories' },
  { key: 'forms', label: 'Formulaires' },
  { key: 'workflows', label: 'Workflows' },
];

export default function Admin() {
  const [tab, setTab] = useState('users');

  return (
    <div className={`mx-auto space-y-4 ${tab === 'workflows' ? 'max-w-none' : 'max-w-4xl'}`}>
      <h1 className="text-lg font-semibold tracking-tight">Administration</h1>

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors',
              tab === t.key
                ? 'border-accent font-medium text-ink'
                : 'border-transparent text-ink-soft hover:text-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'teams' && <SimpleListTab endpoint="/teams" label="équipe" placeholder="Ex. : Support N2" />}
      {tab === 'categories' && <SimpleListTab endpoint="/categories" label="catégorie" placeholder="Ex. : Réseau" />}
      {tab === 'forms' && <FormsTab />}
      {tab === 'workflows' && <WorkflowsTab />}
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', teamId: '' });
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // compte en cours de gestion (email / mot de passe)
  const [emailDraft, setEmailDraft] = useState('');
  const [pwDraft, setPwDraft] = useState('');
  const [panelMsg, setPanelMsg] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResults, setImportResults] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);

  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    setLoadError(null);
    api.get('/users').then(setUsers).catch((err) => setLoadError(err.message));
    // Les équipes ne servent qu'à remplir un menu : leur échec ne doit pas
    // masquer la liste des comptes.
    api.get('/teams').then(setTeams).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function createUser(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/users', {
        ...form,
        teamId: form.teamId ? Number(form.teamId) : null,
      });
      setForm({ name: '', email: '', password: '', role: 'user', teamId: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function patchUser(id, data) {
    setError(null);
    try {
      await api.patch(`/users/${id}`, data);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeUser(u) {
    if (!confirm(`Supprimer le compte de ${u.name} ?`)) return;
    setError(null);
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadFile(file) {
    if (file) setImportText(await file.text());
  }

  async function doImport() {
    setImportError(null);
    setImportResults(null);
    const parsed = parseCsv(importText);
    if (!parsed.length) {
      setImportError('Aucune ligne détectée. En-tête attendu : name,email,role,team,password.');
      return;
    }
    setImporting(true);
    try {
      const res = await api.post('/users/import', { users: parsed });
      setImportResults(res);
      load();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function openManage(u) {
    setEditing(u);
    setEmailDraft(u.email);
    setPwDraft('');
    setPanelMsg(null);
    setError(null);
  }

  async function saveEmail() {
    setError(null);
    setPanelMsg(null);
    try {
      const updated = await api.patch(`/users/${editing.id}`, { email: emailDraft });
      setEditing(updated);
      setPanelMsg('Adresse email mise à jour.');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetPassword() {
    setError(null);
    setPanelMsg(null);
    try {
      await api.patch(`/users/${editing.id}`, { password: pwDraft });
      setPwDraft('');
      setPanelMsg('Mot de passe réinitialisé.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loadError) return <ErrorState error={loadError} onRetry={load} />;
  if (!users) return <Spinner />;

  const columns = [
    { key: 'name', label: 'Nom', value: (u) => u.name, filter: 'text', tdClassName: 'font-medium' },
    {
      key: 'email',
      label: 'Email',
      value: (u) => u.email,
      filter: 'text',
      className: 'hidden sm:table-cell',
      tdClassName: 'hidden sm:table-cell text-ink-soft',
    },
    {
      key: 'role',
      label: 'Rôle',
      value: (u) => ROLE[u.role],
      render: (u) => (
        <Select
          value={u.role}
          disabled={u.id === me.id}
          onChange={(e) => patchUser(u.id, { role: e.target.value })}
          className="w-auto"
        >
          {Object.entries(ROLE).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      ),
    },
    {
      key: 'team',
      label: 'Équipe',
      value: (u) => teams.find((t) => t.id === u.teamId)?.name ?? '',
      className: 'hidden md:table-cell',
      tdClassName: 'hidden md:table-cell',
      render: (u) => (
        <Select
          value={u.teamId ?? ''}
          onChange={(e) => patchUser(u.id, { teamId: e.target.value ? Number(e.target.value) : null })}
          className="w-auto"
        >
          <option value="">Aucune</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      ),
    },
    {
      key: 'actions',
      label: '',
      filter: false,
      sortable: false,
      tdClassName: 'text-right',
      render: (u) => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" onClick={() => openManage(u)}>Gérer</Button>
          {u.id !== me.id && (
            <Button variant="ghost" onClick={() => removeUser(u)}>Supprimer</Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card title="Créer un compte">
        <form onSubmit={createUser} className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Nom">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Mot de passe (8 car. min)">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rôle">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Équipe">
              <Select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                <option value="">Aucune</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end">
              <Button variant="primary" type="submit">Créer le compte</Button>
            </div>
          </div>
        </form>
      </Card>

      <Card
        title="Importer des comptes (CSV)"
        action={
          <Button variant="ghost" onClick={() => setImportOpen((v) => !v)}>
            {importOpen ? 'Masquer' : 'Importer un CSV'}
          </Button>
        }
      >
        {importOpen && (
          <div className="space-y-3 p-4">
            <p className="text-xs text-ink-soft">
              Colonnes : <code>name,email,role,team,password</code>. Seuls <code>name</code> et{' '}
              <code>email</code> sont obligatoires · <code>role</code> = admin / technician / user (défaut : user)
              · <code>team</code> = nom d'une équipe existante · <code>password</code> optionnel (généré
              automatiquement si absent).
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => loadFile(e.target.files[0])}
              className="block w-full text-sm text-ink-soft file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
            <Textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'name,email,role,team\nJean Dupont,jean@boite.fr,technician,Support N2'}
              className="font-mono text-xs"
            />
            <ErrorText>{importError}</ErrorText>
            <div className="flex justify-end">
              <Button variant="primary" onClick={doImport} disabled={importing || !importText.trim()}>
                {importing ? 'Import…' : 'Importer'}
              </Button>
            </div>
            {importResults && <ImportResults data={importResults} />}
          </div>
        )}
      </Card>

      {editing && (
        <Card
          title={`Gérer ${editing.name}`}
          action={<Button variant="ghost" onClick={() => setEditing(null)}>Fermer</Button>}
        >
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adresse email">
                <div className="flex gap-2">
                  <Input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
                  <Button
                    variant="primary"
                    onClick={saveEmail}
                    disabled={!emailDraft.trim() || emailDraft.trim().toLowerCase() === editing.email}
                  >
                    Enregistrer
                  </Button>
                </div>
              </Field>
              <Field label="Réinitialiser le mot de passe (8 car. min)">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={pwDraft}
                    onChange={(e) => setPwDraft(e.target.value)}
                    placeholder="Nouveau mot de passe"
                    autoComplete="new-password"
                  />
                  <Button variant="primary" onClick={resetPassword} disabled={pwDraft.length < 8}>
                    Réinitialiser
                  </Button>
                </div>
              </Field>
            </div>
            {panelMsg && <p className="text-sm text-status-resolved">{panelMsg}</p>}
            <ErrorText>{error}</ErrorText>
          </div>
        </Card>
      )}

      <Card title={`Comptes (${users.length})`}>
        <DataTable rows={users} columns={columns} rowKey={(u) => u.id} emptyText="Aucun compte" />
      </Card>
    </div>
  );
}

function ImportResults({ data }) {
  const { summary, results } = data;
  const withPw = results.filter((r) => r.status === 'created' && r.password);
  const problems = results.filter((r) => r.status !== 'created');
  return (
    <div className="space-y-3 rounded-md border border-line bg-canvas p-3">
      <p className="text-sm">
        <span className="font-medium text-status-resolved">{summary.created} créé(s)</span>, {summary.skipped}{' '}
        ignoré(s), {summary.errors} erreur(s) sur {summary.total}.
      </p>
      {withPw.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-ink-soft">
            Mots de passe temporaires générés — à communiquer une seule fois (les comptes devraient les changer) :
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {withPw.map((r) => (
                  <tr key={r.email} className="border-b border-line last:border-0">
                    <td className="py-1 pr-3">{r.email}</td>
                    <td className="py-1 font-mono">{r.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {problems.length > 0 && (
        <ul className="space-y-0.5 text-xs text-ink-soft">
          {problems.map((r, i) => (
            <li key={i}>
              <span className="text-ink-faint">{r.email || '(vide)'}</span> —{' '}
              {r.status === 'skipped' ? 'ignoré' : 'erreur'} : {r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimpleListTab({ endpoint, label, placeholder }) {
  const [items, setItems] = useState(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.get(endpoint).then(setItems).catch((err) => setError(err.message));
  }, [endpoint]);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = items ?? [];
    return q ? src.filter((i) => i.name.toLowerCase().includes(q)) : src;
  }, [items, search]);
  const paged = usePaged(filtered);

  async function create(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(endpoint, { name });
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card title={`${label.charAt(0).toUpperCase() + label.slice(1)}s (${items?.length ?? 0})`}>
      <form onSubmit={create} className="flex gap-2 border-b border-line p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} required />
        <Button variant="primary" type="submit">Ajouter</Button>
      </form>
      {items && items.length > 0 && (
        <div className="border-b border-line p-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Rechercher une ${label}…`} />
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {items === null ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState>{search ? `Aucune ${label} ne correspond` : `Aucune ${label}`}</EmptyState>
      ) : (
        <>
          <ul>
            {paged.pageRows.map((i) => (
              <li key={i.id} className="border-b border-line px-4 py-2.5 text-sm last:border-0">
                {i.name}
              </li>
            ))}
          </ul>
          <Pagination
            total={paged.total}
            page={paged.page}
            pageSize={paged.pageSize}
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
            unit={label}
          />
        </>
      )}
    </Card>
  );
}
