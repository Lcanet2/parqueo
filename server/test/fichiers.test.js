import './setup.js';
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, resetDb, seedBasics, login, disconnect, prisma } from './helpers.js';
import { handleIncomingEmail } from '../src/services/mailbox.js';

let api, ctx, t, ticketId;

before(async () => {
  api = await startServer();
  await resetDb();
  ctx = await seedBasics();
  t = { admin: await login(api, ctx.admin.email), user: await login(api, ctx.user.email) };
  const c = await api.post('/api/tickets', {
    token: t.user,
    body: { title: 'PJ', description: 'x', categoryId: ctx.category.id },
  });
  ticketId = c.data.id;
});
after(async () => {
  await api.close();
  await disconnect();
});

async function televerser(nom, contenu = 'contenu') {
  const fd = new FormData();
  fd.append('file', new Blob([contenu]), nom);
  const res = await fetch(`${api.base}/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.user}` },
    body: fd,
  });
  const txt = await res.text();
  let data = null;
  try {
    data = JSON.parse(txt);
  } catch {
    data = txt;
  }
  return { status: res.status, data };
}

const NUL = String.fromCharCode(0);

describe('téléversement de pièces jointes', () => {
  test('un nom avec traversée de chemin n’écrit pas hors de uploads/', async () => {
    const r = await televerser('../../../../tmp/evil.txt', 'charge');
    if (r.status === 201) {
      const chemin = (await prisma.attachment.findUnique({ where: { id: r.data.id } })).storedPath;
      assert.ok(
        path.resolve(chemin).startsWith(path.resolve('uploads')),
        `écrit hors de uploads/ : ${chemin}`
      );
    }
    assert.ok(!fs.existsSync('/tmp/evil.txt'), 'fichier créé dans /tmp');
  });

  test('un nom avec octet nul ne se retrouve pas sur le disque', async () => {
    const r = await televerser(`innocent.txt${NUL}.sh`, 'x');
    if (r.status === 201) {
      const a = await prisma.attachment.findUnique({ where: { id: r.data.id } });
      assert.ok(!a.storedPath.includes(NUL), `octet nul dans le chemin : ${JSON.stringify(a.storedPath)}`);
    }
  });

  test('une extension hors liste blanche est refusée', async () => {
    for (const nom of ['virus.exe', 'script.sh', 'page.html', 'vecteur.svg', 'archive.tar', 'sansextension']) {
      assert.equal((await televerser(nom, 'x')).status, 400, `${nom} accepté`);
    }
  });

  test('une double extension est jugée sur la dernière', async () => {
    assert.equal((await televerser('rapport.pdf.exe', 'x')).status, 400);
    assert.equal((await televerser('rapport.exe.pdf', 'x')).status, 201);
  });

  test('un fichier au-delà de 10 Mo est refusé', async () => {
    const r = await televerser('gros.pdf', 'A'.repeat(11 * 1024 * 1024));
    assert.equal(r.status, 400, `fichier de 11 Mo accepté (${r.status})`);
  });

  test('le nom sur disque est un UUID, jamais celui fourni', async () => {
    const r = await televerser('mon rapport confidentiel.pdf', 'x');
    assert.equal(r.status, 201);
    const a = await prisma.attachment.findUnique({ where: { id: r.data.id } });
    assert.match(path.basename(a.storedPath), /^[0-9a-f-]{36}\.pdf$/i, `nom sur disque : ${a.storedPath}`);
    assert.equal(a.filename, 'mon rapport confidentiel.pdf');
  });

  test('un nom piégé ne casse pas l’en-tête de téléchargement', async () => {
    const r = await televerser('normal.pdf', 'x');
    const piege = ['a.pdf"', 'X-Injecte: oui', ''].join('\r\n');
    await prisma.attachment.update({ where: { id: r.data.id }, data: { filename: piege } });
    const res = await fetch(`${api.base}/api/tickets/${ticketId}/attachments/${r.data.id}`, {
      headers: { Authorization: `Bearer ${t.user}` },
    });
    assert.equal(res.headers.get('x-injecte'), null, 'en-tête injecté');
  });

  test('un envoi vers un ticket interdit ou inexistant ne laisse aucun fichier', async () => {
    const prive = await prisma.ticket.create({
      data: { title: 'Privé', description: 'x', categoryId: ctx.category.id, authorId: ctx.admin.id },
    });
    const fichiers = () => fs.readdirSync('uploads').filter((f) => f !== '.gitkeep' && f !== 'avatars').length;
    const avant = fichiers();
    for (const cible of [prive.id, 999999]) {
      const fd = new FormData();
      fd.append('file', new Blob(['intrus']), 'intrus.txt');
      const res = await fetch(`${api.base}/api/tickets/${cible}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.user}` },
        body: fd,
      });
      assert.equal(res.status, 404);
    }
    assert.equal(fichiers(), avant, 'fichier orphelin laissé sur le disque');
  });

  test('le contenu est servi en pièce jointe, jamais rendu', async () => {
    const r = await televerser('piege.txt', '<script>alert(1)</script>');
    const res = await fetch(`${api.base}/api/tickets/${ticketId}/attachments/${r.data.id}`, {
      headers: { Authorization: `Bearer ${t.user}` },
    });
    assert.match(res.headers.get('content-disposition') ?? '', /attachment/);
  });

  test('un fichier absent du disque ne fait pas tomber le serveur', async () => {
    const a = await prisma.attachment.create({
      data: { ticketId, filename: 'fantome.pdf', storedPath: 'uploads/nexistepas.pdf', size: 1, uploadedBy: ctx.user.id },
    });
    const res = await fetch(`${api.base}/api/tickets/${ticketId}/attachments/${a.id}`, {
      headers: { Authorization: `Bearer ${t.user}` },
    });
    assert.ok(res.status >= 400, `statut ${res.status}`);
    assert.equal((await api.get('/api/health')).status, 200, 'serveur toujours debout');
  });
});

