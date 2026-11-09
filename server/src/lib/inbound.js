// Helpers purs du collecteur email — extraits pour être testables sans IMAP.

// Détecte une réponse à un ticket existant via le sujet, p. ex.
// « Re: [Parqueo] Ticket #12 : mon PC ne démarre plus ».
export function extractTicketId(subject = '') {
  const m = subject.match(/ticket\s*#(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Retire la citation du message précédent d'une réponse email.
// Heuristique volontairement simple : on coupe au premier marqueur connu.
const QUOTE_MARKERS = [
  /^\s*Le .{5,120} a écrit\s?:/m,
  /^\s*On .{5,120} wrote\s?:/m,
  /^\s*-{2,}\s*Message d'origine\s*-{2,}/im,
  /^\s*-{2,}\s*Original Message\s*-{2,}/im,
  /^\s*_{5,}\s*$/m,
  /^\s*De\s?: .+@.+$/m,
  /^\s*From\s?: .+@.+$/m,
  /^>/m,
];

export function stripQuotedReply(text = '') {
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = text.match(re);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut).trim();
}

// Extrait l'adresse seule d'un champ From, p. ex. « Parqueo <no-reply@x.fr> ».
export function bareAddress(from = '') {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

// --- Réponses automatiques ---------------------------------------------------
//
// Deux absences automatiques (demandeur et technicien) se renvoyaient la balle
// à travers Parqueo : la réponse automatique devenait un commentaire, le
// commentaire une notification, la notification une nouvelle réponse
// automatique… sans fin. Un message produit par une machine n'engage personne :
// il n'ouvre ni ne commente aucun ticket.
//
// Signaux reconnus :
//   - Auto-Submitted (RFC 3834) autre que « no » : auto-replied, auto-generated…
//     C'est ce que posent Exchange, Gmail et la plupart des répondeurs ;
//   - Precedence bulk / junk / list / auto_reply (convention historique) ;
//   - X-Autoreply, X-Autorespond (répondeurs plus anciens) ;
//   - les avis de non-remise (mailer-daemon, postmaster, rapport DSN).

const PRECEDENCE_AUTO = /^(bulk|junk|list|auto[_-]reply)$/i;
const EXPEDITEUR_AUTO = /^(mailer-daemon|postmaster)@/i;

// Valeur (sans le nom) du premier en-tête `nom` parmi les headerLines de
// mailparser, ou null.
function entete(headerLines, nom) {
  const ligne = headerLines.find((h) => h?.key?.toLowerCase() === nom);
  if (!ligne) return null;
  const i = ligne.line.indexOf(':');
  return (i >= 0 ? ligne.line.slice(i + 1) : ligne.line).trim();
}

// Motif si le message vient d'un répondeur ou d'un serveur de messagerie,
// sinon null.
export function motifReponseAutomatique(headerLines = [], fromAddress = '') {
  const auto = entete(headerLines, 'auto-submitted');
  if (auto && !/^no\b/i.test(auto)) return `Auto-Submitted: ${auto}`;

  const precedence = entete(headerLines, 'precedence');
  if (precedence && PRECEDENCE_AUTO.test(precedence)) return `Precedence: ${precedence}`;

  if (entete(headerLines, 'x-autoreply') !== null || entete(headerLines, 'x-autorespond') !== null) {
    return 'répondeur automatique';
  }

  if (EXPEDITEUR_AUTO.test(bareAddress(fromAddress))) return 'avis de non-remise';
  if (/multipart\/report/i.test(entete(headerLines, 'content-type') ?? '')) return 'avis de non-remise';

  return null;
}

// --- Authentification de l'expéditeur ---------------------------------------
//
// L'adresse From d'un email se falsifie sans effort. Le serveur de réception
// (Microsoft 365, Google, Postfix + OpenDMARC…) vérifie SPF, DKIM et DMARC et
// consigne son verdict dans un en-tête Authentication-Results, ajouté EN TÊTE
// du message : un en-tête forgé par l'expéditeur arrive forcément en dessous.
// On ne lit donc que le premier.

// Valeur du premier en-tête Authentication-Results (headerLines de mailparser,
// dans l'ordre du message), ou null.
export function premierAuthResults(headerLines = []) {
  const ligne = headerLines.find((h) => h?.key?.toLowerCase() === 'authentication-results');
  if (!ligne) return null;
  const i = ligne.line.indexOf(':');
  return (i >= 0 ? ligne.line.slice(i + 1) : ligne.line).replace(/\s+/g, ' ').trim();
}

// Motif du rejet si le serveur de réception a conclu à une usurpation, sinon
// null. Seul un échec explicite est rejeté : un serveur qui ne vérifie rien
// (aucun en-tête, ou « none ») ne doit pas bloquer la boîte du support.
export function echecAuthentification(authResults) {
  if (!authResults) return null;
  const v = authResults.toLowerCase();
  if (/\bdmarc=fail\b/.test(v)) return 'DMARC en échec';
  // Microsoft 365 : authentification composite, y compris sans DMARC publié.
  if (/\bcompauth=fail\b/.test(v)) return 'authentification composite en échec';
  if (/\bspf=fail\b/.test(v) && !/\bdkim=pass\b/.test(v)) return 'SPF en échec sans signature DKIM valide';
  return null;
}
