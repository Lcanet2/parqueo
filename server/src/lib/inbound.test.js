import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTicketId, stripQuotedReply, bareAddress } from './inbound.js';

test('extractTicketId reconnaît les sujets de réponse', () => {
  assert.equal(extractTicketId('Re: [Parqueo] Ticket #12 : mon PC ne démarre plus'), 12);
  assert.equal(extractTicketId('TR: [Parqueo] ticket #345'), 345);
  assert.equal(extractTicketId('Ticket#7'), 7);
});

test('extractTicketId renvoie null sans référence', () => {
  assert.equal(extractTicketId('Mon PC ne démarre plus'), null);
  assert.equal(extractTicketId('Commande de 3 écrans #compta'), null);
  assert.equal(extractTicketId(''), null);
});

test('stripQuotedReply coupe les citations françaises', () => {
  const mail = 'Merci, c\'est réglé !\n\nLe mar. 21 juil. 2026 à 10:04, Parqueo <no-reply@parqueo.local> a écrit :\n> Le statut du ticket…';
  assert.equal(stripQuotedReply(mail), 'Merci, c\'est réglé !');
});

test('stripQuotedReply coupe les citations anglaises et les lignes citées', () => {
  assert.equal(stripQuotedReply('OK pour moi\n\nOn Tue, Jul 21, 2026 someone wrote:\n> blah'), 'OK pour moi');
  assert.equal(stripQuotedReply('Réponse courte\n> ancien message'), 'Réponse courte');
});

test('stripQuotedReply garde un message sans citation intact', () => {
  assert.equal(stripQuotedReply('Bonjour,\nmon écran reste noir.'), 'Bonjour,\nmon écran reste noir.');
});

test('bareAddress extrait et normalise l\'adresse', () => {
  assert.equal(bareAddress('Parqueo <No-Reply@Parqueo.local>'), 'no-reply@parqueo.local');
  assert.equal(bareAddress('marie@exemple.fr'), 'marie@exemple.fr');
});

import { premierAuthResults, echecAuthentification } from './inbound.js';

test('premierAuthResults ne lit que l’en-tête du serveur de réception (le premier)', () => {
  const lignes = [
    { key: 'received', line: 'Received: from mx' },
    { key: 'authentication-results', line: 'Authentication-Results: mx.entreprise.fr;\r\n dmarc=fail header.from=entreprise.fr' },
    // Forgé par l'expéditeur : plus bas dans le message.
    { key: 'authentication-results', line: 'Authentication-Results: faux; dmarc=pass' },
  ];
  assert.equal(premierAuthResults(lignes), 'mx.entreprise.fr; dmarc=fail header.from=entreprise.fr');
  assert.equal(premierAuthResults([]), null);
  assert.equal(premierAuthResults(), null);
});

test('echecAuthentification rejette les usurpations constatées', () => {
  assert.match(echecAuthentification('mx; spf=pass; dkim=none; dmarc=fail action=quarantine'), /DMARC/);
  assert.match(echecAuthentification('spf=fail (sender IP is 1.2.3.4) smtp.mailfrom=x.fr; dkim=none; dmarc=none; compauth=fail reason=601'), /composite|SPF/);
  assert.match(echecAuthentification('mx; spf=fail smtp.mailfrom=x.fr; dkim=none'), /SPF/);
});

test('echecAuthentification laisse passer ce qui n’est pas un échec', () => {
  assert.equal(echecAuthentification(null), null);
  assert.equal(echecAuthentification('mx; spf=pass; dkim=pass; dmarc=pass'), null);
  assert.equal(echecAuthentification('mx; spf=none; dkim=none; dmarc=none'), null);
  // SPF cassé par un transfert mais signature DKIM valide : légitime.
  assert.equal(echecAuthentification('mx; spf=fail; dkim=pass header.d=x.fr'), null);
  assert.equal(echecAuthentification('compauth=pass reason=100'), null);
});

import { motifReponseAutomatique } from './inbound.js';

const h = (key, valeur) => ({ key, line: `${key}: ${valeur}` });

test('motifReponseAutomatique reconnaît répondeurs et avis de non-remise', () => {
  assert.match(motifReponseAutomatique([h('Auto-Submitted', 'auto-replied')]), /Auto-Submitted/);
  assert.match(motifReponseAutomatique([h('Auto-Submitted', 'auto-generated')]), /Auto-Submitted/);
  assert.match(motifReponseAutomatique([h('Precedence', 'bulk')]), /Precedence/);
  assert.match(motifReponseAutomatique([h('Precedence', 'auto_reply')]), /Precedence/);
  assert.ok(motifReponseAutomatique([h('X-Autoreply', 'yes')]));
  assert.ok(motifReponseAutomatique([], 'MAILER-DAEMON@mx.entreprise.fr'));
  assert.ok(motifReponseAutomatique([], 'Mail Delivery <postmaster@entreprise.fr>'));
  assert.ok(motifReponseAutomatique([h('Content-Type', 'multipart/report; report-type=delivery-status')]));
});

test('motifReponseAutomatique laisse passer un message écrit par une personne', () => {
  assert.equal(motifReponseAutomatique(), null);
  assert.equal(motifReponseAutomatique([h('Auto-Submitted', 'no')], 'marie@entreprise.fr'), null);
  assert.equal(motifReponseAutomatique([h('Precedence', 'normal')]), null);
  assert.equal(motifReponseAutomatique([h('Content-Type', 'text/plain; charset=utf-8')]), null);
});