describe('collecteur email', () => {
  test('un expéditeur inconnu ne crée pas de ticket', async () => {
    const r = await handleIncomingEmail({ fromAddress: 'inconnu@dehors.fr', subject: 'Panne', text: 'x' });
    assert.equal(r.action, 'ignored');
  });

  test('l’adresse système est ignorée (anti-boucle)', async () => {
    process.env.SMTP_FROM = 'Parqueo <no-reply@test.local>';
    const r = await handleIncomingEmail({ fromAddress: 'no-reply@test.local', subject: 'Ticket #1', text: 'x' });
    assert.equal(r.action, 'ignored');
    delete process.env.SMTP_FROM;
  });

  test('une usurpation d’adresse crée un ticket au nom de la victime', async () => {
    const r = await handleIncomingEmail({ fromAddress: `Faux <${ctx.user.email}>`, subject: 'Usurpé', text: 'x' });
    assert.equal(r.action, 'ticket');
    assert.equal((await prisma.ticket.findUnique({ where: { id: r.ticketId } })).authorId, ctx.user.id);
  });

  test('une réponse sur le ticket d’un tiers devient-elle un commentaire ?', async () => {
    const autre = await prisma.user.create({
      data: { email: 'tiers@test.local', name: 'Tiers', role: 'user' },
    });
    const prive = await prisma.ticket.create({
      data: { title: 'Privé', description: 'secret', categoryId: ctx.category.id, authorId: autre.id },
    });
    const r = await handleIncomingEmail({
      fromAddress: ctx.user.email,
      subject: `Re: [Parqueo] Ticket #${prive.id}`,
      text: 'je m’invite',
    });
    assert.notEqual(r.action, 'comment', `commentaire injecté dans le ticket #${prive.id} d’un tiers`);
  });

  test('une usurpation constatée par le serveur de réception est rejetée', async () => {
    const avant = await prisma.ticket.count();
    const r = await handleIncomingEmail({
      fromAddress: ctx.admin.email,
      subject: 'Merci de renvoyer vos identifiants',
      text: 'x',
      authResults: 'mx.test.local; spf=fail smtp.mailfrom=pirate.net; dkim=none; dmarc=fail header.from=test.local',
    });
    assert.equal(r.action, 'ignored');
    assert.match(r.reason, /non authentifié/);
    assert.equal(await prisma.ticket.count(), avant);
  });

  test('une adresse d’admin n’ouvre pas tous les tickets par email', async () => {
    const tiers = await prisma.user.create({ data: { email: 'tiers2@test.local', name: 'Tiers 2', role: 'user' } });
    const prive = await prisma.ticket.create({
      data: { title: 'Privé', description: 'secret', categoryId: ctx.category.id, authorId: tiers.id },
    });
    const r = await handleIncomingEmail({
      fromAddress: ctx.admin.email,
      subject: `Re: [Parqueo] Ticket #${prive.id}`,
      text: 'Cliquez ici pour réinitialiser votre mot de passe',
    });
    assert.notEqual(r.action, 'comment');
    assert.equal(await prisma.ticketComment.count({ where: { ticketId: prive.id } }), 0);
  });

  test('le demandeur et l’assigné répondent toujours par email', async () => {
    const tk = await prisma.ticket.create({
      data: {
        title: 'Imprimante',
        description: 'bourrage',
        categoryId: ctx.category.id,
        authorId: ctx.user.id,
        assigneeId: ctx.admin.id,
      },
    });
    for (const email of [ctx.user.email, ctx.admin.email]) {
      const r = await handleIncomingEmail({
        fromAddress: email,
        subject: `Re: [Parqueo] Ticket #${tk.id}`,
        text: 'réponse',
        authResults: 'mx.test.local; spf=pass; dkim=pass; dmarc=pass',
      });
      assert.equal(r.action, 'comment', email);
    }
  });

  test('une absence automatique ne commente ni ne crée de ticket (anti-boucle)', async () => {
    const tk = await prisma.ticket.create({
      data: { title: 'Wifi', description: 'coupé', categoryId: ctx.category.id, authorId: ctx.user.id },
    });
    const avant = await prisma.ticket.count();
    for (const subject of [`Réponse automatique : Re: [Parqueo] Ticket #${tk.id}`, 'Absent du bureau']) {
      const r = await handleIncomingEmail({
        fromAddress: ctx.user.email,
        subject,
        text: 'Je suis absent jusqu’au 15.',
        headerLines: [{ key: 'auto-submitted', line: 'Auto-Submitted: auto-replied' }],
      });
      assert.equal(r.action, 'ignored', subject);
    }
    assert.equal(await prisma.ticketComment.count({ where: { ticketId: tk.id } }), 0);
    assert.equal(await prisma.ticket.count(), avant);
  });

  test('répondre par email à une note interne reste interne', async () => {
    const tk = await prisma.ticket.create({
      data: { title: 'Serveur', description: 'lent', categoryId: ctx.category.id, authorId: ctx.user.id, assigneeId: ctx.admin.id },
    });
    const sujet = `Re: [Parqueo] Ticket #${tk.id} : note interne de Technicien`;
    const r = await handleIncomingEmail({
      fromAddress: ctx.admin.email,
      subject: sujet,
      text: 'Vu, je redémarre ce soir',
      attachments: [{ filename: 'diag.txt', content: Buffer.from('logs internes') }],
    });
    assert.equal(r.action, 'comment');
    const c = await prisma.ticketComment.findFirst({ where: { ticketId: tk.id } });
    assert.equal(c.internal, true, 'réponse à une note interne publiée');
    assert.equal(await prisma.attachment.count({ where: { ticketId: tk.id } }), 0, 'pièce jointe publiée');

    // Le même sujet envoyé par le demandeur ne fabrique pas de note interne.
    await handleIncomingEmail({ fromAddress: ctx.user.email, subject: sujet, text: 'et moi ?' });
    const publique = await prisma.ticketComment.findFirst({ where: { ticketId: tk.id, authorId: ctx.user.id } });
    assert.equal(publique.internal, false);
  });

  test('un sujet vide donne un titre par défaut', async () => {
    const r = await handleIncomingEmail({ fromAddress: ctx.user.email, subject: '', text: 'sans objet' });
    const tk = await prisma.ticket.findUnique({ where: { id: r.ticketId } });
    assert.equal(tk.title, 'Demande reçue par email');
  });

  test('un email démesuré est borné', async () => {
    const r = await handleIncomingEmail({ fromAddress: ctx.user.email, subject: 'Gros', text: 'X'.repeat(500000) });
    const tk = await prisma.ticket.findUnique({ where: { id: r.ticketId } });
    assert.ok(tk.description.length < 100000, `description de ${tk.description.length} caractères stockée`);
  });
});
