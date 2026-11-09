import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/labels.js';
import { getAppSettings } from '../lib/appSettings.js';

// Sans SMTP_HOST configuré (dev), les emails sont simplement loggés en console.
// Options du transport SMTP, tirées de l'environnement. Exportée pour les tests.
//
// - secure : TLS dès la connexion (port 465, « SMTPS »). Sans lui, nodemailer
//   parlait en clair à un port qui attend du TLS et l'envoi échouait toujours.
//   SMTP_SECURE l'impose ou l'interdit ; par défaut il suit le port. Sur 587,
//   STARTTLS reste négocié automatiquement.
// - délais : par défaut nodemailer patiente 2 min pour se connecter et 10 min
//   sur un socket muet. Un email de workflow étant envoyé pendant la création
//   du ticket, un serveur SMTP en carafe figeait la requête d'autant.
export function optionsSmtp(env = process.env) {
  const port = Number(env.SMTP_PORT) || 587;
  const secure = env.SMTP_SECURE === 'true' ? true : env.SMTP_SECURE === 'false' ? false : port === 465;
  return {
    host: env.SMTP_HOST,
    port,
    secure,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

let transport = process.env.SMTP_HOST ? nodemailer.createTransport(optionsSmtp()) : null;

// Exposé pour les étapes « email » des workflows.
export async function sendMail(to, subject, text) {
  return send(to, subject, text);
}

async function send(to, subject, text) {
  if (!to) return;
  if (!transport) {
    console.log(`[mail non envoyé — SMTP non configuré] à: ${to} | ${subject}`);
    return;
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      headers: {
        // RFC 3834 : message produit par une machine. Les répondeurs bien
        // élevés n'y répondent pas, et le collecteur d'en face le reconnaît.
        'Auto-Submitted': 'auto-generated',
        // Demande explicite à Exchange / Outlook de ne pas renvoyer d'absence
        // automatique ni d'accusé de lecture.
        'X-Auto-Response-Suppress': 'All',
      },
    });
  } catch (err) {
    // Un échec d'email ne doit jamais faire échouer la requête.
    console.error(`[mail] échec d'envoi à ${to} :`, err.message);
  }
}

function appUrl() {
  return process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`;
}

// Lien signé valable 30 jours pour l'enquête de satisfaction un clic.
function satisfactionLinks(ticket) {
  const token = jwt.sign({ sub: ticket.id, purpose: 'satisfaction' }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
  const base = `${appUrl()}/api/tickets/satisfaction?token=${token}`;
  return `Votre demande a-t-elle été bien traitée ?\n👍 Oui : ${base}&value=up\n👎 Non : ${base}&value=down`;
}

// Chaque type de notification est débrayable dans Paramètres.

export async function notifyTicketCreated(ticket) {
  if (!(await getAppSettings()).notifyOnCreate) return;
  const to = [ticket.author?.email, ticket.assignee?.email].filter(Boolean).join(', ');
  return send(
    to,
    `[Parqueo] Ticket #${ticket.id} créé : ${ticket.title}`,
    `Le ticket #${ticket.id} « ${ticket.title} » a été créé.\n\n${ticket.description}\n\nPriorité : ${PRIORITY_LABELS[ticket.priority] ?? ticket.priority}`
  );
}

export async function notifyStatusChanged(ticket, oldStatus) {
  const settings = await getAppSettings();
  if (!settings.notifyOnStatus) return;
  const to = [ticket.author?.email, ticket.assignee?.email].filter(Boolean).join(', ');
  const oldLabel = STATUS_LABELS[oldStatus] ?? oldStatus;
  const newLabel = STATUS_LABELS[ticket.status] ?? ticket.status;
  let body = `Le statut du ticket #${ticket.id} « ${ticket.title} » est passé de « ${oldLabel} » à « ${newLabel} ».`;
  if (ticket.status === 'resolved' && settings.satisfactionSurvey) {
    body += `\n\n${satisfactionLinks(ticket)}`;
  }
  return send(to, `[Parqueo] Ticket #${ticket.id} : ${oldLabel} → ${newLabel}`, body);
}

export async function notifyAssigned(ticket) {
  if (!(await getAppSettings()).notifyOnAssign) return;
  return send(
    ticket.assignee?.email,
    `[Parqueo] Ticket #${ticket.id} vous a été assigné : ${ticket.title}`,
    `Le ticket #${ticket.id} « ${ticket.title} » vous a été assigné.\n\nPriorité : ${PRIORITY_LABELS[ticket.priority] ?? ticket.priority}\nDemandeur : ${ticket.author?.name ?? '—'}`
  );
}

// Nouveau commentaire : on prévient demandeur et assigné, sauf l'auteur du
// message. Une note interne ne part jamais vers le demandeur — seulement vers
// l'assigné.
export async function notifyCommentAdded(ticket, comment) {
  if (!(await getAppSettings()).notifyOnComment) return;
  const destinataires = comment.internal ? [ticket.assignee] : [ticket.author, ticket.assignee];
  const to = destinataires
    .filter((u) => u?.email && u.id !== comment.author?.id)
    .map((u) => u.email)
    .join(', ');
  return send(
    to,
    `[Parqueo] Ticket #${ticket.id} : ${comment.internal ? 'note interne' : 'nouveau message'} de ${comment.author?.name ?? '—'}`,
    `${comment.author?.name ?? 'Quelqu\'un'} a répondu sur le ticket #${ticket.id} « ${ticket.title} » :\n\n${comment.body}`
  );
}
