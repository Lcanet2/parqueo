import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Amorçage d'une base neuve : uniquement les données de structure sans
// lesquelles l'application ne fonctionne pas — une catégorie pour ouvrir un
// ticket, une équipe pour l'affecter.
//
// Aucun compte n'est créé ici. Le compte administrateur se crée à la première
// visite, depuis l'écran d'installation (POST /api/setup) : livrer un
// admin@parqueo.local / admin1234 revenait à poser des identifiants publics sur
// chaque instance, en comptant sur la lecture de la documentation pour les
// changer. Et supprimer ce compte après en avoir créé un autre le faisait
// réapparaître au redémarrage suivant.
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

  const comptes = await prisma.user.count();

  console.log('Amorçage terminé :', { team: team.name, category: category.name });
  if (comptes === 0) {
    console.log("Aucun compte : ouvrez l'application pour créer l'administrateur.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
