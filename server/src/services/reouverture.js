import { prisma } from '../lib/prisma.js';
import { onTicketUpdated } from './workflowEngine.js';

// Réouverture par le demandeur.
//
// Un ticket résolu sur lequel le demandeur répond « toujours pas réglé » restait
// résolu : le message n'apparaissait dans aucune file « à traiter », et la
// clôture automatique finissait par le fermer. Comme dans GLPI, sa réponse le
// rouvre : « En cours » s'il a un assigné, « Nouveau » sinon. Un ticket fermé,
// lui, reste fermé — c'est l'état final ; on ouvre alors une nouvelle demande.
//
// Partagé par la réponse web et la réponse par email. Pas de notification de
// statut en plus : l'assigné reçoit déjà celle du message, et le demandeur n'a
// pas à être prévenu de ce qu'il vient de faire.

const ticketInclude = {
  category: true,
  author: { select: { id: true, name: true, email: true, avatar: true } },
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
  team: true,
  asset: { select: { id: true, name: true, type: true } },
};

// Renvoie le ticket rouvert, ou null s'il n'y avait rien à faire.
export async function rouvrirSiDemandeur(ticket, auteurId) {
  if (ticket.status !== 'resolved' || ticket.authorId !== auteurId) return null;

  const statut = ticket.assigneeId ? 'in_progress' : 'new';
  const rouvert = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: statut,
      comments: {
        create: {
          type: 'event',
          body: `Statut changé : resolved → ${statut} (rouvert par le demandeur)`,
          authorId: auteurId,
        },
      },
    },
    include: ticketInclude,
  });

  // Mêmes automatismes qu'un changement de statut manuel.
  return onTicketUpdated(rouvert, { statusChanged: true, oldStatus: 'resolved', newStatus: statut });
}
