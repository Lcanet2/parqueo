// Rattachement d'une identité Microsoft Entra à un compte Parqueo — logique pure,
// testable sans Entra ni base.
//
// Jusqu'à la 0.3.7, le compte était retrouvé par l'adresse email du jeton
// d'identité. Or la claim `email` d'Entra n'est pas vérifiée par Microsoft
// (attaque dite « nOAuth ») : un invité dont l'annuaire d'origine déclare
// l'adresse d'un administrateur Parqueo ouvrait le compte de cet administrateur.
//
// Désormais :
//   - le compte est désigné par `tid:oid`, identifiant immuable attribué par
//     Entra, enregistré à la première connexion ;
//   - l'email ne sert qu'une fois, pour rattacher un compte existant, et
//     seulement pour un membre de l'annuaire (dont l'adresse est gérée par
//     l'administration), jamais pour un invité ;
//   - un compte déjà rattaché ne change jamais d'identité.

// Extrait l'identité d'un jeton d'identité vérifié. null si tid ou oid manque.
export function identiteEntra(claims = {}) {
  const tid = typeof claims.tid === 'string' ? claims.tid : '';
  const oid = typeof claims.oid === 'string' ? claims.oid : '';
  if (!tid || !oid) return null;

  const email = String(claims.email || claims.preferred_username || '').trim().toLowerCase();

  // `idp` n'est présent que si le compte s'est authentifié ailleurs que dans
  // l'annuaire émetteur : invité d'un autre annuaire (sts.windows.net/<son tid>)
  // ou compte Microsoft personnel (live.com).
  const idp = typeof claims.idp === 'string' ? claims.idp : '';
  const invite = Boolean(idp) && !idp.includes(tid);

  return { subject: `${tid}:${oid}`, email, invite };
}

export const REFUS = {
  dejaLie: 'Cette adresse est déjà liée à une autre identité Microsoft',
  invite:
    'Un compte Parqueo existe déjà avec cette adresse : un compte invité ne peut pas s’y rattacher. ' +
    'Demandez à un administrateur.',
};

// parSujet : compte déjà rattaché à cette identité ; parEmail : compte portant
// la même adresse. Renvoie { action: 'ouvrir' | 'rattacher' | 'creer' | 'refuser', ... }.
export function decisionRattachement({ identite, parSujet, parEmail }) {
  if (parSujet) return { action: 'ouvrir', user: parSujet };
  if (!parEmail) return { action: 'creer' };
  if (parEmail.ssoSubject && parEmail.ssoSubject !== identite.subject) {
    return { action: 'refuser', raison: REFUS.dejaLie };
  }
  if (identite.invite) return { action: 'refuser', raison: REFUS.invite };
  return { action: 'rattacher', user: parEmail };
}
