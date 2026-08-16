import { readFileSync } from 'node:fs';
import { Router } from '../lib/router.js';
import { authRequired } from '../middleware/auth.js';

// Version et licence de l'instance.
//
// Derrière authentification volontairement : annoncer publiquement le numéro de
// version d'un logiciel auto-hébergé revient à indiquer à un visiteur non
// authentifié quelles failles connues essayer. La sonde /api/health, elle, reste
// publique — elle ne dit rien d'autre que « le service répond ».
//
// La version est lue une seule fois, au chargement du module : elle ne change
// pas en cours d'exécution, et le conteneur est remplacé à chaque mise à jour.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const router = Router();

router.get('/', authRequired, (req, res) => {
  res.json({ version, license: 'AGPL-3.0' });
});

export default router;
