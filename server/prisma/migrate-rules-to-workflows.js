import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Conversion unique : chaque ancienne « règle » (catégorie → équipe/assigné)
// devient un workflow « ticket créé » équivalent. Idempotent : les règles déjà
// converties (même nom de workflow) sont sautées.

const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.workflowRule.findMany({
    include: { category: true, targetTeam: true, targetUser: true },
  });
  if (!rules.length) {
    console.log('Aucune règle à convertir.');
    return;
  }

  let converted = 0;
  for (const rule of rules) {
    const name = `Règle ${rule.category.name}`;
    const exists = await prisma.workflow.findFirst({ where: { name } });
    if (exists) continue;

    const steps = [];
    if (rule.targetTeam) steps.push({ type: 'assign_team', config: { teamId: rule.targetTeam.id } });
    if (rule.targetUser) steps.push({ type: 'assign_user', config: { userId: rule.targetUser.id } });
    if (!steps.length) continue;

    await prisma.workflow.create({
      data: {
        name,
        active: rule.active,
        trigger: 'ticket_created',
        conditions: { categoryId: rule.categoryId },
        position: rule.id,
        steps: { create: steps.map((s, i) => ({ ...s, position: i })) },
      },
    });
    converted++;
  }
  console.log(`${converted} règle(s) convertie(s) en workflow(s) sur ${rules.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
