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
