import './setup.js';
import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';

// Le moteur de workflows, éprouvé de bout en bout par l'API : un workflow est
// créé comme depuis l'éditeur, puis un ticket le traverse pour de vrai.
//
// Jusqu'ici un seul parcours était couvert (affectation d'équipe puis attente de
// prise en charge). Les branches, les conditions de déclenchement, l'ordre entre
// workflows, les blocs d'attente sur statut et les garde-fous anti-boucle ne
// l'étaient pas.

let api;
let ctx;
let t;

before(async () => {
  api = await startServer();
});

after(async () => {
  await api.close();
  await disconnect();
});

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  t = {
    admin: await login(api, ctx.admin.email),
    tech: await login(api, ctx.tech.email),
    user: await login(api, ctx.user.email),
  };
});

// Un workflow ne se crée pas d'un coup : POST pose le nom et le déclencheur,
// PUT enregistre blocs, fils et conditions. L'éditeur fait exactement ça.
async function creerWorkflow({ nom, trigger = 'ticket_created', steps, edges, conditions = {}, active = true }) {
  const cree = await api.post('/api/workflows', { token: t.admin, body: { name: nom, trigger } });
  assert.equal(cree.status, 201, JSON.stringify(cree.data));

  const complet = await api.put(`/api/workflows/${cree.data.id}`, {
    token: t.admin,
    body: { name: nom, trigger, active, conditions, steps, edges },
  });
  assert.equal(complet.status, 200, JSON.stringify(complet.data));
  assert.equal(complet.data.steps.length, steps.length, 'tous les blocs doivent être enregistrés');
  return complet.data;
}

const creerTicket = (body) =>
  api.post('/api/tickets', {
    token: t.user,
    body: { title: 'Ticket', description: 'Corps', categoryId: ctx.category.id, ...body },
  });

const relire = (id) => api.get(`/api/tickets/${id}`, { token: t.admin }).then((r) => r.data);
const evenements = (ticket) => ticket.comments.filter((c) => c.type === 'event').map((c) => c.body);

