import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '../lib/prisma.js';
import { estSupport } from '../middleware/roles.js';
import {
  extractTicketId,
  stripQuotedReply,
  bareAddress,
  premierAuthResults,
  echecAuthentification,
  motifReponseAutomatique,
  estReponseNoteInterne,
} from '../lib/inbound.js';
import { LIMITS, tronque } from '../lib/input.js';
import { onTicketCreated } from './workflowEngine.js';
import { notifyTicketCreated, notifyCommentAdded } from './mailer.js';

// Collecteur email : les messages envoyés à la boîte IMAP_USER deviennent des
// tickets ; les réponses (sujet contenant « Ticket #n ») deviennent des
// commentaires. Seuls les expéditeurs connus (utilisateurs Parqueo) sont
// acceptés — un email inconnu est ignoré pour éviter les tickets spam.

const ALLOWED_FILES = /\.(png|jpe?g|gif|webp|pdf|txt|log|csv|zip|docx?|xlsx?|pptx?)$/i;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function saveAttachments(ticketId, userId, attachments) {
  for (const att of attachments) {
    const filename = att.filename ?? '';
    if (!ALLOWED_FILES.test(filename) || !att.content?.length || att.content.length > MAX_FILE_SIZE) {
      continue;
    }
    const ext = path.extname(filename).slice(0, 10);
    const storedPath = path.join('uploads', `${crypto.randomUUID()}${ext}`);
    await fs.writeFile(storedPath, att.content);
    await prisma.attachment.create({
      data: { ticketId, filename, storedPath, size: att.content.length, uploadedBy: userId },
    });
  }
}

