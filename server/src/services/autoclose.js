import { prisma } from '../lib/prisma.js';
import { getAppSettings } from '../lib/appSettings.js';
import { onTicketUpdated } from './workflowEngine.js';
import { notifyStatusChanged } from './mailer.js';

// Clôture automatique : un ticket résolu sans activité depuis autoCloseDays
// jours passe en « Fermé » (comportement GLPI standard). Le délai se règle
// dans Paramètres (0 = désactivé) ; AUTO_CLOSE_DAYS n'est que le défaut initial.

const ticketInclude = {
  category: true,
  author: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  team: true,
  asset: { select: { id: true, name: true, type: true } },
};

export async function closeResolvedTickets() {
  const days = (await getAppSettings()).autoCloseDays;
  if (!days) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const stale = await prisma.ticket.findMany({
    where: { status: 'resolved', updatedAt: { lt: cutoff } },
    select: { id: true, assigneeId: true, authorId: true },
  });

  let closed = 0;
  for (const t of stale) {
    try {
      const ticket = await prisma.ticket.update({
        where: { id: t.id },
        data: {
          status: 'closed',
          comments: {
            create: {
              type: 'event',
              body: `Statut changé : resolved → closed (clôture automatique après ${days} jours)`,
              authorId: t.assigneeId ?? t.authorId,
            },
          },
        },
        include: ticketInclude,
      });

      // Même traitement qu'une clôture faite à la main : notification et
      // workflows « statut changé ». Sans cela, le même changement d'état
      // déclencherait des automatismes ou non selon qui l'a provoqué — piège
      // garanti pour l'administrateur qui bâtit un workflow sur « Fermé ».
      notifyStatusChanged(ticket, 'resolved');
      await onTicketUpdated(ticket, {
        statusChanged: true,
        oldStatus: 'resolved',
        newStatus: 'closed',
      });
      closed += 1;
    } catch (err) {
      // Un ticket en échec ne doit pas interrompre la passe entière.
      console.error(`[clôture auto] ticket #${t.id} :`, err.message);
    }
  }

  if (closed) {
    console.log(`[clôture auto] ${closed} ticket(s) résolu(s) fermé(s)`);
  }
  return closed;
}

export function startAutoClose() {
  const run = () => closeResolvedTickets().catch((err) => console.error('[clôture auto]', err.message));
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
