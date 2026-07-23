import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const team = await prisma.team.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Support IT' },
  });

  const category = await prisma.category.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Matériel' },
  });

  const adminPasswordHash = await bcrypt.hash('admin1234', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@parqueo.local' },
    update: {},
    create: {
      email: 'admin@parqueo.local',
      passwordHash: adminPasswordHash,
      name: 'Administrateur',
      role: 'admin',
    },
  });

  console.log('Seed terminé :', { team, category, admin: admin.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