// Traite un email entrant déjà parsé. Exporté pour être testable sans IMAP.
export async function handleIncomingEmail({
  fromAddress,
  subject = '',
  text = '',
  attachments = [],
  authResults = null,
  headerLines = [],
}) {
  const sender = bareAddress(fromAddress);

  // Répondeur, absence, avis de non-remise : jamais un ticket ni un commentaire
  // (voir lib/inbound.js — c'est ce qui coupe les boucles entre deux absences).
  const automatique = motifReponseAutomatique(headerLines, fromAddress);
  if (automatique) {
    console.log(`[collecteur] message automatique de ${sender} ignoré (${automatique})`);
    return { action: 'ignored', reason: `message automatique : ${automatique}` };
  }

  // Usurpation détectée par le serveur de réception : le message n'engage pas
  // la personne dont il porte l'adresse.
  const echec = echecAuthentification(authResults);
  if (echec) {
    console.warn(`[collecteur] email rejeté — expéditeur ${sender} non authentifié (${echec})`);
    return { action: 'ignored', reason: `expéditeur non authentifié : ${echec}` };
  }

  // Anti-boucle : on ignore ce que le système s'envoie à lui-même.
  const selfAddresses = [process.env.SMTP_FROM, process.env.IMAP_USER].filter(Boolean).map(bareAddress);
  if (!sender || selfAddresses.includes(sender)) return { action: 'ignored', reason: 'expéditeur système' };

  const user = await prisma.user.findUnique({ where: { email: sender } });
  if (!user) {
    console.log(`[collecteur] email ignoré — expéditeur inconnu : ${sender}`);
    return { action: 'ignored', reason: 'expéditeur inconnu' };
  }

  // Un email peut être arbitrairement long : on borne comme la saisie web.
  const body = tronque(stripQuotedReply(text), LIMITS.commentaire) || '(message vide)';

  // Réponse à un ticket existant → commentaire, seulement de la part du
  // demandeur ou de l'assigné : ce sont eux qui reçoivent les notifications
  // auxquelles on répond. L'adresse d'expédition reste moins sûre qu'une
  // session : la visibilité complète du rôle (tous les tickets pour un admin)
  // ferait d'une adresse d'administrateur usurpée un passe-partout.
  const ticketId = extractTicketId(subject);
  if (ticketId) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        OR: [{ authorId: user.id }, { assigneeId: user.id }],
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
    if (ticket) {
      // Réponse à une note interne, par quelqu'un du support : elle reste
      // interne. Un demandeur ne reçoit jamais ces notifications ; si le
      // repère apparaît dans son sujet, il ne change rien.
      const internal = estReponseNoteInterne(subject) && estSupport(user);

      // Même règle que la réponse web : le message fait avancer updatedAt (voir
      // routes/tickets.js), sans quoi la clôture automatique l'ignorerait.
      const [comment] = await prisma.$transaction([
        prisma.ticketComment.create({
          data: { ticketId: ticket.id, authorId: user.id, type: 'comment', body, internal },
          include: { author: { select: { id: true, name: true } } },
        }),
        prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } }),
      ]);
      // Une pièce jointe est toujours visible du demandeur : jamais à côté
      // d'une note interne (même règle que l'interface).
      if (internal) {
        if (attachments.length) console.log(`[collecteur] pièces jointes d'une note interne ignorées (ticket #${ticket.id})`);
      } else {
        await saveAttachments(ticket.id, user.id, attachments);
      }
      notifyCommentAdded(ticket, comment);
      console.log(`[collecteur] ${internal ? 'note interne' : 'réponse'} de ${sender} ajoutée au ticket #${ticket.id}`);
      return { action: 'comment', ticketId: ticket.id };
    }
    // Ticket inexistant ou hors de sa visibilité : on ne jette pas le message,
    // il devient une demande à part entière traitée ci-dessous.
    console.log(`[collecteur] ticket #${ticketId} inaccessible à ${sender} — nouvelle demande`);
  }

  // Sinon → nouveau ticket dans la catégorie IMAP_CATEGORY_ID (ou la première).
  const category =
    (process.env.IMAP_CATEGORY_ID &&
      (await prisma.category.findUnique({ where: { id: Number(process.env.IMAP_CATEGORY_ID) } }))) ||
    (await prisma.category.findFirst({ orderBy: { id: 'asc' } }));
  if (!category) {
    console.error('[collecteur] aucune catégorie en base, email ignoré');
    return { action: 'ignored', reason: 'aucune catégorie' };
  }

  let ticket = await prisma.ticket.create({
    data: {
      title: tronque(subject.trim(), LIMITS.titre) || 'Demande reçue par email',
      description: body,
      priority: 'medium',
      categoryId: category.id,
      authorId: user.id,
      comments: { create: { type: 'event', body: 'Ticket créé par email', authorId: user.id } },
    },
    include: {
      category: true,
      author: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      team: true,
      asset: { select: { id: true, name: true, type: true } },
    },
  });
  ticket = await onTicketCreated(ticket);
  await saveAttachments(ticket.id, user.id, attachments);
  notifyTicketCreated(ticket);
  console.log(`[collecteur] ticket #${ticket.id} créé par email de ${sender}`);
  return { action: 'ticket', ticketId: ticket.id };
}

async function pollOnce() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT) || 993,
    secure: process.env.IMAP_TLS !== 'false',
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      // Marqué lu avant traitement : un email qui fait planter le parseur ne
      // doit pas être retraité en boucle à chaque cycle.
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      try {
        const parsed = await simpleParser(msg.source);
        await handleIncomingEmail({
          fromAddress: parsed.from?.value?.[0]?.address ?? '',
          subject: parsed.subject ?? '',
          text: parsed.text ?? '',
          attachments: parsed.attachments ?? [],
          authResults: premierAuthResults(parsed.headerLines),
          headerLines: parsed.headerLines ?? [],
        });
      } catch (err) {
        console.error('[collecteur] échec de traitement d\'un email :', err.message);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

export function startMailbox() {
  if (!process.env.IMAP_HOST) return;
  const interval = Math.max(Number(process.env.IMAP_POLL_SECONDS) || 60, 15) * 1000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce();
    } catch (err) {
      console.error('[collecteur] erreur IMAP :', err.message);
    } finally {
      running = false;
    }
  };

  console.log(`[collecteur] boîte ${process.env.IMAP_USER} relevée toutes les ${interval / 1000}s`);
  tick();
  setInterval(tick, interval).unref();
}
