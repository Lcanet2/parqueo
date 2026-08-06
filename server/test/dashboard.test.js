import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Chaque tuile du tableau de bord est cliquable et ouvre la liste des tickets.
// Le compteur affiché et le total de la liste ouverte doivent coïncider : une
// tuile qui annonce 4 et ouvre une liste de 60 fait douter du chiffre.

let api, ctx, t;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = {
    admin: await login(api, ctx.admin.email),
    tech: await login(api, ctx.tech.email),
    user: await login(api, ctx.user.email),
  };

  // Jeu de données couvrant tous les statuts, priorités et affectations.
  const combinaisons = [];
  const statuts = ['new', 'in_progress', 'waiting', 'resolved', 'closed'];
  const priorites = ['low', 'medium', 'high'];
  for (const [i, status] of statuts.entries()) {
    for (const [j, priority] of priorites.entries()) {
      for (const auteur of [ctx.user, ctx.tech, ctx.admin]) {
        combinaisons.push({
          title: `${status} ${priority} ${auteur.name}`,
          description: 'x',
          categoryId: ctx.category.id,
          authorId: auteur.id,
          assigneeId: (i + j) % 3 === 0 ? null : (i + j) % 3 === 1 ? ctx.tech.id : ctx.admin.id,
          status,
          priority,
        });
      }
    }
  }
  await prisma.ticket.createMany({ data: combinaisons });
});

after(async () => {
  await api.close();
  await disconnect();
});

// Reproduit ce que fait le client : « me » est remplacé par l'identifiant du
// compte connecté avant l'appel.
function versRequete(to, moi) {
  const query = new URLSearchParams(to.split('?')[1] ?? '');
  if (query.get('assignee') === 'me') {
    query.delete('assignee');
    query.set('assigneeId', moi);
  } else if (query.get('assignee') === 'none') {
    query.delete('assignee');
    query.set('assigneeId', 'none');
  }
  if (query.get('author') === 'me') {
    query.delete('author');
    query.set('authorId', moi);
  }
  query.set('page', '1');
  query.set('pageSize', '25');
  return `/api/tickets?${query}`;
}

// Les liens du catalogue de widgets (client/src/lib/dashboard.js), et le
// compteur de /api/tickets/stats correspondant.
const TUILES = [
  { metrique: 'Tickets ouverts', to: '/tickets?status=open', compteur: (s) => s.compteurs.ouverts },
  { metrique: 'Nouveaux tickets', to: '/tickets?status=new', compteur: (s) => s.parStatut.new },
  { metrique: 'À traiter (non assignés)', to: '/tickets?status=open&assignee=none', compteur: (s) => s.compteurs.nonAssignesOuverts },
  { metrique: 'Mes tickets en cours', to: '/tickets?status=open&assignee=me', compteur: (s) => s.compteurs.mesAssignesOuverts },
  { metrique: 'Priorité haute ouverte', to: '/tickets?status=open&priority=high', compteur: (s) => s.compteurs.hautesOuvertes },
  { metrique: 'En attente', to: '/tickets?status=waiting', compteur: (s) => s.parStatut.waiting },
  { metrique: 'Résolus', to: '/tickets?status=resolved', compteur: (s) => s.parStatut.resolved },
  { metrique: 'Mes tickets ouverts', to: '/tickets?status=open&author=me', compteur: (s) => s.compteurs.mesOuverts },
];

describe('les tuiles ouvrent la liste qu’elles comptent', () => {
  for (const role of ['user', 'tech', 'admin']) {
    test(`rôle ${role} : chaque tuile est cohérente avec sa liste`, async () => {
      const moi = ctx[role === 'tech' ? 'tech' : role].id;
      const stats = (await api.get('/api/tickets/stats', { token: t[role] })).data;

      for (const tuile of TUILES) {
        const attendu = tuile.compteur(stats);
        const liste = await api.get(versRequete(tuile.to, moi), { token: t[role] });
        assert.equal(liste.status, 200, `${tuile.metrique} → HTTP ${liste.status}`);
        assert.equal(
          liste.data.total,
          attendu,
          `« ${tuile.metrique} » affiche ${attendu} mais la liste en contient ${liste.data.total} (${tuile.to})`
        );
      }
    });
  }
});

describe('filtre « ouverts »', () => {
  test('regroupe nouveau, en cours et en attente', async () => {
    const res = await api.get('/api/tickets?status=open&page=1&pageSize=500', { token: t.admin });
    assert.equal(res.status, 200);
    assert.ok(res.data.items.every((x) => ['new', 'in_progress', 'waiting'].includes(x.status)));

    const attendu = await prisma.ticket.count({ where: { status: { in: ['new', 'in_progress', 'waiting'] } } });
    assert.equal(res.data.total, attendu);
  });

  test('le compteur « open » accompagne les chips', async () => {
    const { data } = await api.get('/api/tickets?page=1&pageSize=1', { token: t.admin });
    assert.equal(data.counts.open, data.counts.new + data.counts.in_progress + data.counts.waiting);
  });

  test('un statut inconnu est ignoré, pas rejeté', async () => {
    const res = await api.get('/api/tickets?status=nimportequoi&page=1&pageSize=25', { token: t.admin });
    assert.equal(res.status, 200);
    assert.equal(res.data.total, await prisma.ticket.count());
  });
});

describe('filtre par demandeur', () => {
  test('un technicien ne voit que ses propres demandes', async () => {
    const res = await api.get(`/api/tickets?authorId=${ctx.tech.id}&page=1&pageSize=500`, { token: t.tech });
    assert.ok(res.data.items.length > 0);
    assert.ok(res.data.items.every((x) => x.author.id === ctx.tech.id));
  });

  test('il ne contourne pas la visibilité', async () => {
    // Un utilisateur qui demanderait les tickets d'un autre n'obtient rien :
    // la visibilité s'applique avant le filtre.
    const res = await api.get(`/api/tickets?authorId=${ctx.admin.id}&page=1&pageSize=500`, { token: t.user });
    assert.equal(res.data.total, 0);
  });

  test('un identifiant non numérique est ignoré sans erreur', async () => {
    const res = await api.get('/api/tickets?authorId=abc&page=1&pageSize=25', { token: t.admin });
    assert.equal(res.status, 200);
  });
});
