import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, getToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Badge, Button, Select, Textarea, Field, Spinner, ErrorText, Card } from '../components/ui.jsx';
import Combobox from '../components/Combobox.jsx';
import { TICKET_STATUS, TICKET_PRIORITY, formatDateTime } from '../lib/labels.js';

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

// Les événements systèmes stockent les statuts bruts ; on les affiche en français.
function translateEvent(body) {
  return body.replace(
    /\b(new|in_progress|waiting|resolved|closed|low|medium|high)\b/g,
    (m) => TICKET_STATUS[m]?.label ?? TICKET_PRIORITY[m]?.label ?? m
  );
}

const ASSIGNEE_BADGE = { fg: 'var(--color-accent)', bg: 'var(--color-accent-soft)' };
const TEAM_BADGE = { fg: 'var(--color-status-waiting)', bg: 'var(--color-status-waiting-bg)' };
const REMOVED_BADGE = { fg: 'var(--color-status-closed)', bg: 'var(--color-status-closed-bg)' };

// Découpe un événement brut en segments texte / badges colorés :
// changements de statut et priorité, assignations et affectations d'équipe.
function parseEvent(body) {
  let m = body.match(/^(Statut changé|Priorité changée) : (\w+) → (\w+)(?: \((.+)\))?$/);
  if (m) {
    const dict = m[1] === 'Statut changé' ? TICKET_STATUS : TICKET_PRIORITY;
    const badge = (key) => dict[key] ?? { label: key, ...REMOVED_BADGE };
    return [
      { text: `${m[1]} :` },
      { badge: badge(m[2]) },
      { text: '→' },
      { badge: badge(m[3]) },
      ...(m[4] ? [{ text: `(${m[4]})` }] : []),
    ];
  }
  m = body.match(/^Assigné à (.+?)(?: \((.+)\))?$/);
  if (m) {
    return [
      { text: 'Assigné à' },
      { badge: { label: m[1], ...ASSIGNEE_BADGE } },
      ...(m[2] ? [{ text: `(${m[2]})` }] : []),
    ];
  }
  m = body.match(/^Affecté à l'équipe (.+?)(?: \((.+)\))?$/);
  if (m) {
    return [
      { text: "Affecté à l'équipe" },
      { badge: { label: m[1], ...TEAM_BADGE } },
      ...(m[2] ? [{ text: `(${m[2]})` }] : []),
    ];
  }
  if (body === 'Assignation retirée') {
    return [{ badge: { label: 'Assignation retirée', ...REMOVED_BADGE } }];
  }
  return [{ text: translateEvent(body) }];
}

// Image protégée par le JWT : fetch authentifié → object URL.
function AuthImage({ src, alt, className, onLoaded }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        onLoaded?.(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!url) {
    return <div className={`animate-pulse rounded-md bg-canvas ${className}`} style={{ minHeight: 96 }} />;
  }
  return <img src={url} alt={alt} className={className} />;
}

function RoleTag({ isRequester }) {
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${
        isRequester ? 'bg-canvas text-ink-soft' : 'bg-accent-soft text-accent'
      }`}
    >
      {isRequester ? 'Demandeur' : 'Support'}
    </span>
  );
}

function MessageHeader({ author, isRequester, isMe, createdAt }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-sm font-semibold">
        {author?.name}
        {isMe && <span className="font-normal text-ink-faint"> (vous)</span>}
      </span>
      <RoleTag isRequester={isRequester} />
      <span className="text-xs text-ink-faint">{formatDateTime(createdAt)}</span>
    </div>
  );
}

// Un message texte de la conversation.
function Message({ author, createdAt, body, isRequester, isMe }) {
  return (
    <li className="flex gap-3">
      <Avatar name={author?.name} id={author?.id ?? 0} />
      <div className="min-w-0 flex-1">
        <MessageHeader author={author} isRequester={isRequester} isMe={isMe} createdAt={createdAt} />
        <div
          className={`mt-1.5 rounded-lg rounded-tl-sm border px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
            isRequester ? 'border-line bg-canvas' : 'border-accent/15 bg-accent-soft/50'
          }`}
        >
          {body}
        </div>
      </div>
    </li>
  );
}

// Une pièce jointe dans le fil : aperçu inline pour les images, chip fichier sinon.
function AttachmentItem({ attachment, ticketId, requesterId, currentUserId, onDownload }) {
  const author = attachment.uploader;
  const isRequester = author?.id === requesterId;
  const isImage = IMAGE_RE.test(attachment.filename);
  const fullUrlRef = useRef(null);

  return (
    <li className="flex gap-3">
      <Avatar name={author?.name} id={author?.id ?? 0} />
      <div className="min-w-0 flex-1">
        <MessageHeader
          author={author}
          isRequester={isRequester}
          isMe={author?.id === currentUserId}
          createdAt={attachment.createdAt}
        />
        {isImage ? (
          <button
            type="button"
            title="Ouvrir en taille réelle"
            onClick={() => fullUrlRef.current && window.open(fullUrlRef.current, '_blank')}
            className={`mt-1.5 block max-w-md cursor-zoom-in overflow-hidden rounded-lg rounded-tl-sm border p-1 ${
              isRequester ? 'border-line bg-canvas' : 'border-accent/15 bg-accent-soft/50'
            }`}
          >
            <AuthImage
              src={`/api/tickets/${ticketId}/attachments/${attachment.id}`}
              alt={attachment.filename}
              className="max-h-72 rounded-md object-contain"
              onLoaded={(url) => (fullUrlRef.current = url)}
            />
            <span className="block px-1.5 py-1 text-left text-xs text-ink-faint">{attachment.filename}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onDownload(attachment)}
            className={`mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg rounded-tl-sm border px-3.5 py-2.5 text-sm ${
              isRequester ? 'border-line bg-canvas' : 'border-accent/15 bg-accent-soft/50'
            } hover:border-accent`}
          >
            <span className="text-accent underline-offset-2 hover:underline">{attachment.filename}</span>
            <span className="text-xs text-ink-faint">{Math.round(attachment.size / 1024)} Ko</span>
          </button>
        )}
      </div>
    </li>
  );
}

// Un événement système : ligne discrète alignée sur la colonne des avatars,
// avec des badges colorés pour les statuts, priorités et affectations.
function EventLine({ body, createdAt }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex w-8 shrink-0 justify-center">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-soft">
        {parseEvent(body).map((seg, i) =>
          seg.badge ? (
            <span
              key={i}
              className="inline-flex items-center rounded px-1.5 py-px font-medium whitespace-nowrap"
              style={{ color: seg.badge.fg, background: seg.badge.bg }}
            >
              {seg.badge.label}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
        <span className="text-ink-faint">{formatDateTime(createdAt)}</span>
      </span>
    </li>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [comment, setComment] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]); // [{file, previewUrl}]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [assignables, setAssignables] = useState([]);
  const fileInputRef = useRef(null);

  const isStaff = user.role !== 'user';

  const load = useCallback(() => {
    api.get(`/tickets/${id}`).then(setTicket).catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    load();
    // Menu d'assignation : accessoire, son échec ne doit pas casser le ticket.
    if (isStaff) api.get('/users/assignable').then(setAssignables).catch(() => {});
  }, [load, isStaff]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-ink-soft">
          Ticket introuvable. <Link to="/tickets" className="text-accent">Retour aux tickets</Link>
        </p>
      </div>
    );
  }
  if (!ticket) return <Spinner />;

  // Fil unique : description en premier, puis commentaires, événements et pièces
  // jointes fusionnés par date.
  const timeline = [
    ...ticket.comments.map((c) => ({ kind: c.type, item: c, ts: c.createdAt })),
    ...ticket.attachments.map((a) => ({ kind: 'attachment', item: a, ts: a.createdAt })),
  ].sort((a, b) => new Date(a.ts) - new Date(b.ts));

  const messageCount =
    1 + ticket.comments.filter((c) => c.type === 'comment').length + ticket.attachments.length;

  function addFiles(files) {
    const accepted = [...files].filter((f) => f.size <= 10 * 1024 * 1024);
    setPendingFiles((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ]);
  }

  function removePending(idx) {
    setPendingFiles((prev) => {
      const removed = prev[idx];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function onPaste(e) {
    const images = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (images.length) {
      e.preventDefault();
      // Nom lisible pour les captures collées (le presse-papier donne "image.png")
      const named = images.map(
        (f) => new File([f], `capture-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.png`, { type: f.type })
      );
      addFiles(named);
    }
  }

  async function patch(data) {
    setError(null);
    try {
      await api.patch(`/tickets/${ticket.id}`, data);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function send(e) {
    e.preventDefault();
    if ((!comment.trim() && pendingFiles.length === 0) || sending) return;
    setError(null);
    setSending(true);
    try {
      if (comment.trim()) {
        await api.post(`/tickets/${ticket.id}/comments`, { body: comment });
      }
      for (const { file, previewUrl } of pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await api.upload(`/tickets/${ticket.id}/attachments`, fd);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
      setComment('');
      setPendingFiles([]);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function downloadAttachment(a) {
    const res = await fetch(`/api/tickets/${ticket.id}/attachments/${a.id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = a.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <div className="mb-1 text-xs text-ink-faint">
          <Link to="/tickets" className="hover:text-accent">Tickets</Link> / #{ticket.id}
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{ticket.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge {...TICKET_STATUS[ticket.status]} />
          <Badge {...TICKET_PRIORITY[ticket.priority]} />
          <span className="text-xs text-ink-faint">
            {ticket.category?.name} · ouvert le {formatDateTime(ticket.createdAt)}
          </span>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_260px]">
        <Card title={`Conversation · ${messageCount} message${messageCount > 1 ? 's' : ''}`}>
          <ul className="space-y-4 px-4 py-4">
            <Message
              author={ticket.author}
              createdAt={ticket.createdAt}
              body={ticket.description}
              isRequester
              isMe={ticket.author?.id === user.id}
            />
            {timeline.map(({ kind, item }) =>
              kind === 'event' ? (
                <EventLine key={`e${item.id}`} body={item.body} createdAt={item.createdAt} />
              ) : kind === 'attachment' ? (
                <AttachmentItem
                  key={`a${item.id}`}
                  attachment={item}
                  ticketId={ticket.id}
                  requesterId={ticket.author?.id}
                  currentUserId={user.id}
                  onDownload={downloadAttachment}
                />
              ) : (
                <Message
                  key={`c${item.id}`}
                  author={item.author}
                  createdAt={item.createdAt}
                  body={item.body}
                  isRequester={item.author?.id === ticket.author?.id}
                  isMe={item.author?.id === user.id}
                />
              )
            )}
          </ul>

          <form onSubmit={send} className="border-t border-line p-3">
            <div className="flex gap-3">
              <Avatar name={user.name} id={user.id} />
              <div className="min-w-0 flex-1">
                <Textarea
                  rows={4}
                  placeholder="Répondre… (collez une capture d'écran directement ici)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onPaste={onPaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e);
                  }}
                />

                {pendingFiles.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {pendingFiles.map(({ file, previewUrl }, idx) => (
                      <li key={idx} className="relative rounded-md border border-line bg-canvas p-1">
                        {previewUrl ? (
                          <img src={previewUrl} alt={file.name} className="h-16 w-20 rounded object-cover" />
                        ) : (
                          <span className="block max-w-32 truncate px-2 py-5 text-xs text-ink-soft">
                            {file.name}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removePending(idx)}
                          title="Retirer"
                          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-ink text-[9px] leading-none text-white"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.txt,.log,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      className="hidden"
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer text-xs text-ink-soft hover:text-accent"
                    >
                      Joindre un fichier
                    </button>
                    <span className="hidden text-xs text-ink-faint sm:inline">Ctrl+Entrée pour envoyer</span>
                  </div>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={(!comment.trim() && pendingFiles.length === 0) || sending}
                  >
                    {sending ? 'Envoi…' : 'Envoyer'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          {ticket.workflows?.length > 0 && (
            <Card title="Workflow">
              <ul className="space-y-2.5 p-4">
                {ticket.workflows.map((wf, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-sm">⏳</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{wf.name}</div>
                      <div className="text-xs text-ink-soft">{wf.waiting}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {isStaff && (
            <Card title="Traitement">
              <div className="space-y-3 p-4">
                <Field label="Statut">
                  <Select value={ticket.status} onChange={(e) => patch({ status: e.target.value })}>
                    {Object.entries(TICKET_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Priorité">
                  <Select value={ticket.priority} onChange={(e) => patch({ priority: e.target.value })}>
                    {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assigné à">
                  <Combobox
                    value={ticket.assigneeId ? String(ticket.assigneeId) : ''}
                    onChange={(v) => patch({ assigneeId: v ? Number(v) : null })}
                    options={assignables.map((u) => ({ value: String(u.id), label: u.name }))}
                    placeholder="Rechercher une personne…"
                    emptyLabel="Non assigné"
                  />
                  {ticket.assigneeId !== user.id && (
                    <Button
                      variant="default"
                      className="mt-2 w-full"
                      onClick={() => patch({ assigneeId: user.id })}
                    >
                      M'assigner ce ticket
                    </Button>
                  )}
                </Field>
              </div>
            </Card>
          )}

          <Card title="Participants">
            <ul className="space-y-2.5 p-4">
              <li className="flex items-center gap-2.5">
                <Avatar name={ticket.author?.name} id={ticket.author?.id ?? 0} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm">{ticket.author?.name}</div>
                  <div className="text-xs text-ink-faint">Demandeur</div>
                </div>
              </li>
              {ticket.assignee ? (
                <li className="flex items-center gap-2.5">
                  <Avatar name={ticket.assignee.name} id={ticket.assignee.id} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm">{ticket.assignee.name}</div>
                    <div className="text-xs text-ink-faint">
                      Support{ticket.team ? ` · ${ticket.team.name}` : ''}
                    </div>
                  </div>
                </li>
              ) : (
                <li className="text-xs text-ink-faint">Pas encore d'assigné</li>
              )}
            </ul>
          </Card>

          <Card title="Détails">
            <dl className="space-y-2.5 p-4 text-sm">
              <div>
                <dt className="text-xs text-ink-faint">Équipement</dt>
                <dd>
                  {ticket.asset ? (
                    <Link to={`/inventaire/${ticket.asset.id}`} className="text-accent hover:underline">
                      {ticket.asset.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Équipe</dt>
                <dd>{ticket.team?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Dernière mise à jour</dt>
                <dd>{formatDateTime(ticket.updatedAt)}</dd>
              </div>
              {ticket.satisfaction !== null && (
                <div>
                  <dt className="text-xs text-ink-faint">Satisfaction du demandeur</dt>
                  <dd>
                    <Badge
                      label={ticket.satisfaction === 1 ? 'Satisfait' : 'Insatisfait'}
                      fg={
                        ticket.satisfaction === 1
                          ? 'var(--color-status-resolved)'
                          : 'var(--color-accent)'
                      }
                      bg={
                        ticket.satisfaction === 1
                          ? 'var(--color-status-resolved-bg)'
                          : 'var(--color-accent-soft)'
                      }
                    />
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