describe('workflows sur les tickets', () => {
  describe('déclenchement', () => {
    test('à la création : la chaîne d’actions s’applique dans l’ordre', async () => {
      await creerWorkflow({
        nom: 'Routage matériel',
        steps: [
          { key: 'a', type: 'assign_team', config: { teamId: ctx.team.id } },
          { key: 'b', type: 'set_priority', config: { priority: 'high' } },
          { key: 'c', type: 'add_note', config: { body: 'Pris en charge par le routage.' } },
        ],
        edges: { trigger: 'a', a: 'b', b: 'c' },
      });

      const { data } = await creerTicket({ priority: 'low' });
      const ticket = await relire(data.id);

      assert.equal(ticket.teamId, ctx.team.id, 'l’équipe doit être affectée');
      assert.equal(ticket.priority, 'high', 'la priorité doit être relevée');

      const traces = evenements(ticket);
      assert.ok(traces.some((e) => /Affecté à l'équipe/.test(e)), 'affectation tracée');
      assert.ok(traces.some((e) => /Priorité changée/.test(e)), 'changement de priorité tracé');
      assert.ok(
        ticket.comments.some((c) => /Pris en charge par le routage/.test(c.body)),
        'la note doit apparaître dans le fil'
      );
    });

    test('un workflow inactif ne fait rien', async () => {
      await creerWorkflow({
        nom: 'Désactivé',
        active: false,
        steps: [{ key: 'a', type: 'set_priority', config: { priority: 'high' } }],
        edges: { trigger: 'a' },
      });

      const { data } = await creerTicket({ priority: 'low' });
      assert.equal((await relire(data.id)).priority, 'low');
    });

    test('les conditions filtrent : une autre catégorie ne déclenche pas', async () => {
      const autre = await prisma.category.create({ data: { name: 'Réseau' } });
      await creerWorkflow({
        nom: 'Réseau seulement',
        conditions: { categoryId: autre.id },
        steps: [{ key: 'a', type: 'set_priority', config: { priority: 'high' } }],
        edges: { trigger: 'a' },
      });

      const horsCible = await creerTicket({ priority: 'low' });
      assert.equal((await relire(horsCible.data.id)).priority, 'low', 'catégorie différente : rien');

      const cible = await creerTicket({ priority: 'low', categoryId: autre.id });
      assert.equal((await relire(cible.data.id)).priority, 'high', 'bonne catégorie : appliqué');
    });

    test('sur changement de statut', async () => {
      await creerWorkflow({
        nom: 'À la résolution',
        trigger: 'status_changed',
        conditions: { newStatus: 'resolved' },
        steps: [{ key: 'a', type: 'add_note', config: { body: 'Merci de votre patience.' } }],
        edges: { trigger: 'a' },
      });

      const { data } = await creerTicket({});
      assert.ok(!(await relire(data.id)).comments.some((c) => /Merci de votre patience/.test(c.body)));

      await api.patch(`/api/tickets/${data.id}`, { token: t.tech, body: { status: 'resolved' } });
      assert.ok(
        (await relire(data.id)).comments.some((c) => /Merci de votre patience/.test(c.body)),
        'le passage en résolu doit déclencher le workflow'
      );
    });

    test('deux workflows s’appliquent dans l’ordre de leur position', async () => {
      await creerWorkflow({
        nom: 'Premier',
        steps: [{ key: 'a', type: 'set_priority', config: { priority: 'low' } }],
        edges: { trigger: 'a' },
      });
      await creerWorkflow({
        nom: 'Second',
        steps: [{ key: 'a', type: 'set_priority', config: { priority: 'high' } }],
        edges: { trigger: 'a' },
      });

      const { data } = await creerTicket({ priority: 'medium' });
      assert.equal((await relire(data.id)).priority, 'high', 'le dernier appliqué doit l’emporter');
    });
  });

  describe('branches', () => {
    const workflowBranche = () =>
      creerWorkflow({
        nom: 'Aiguillage priorité',
        steps: [
          { key: 'si', type: 'condition', config: { field: 'priority', value: 'high' } },
          { key: 'oui', type: 'assign_team', config: { teamId: ctx.team.id } },
          { key: 'non', type: 'add_note', config: { body: 'Traitement standard.' } },
        ],
        edges: { trigger: 'si', si: { yes: 'oui', no: 'non' } },
      });

    test('la branche « oui » est prise quand la condition est vraie', async () => {
      await workflowBranche();
      const { data } = await creerTicket({ priority: 'high' });
      const ticket = await relire(data.id);
      assert.equal(ticket.teamId, ctx.team.id);
      assert.ok(!ticket.comments.some((c) => /Traitement standard/.test(c.body)), 'la branche « non » ne doit pas être prise');
    });

    test('la branche « non » est prise quand la condition est fausse', async () => {
      await workflowBranche();
      const { data } = await creerTicket({ priority: 'low' });
      const ticket = await relire(data.id);
      assert.equal(ticket.teamId, null, 'la branche « oui » ne doit pas être prise');
      assert.ok(ticket.comments.some((c) => /Traitement standard/.test(c.body)));
    });
  });

  describe('blocs d’attente', () => {
    test('wait_assigned : le ticket reste parqué, puis repart à l’assignation', async () => {
      const wf = await creerWorkflow({
        nom: 'Attente de prise en charge',
        steps: [
          { key: 'attente', type: 'wait_assigned', config: {} },
          { key: 'apres', type: 'set_priority', config: { priority: 'high' } },
        ],
        edges: { trigger: 'attente', attente: 'apres' },
      });

      const { data } = await creerTicket({ priority: 'low' });
      assert.equal((await relire(data.id)).priority, 'low', 'rien ne doit passer avant l’assignation');

      let run = await prisma.workflowRun.findFirst({ where: { ticketId: data.id, workflowId: wf.id } });
      assert.equal(run.status, 'running');
      assert.equal(run.nodeKey, 'attente', 'le ticket doit être parqué sur le bloc d’attente');

      await api.patch(`/api/tickets/${data.id}`, { token: t.tech, body: { assigneeId: ctx.tech.id } });

      assert.equal((await relire(data.id)).priority, 'high', 'la suite doit s’exécuter après l’assignation');
      run = await prisma.workflowRun.findUnique({ where: { id: run.id } });
      assert.equal(run.status, 'done');
      assert.equal(run.nodeKey, null);
    });

    test('wait_status : franchi seulement au statut attendu', async () => {
      const wf = await creerWorkflow({
        nom: 'Attente de résolution',
        steps: [
          { key: 'attente', type: 'wait_status', config: { status: 'resolved' } },
          { key: 'apres', type: 'add_note', config: { body: 'Enquête envoyée.' } },
        ],
        edges: { trigger: 'attente', attente: 'apres' },
      });

      const { data } = await creerTicket({});
      const note = async () => (await relire(data.id)).comments.some((c) => /Enquête envoyée/.test(c.body));

      await api.patch(`/api/tickets/${data.id}`, { token: t.tech, body: { status: 'in_progress' } });
      assert.equal(await note(), false, 'un autre statut ne doit pas franchir l’attente');

      await api.patch(`/api/tickets/${data.id}`, { token: t.tech, body: { status: 'resolved' } });
      assert.equal(await note(), true, 'le statut attendu doit franchir l’attente');

      const run = await prisma.workflowRun.findFirst({ where: { ticketId: data.id, workflowId: wf.id } });
      assert.equal(run.status, 'done');
    });
  });

  describe('garde-fous', () => {
    // Les deux déclencheurs ne se répètent pas de la même façon, et la
    // différence n'est écrite nulle part alors qu'elle change tout à la
    // conception d'un workflow.
    test('« statut changé » est réactif : il rejoue à chaque changement', async () => {
      const wf = await creerWorkflow({
        nom: 'À chaque changement',
        trigger: 'status_changed',
        steps: [{ key: 'a', type: 'add_note', config: { body: 'Bonjour.' } }],
        edges: { trigger: 'a' },
      });

      const { data } = await creerTicket({});
      for (const status of ['in_progress', 'waiting', 'resolved']) {
        await api.patch(`/api/tickets/${data.id}`, { token: t.tech, body: { status } });
      }

      const notes = (await relire(data.id)).comments.filter((c) => /^Bonjour\.$/.test(c.body));
      assert.equal(notes.length, 3, 'un par changement de statut : c’est une réaction, pas un parcours');
      assert.equal(
        await prisma.workflowRun.count({ where: { ticketId: data.id, workflowId: wf.id } }),
        0,
        'aucun parcours n’est mémorisé pour ce déclencheur'
      );
    });

    test('« ticket créé » est un parcours : un seul, repris et jamais redémarré', async () => {
      const wf = await creerWorkflow({
        nom: 'Parcours unique',
        steps: [
          { key: 'attente', type: 'wait_status', config: { status: 'resolved' } },
          { key: 'apres', type: 'add_note', config: { body: 'Fin du parcours.' } },
        ],
        edges: { trigger: 'attente', attente: 'apres' },
      });

      const { data } = await creerTicket({});
      // Plusieurs passages devant le bloc d'attente sans le franchir.
      for (const status of ['in_progress', 'waiting', 'in_progress', 'resolved', 'in_progress', 'resolved']) {
        await api.patch(`/api/tickets/${data.id}`, { token: t.tech, body: { status } });
      }

      const ticket = await relire(data.id);
      const notes = ticket.comments.filter((c) => /Fin du parcours/.test(c.body));
      assert.equal(notes.length, 1, 'le parcours ne se rejoue pas, même en repassant par le statut attendu');
      assert.equal(await prisma.workflowRun.count({ where: { ticketId: data.id, workflowId: wf.id } }), 1);
    });

    test('un graphe cyclique ne boucle pas indéfiniment', async () => {
      await creerWorkflow({
        nom: 'Boucle',
        steps: [
          { key: 'a', type: 'add_note', config: { body: 'Tour A' } },
          { key: 'b', type: 'add_note', config: { body: 'Tour B' } },
        ],
        edges: { trigger: 'a', a: 'b', b: 'a' }, // b renvoie vers a
      });

      const { data } = await creerTicket({});
      const ticket = await relire(data.id);
      assert.equal(ticket.comments.filter((c) => /Tour A/.test(c.body)).length, 1);
      assert.equal(ticket.comments.filter((c) => /Tour B/.test(c.body)).length, 1);
    });

    test('une action en échec n’interrompt pas la suite', async () => {
      await creerWorkflow({
        nom: 'Équipe inexistante',
        steps: [
          { key: 'a', type: 'assign_team', config: { teamId: 999999 } },
          { key: 'b', type: 'set_priority', config: { priority: 'high' } },
        ],
        edges: { trigger: 'a', a: 'b' },
      });

      const { data } = await creerTicket({ priority: 'low' });
      assert.equal((await relire(data.id)).priority, 'high', 'le bloc suivant doit s’exécuter malgré tout');
    });
  });

  describe('assignation par workflow', () => {
    test('assign_user sort le ticket de « Nouveau », comme une assignation manuelle', async () => {
      await creerWorkflow({
        nom: 'Assignation directe',
        steps: [{ key: 'a', type: 'assign_user', config: { userId: ctx.tech.id } }],
        edges: { trigger: 'a' },
      });

      const { data } = await creerTicket({});
      const ticket = await relire(data.id);
      assert.equal(ticket.assigneeId, ctx.tech.id);
      assert.equal(ticket.status, 'in_progress', 'un ticket assigné n’est plus « Nouveau »');
    });

    test('un demandeur ne peut pas être désigné comme assigné', async () => {
      await creerWorkflow({
        nom: 'Assignation invalide',
        steps: [{ key: 'a', type: 'assign_user', config: { userId: ctx.user.id } }],
        edges: { trigger: 'a' },
      });

      const { data } = await creerTicket({});
      assert.equal((await relire(data.id)).assigneeId, null, 'le rôle « utilisateur » ne peut pas recevoir un ticket');
    });
  });
});
