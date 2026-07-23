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
