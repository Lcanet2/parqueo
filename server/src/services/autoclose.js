import { prisma } from '../lib/prisma.js';
import { getAppSettings } from '../lib/appSettings.js';

// Clôture automatique : un ticket résolu sans activité depuis autoCloseDays
// jours passe en « Fermé » (comportement GLPI standard). Le délai se règle
// dans Paramètres (0 = désactivé) ; AUTO_CLOSE_DAYS n'est que le défaut initial.

export async function closeResolvedTickets() {
  const days = (await getAppSettings()).autoCloseDays;
  if (!days) return;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const stale = await prisma.ticket.findMany({
    where: { status: 'resolved', updatedAt: { lt: cutoff } },
    select: { id: true, assigneeId: true, authorId: true },
  });

  for (const t of stale) {
    await prisma.ticket.update({
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
    });
  }
  if (stale.length) {
    console.log(`[clôture auto] ${stale.length} ticket(s) résolu(s) fermé(s)`);
  }
}

export function startAutoClose() {
  const run = () => closeResolvedTickets().catch((err) => console.error('[clôture auto]', err.message));
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
