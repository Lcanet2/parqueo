import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// sessionStorage minimal : le client tourne sous node --test, sans navigateur.
const magasin = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (magasin.has(k) ? magasin.get(k) : null),
  setItem: (k, v) => magasin.set(k, String(v)),
  removeItem: (k) => magasin.delete(k),
};

const { memoriserRetour, lireRetour, oublierRetour } = await import('../src/lib/retour.js');

beforeEach(() => magasin.clear());

test('la page demandée est rouverte après connexion, puis oubliée', () => {
  memoriserRetour('/tickets/12');
  assert.equal(lireRetour(), '/tickets/12');
  assert.equal(lireRetour(), '/tickets/12', 'lecture répétable (double rendu StrictMode)');
  oublierRetour();
  assert.equal(lireRetour(), null);
});

test('ni l’accueil, ni la connexion, ni un autre site ne sont mémorisés', () => {
  for (const chemin of ['/', '/login', '//pirate.example/x', 'https://pirate.example', '', null]) {
    memoriserRetour(chemin);
    assert.equal(lireRetour(), null, String(chemin));
  }
});

test('une valeur externe glissée dans le stockage est ignorée', () => {
  sessionStorage.setItem('parqueo:apres-connexion', '//pirate.example');
  assert.equal(lireRetour(), null);
});

test('sans stockage disponible, rien ne casse', () => {
  const sauve = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); }, removeItem() { throw new Error('bloqué'); } };
  try {
    memoriserRetour('/tickets/1');
    assert.equal(lireRetour(), null);
    oublierRetour();
  } finally {
    globalThis.sessionStorage = sauve;
  }
});
