import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Donne une clé stable à chaque bloc et construit le graphe linéaire des
// workflows créés avant les branches (fils déduits de l'ordre `position`).
// Idempotent : les workflows ayant déjà des edges sont sautés.

const prisma = new PrismaClient();

async function main() {
  const workflows = await prisma.workflow.findMany({
    include: { steps: { orderBy: { position: 'asc' } } },
  });

  let done = 0;
  for (const wf of workflows) {
    const hasEdges = wf.edges && Object.keys(wf.edges).length > 0;
    if (hasEdges) continue;

    const edges = {};
    let prev = 'trigger';
    for (const step of wf.steps) {
      const key = step.key || crypto.randomUUID();
      if (!step.key) await prisma.workflowStep.update({ where: { id: step.id }, data: { key } });
      edges[prev] = key;
      prev = key;
    }
    await prisma.workflow.update({ where: { id: wf.id }, data: { edges } });
    done++;
  }
  console.log(`${done} workflow(s) migré(s) vers le graphe sur ${workflows.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
