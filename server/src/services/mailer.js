import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/labels.js';
import { getAppSettings } from '../lib/appSettings.js';

// Sans SMTP_HOST configuré (dev), les emails sont simplement loggés en console.
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : null;

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
    await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
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

// Nouveau commentaire : on prévient demandeur et assigné, sauf l'auteur du message.
export async function notifyCommentAdded(ticket, comment) {
  if (!(await getAppSettings()).notifyOnComment) return;
  const to = [ticket.author, ticket.assignee]
    .filter((u) => u?.email && u.id !== comment.author?.id)
    .map((u) => u.email)
    .join(', ');
  return send(
    to,
    `[Parqueo] Ticket #${ticket.id} : nouveau message de ${comment.author?.name ?? '—'}`,
    `${comment.author?.name ?? 'Quelqu\'un'} a répondu sur le ticket #${ticket.id} « ${ticket.title} » :\n\n${comment.body}`
  );
}
