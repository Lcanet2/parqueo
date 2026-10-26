import path from 'node:path';
import fs from 'node:fs/promises';

// Supprime les fichiers d'une liste de pièces jointes. Un fichier déjà absent
// n'est pas une erreur : la ligne en base fait foi.
export async function effacerFichiers(attachments) {
  for (const a of attachments) {
    try {
      await fs.unlink(path.resolve(a.storedPath));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`[pièces jointes] ${a.storedPath} :`, err.message);
    }
  }
}
