import { Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { ingest } from '../services/inventory.js';
import { glpiToInventory } from '../lib/inventory.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { intuneEnabled, syncIntune } from '../services/intune.js';
import { snmpEnabled, scanSnmp } from '../services/snmp.js';

// Ingestion d'inventaire. Deux familles de routes, deux authentifications :
//   - /  et /glpi  : appelées par des agents/scripts → token partagé
//     (INVENTORY_TOKEN), désactivées tant qu'il n'est pas défini (comme SSO/IMAP) ;
//   - /intune/sync : déclenchée par un admin depuis l'UI → JWT + rôle admin.

const router = Router();

export function inventoryEnabled() {
  return Boolean(process.env.INVENTORY_TOKEN);
}

// Comparaison à temps constant du token présenté (en-tête X-Parqueo-Token, ou
// Authorization: Bearer). Middleware appliqué route par route (pas globalement),
// pour que la sync Intune reste sur du JWT.
function requireInventoryToken(req, res, next) {
  if (!inventoryEnabled()) return res.status(404).json({ error: 'Ingestion d’inventaire non configurée' });
  const expected = process.env.INVENTORY_TOKEN || '';
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const provided = req.get('X-Parqueo-Token') || bearer || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Token d’inventaire invalide' });
  }
  next();
}

// POST /api/inventory — format normalisé Parqueo (script, notre agent, tests).
router.post('/', express.json({ limit: '5mb' }), requireInventoryToken, async (req, res) => {
  const result = await ingest(req.body ?? {}, { source: 'agent' });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(result.action === 'created' ? 201 : 200).json(result);
});

// POST /api/inventory/glpi — format natif de l'agent GLPI. Le corps peut être du
// JSON brut ou compressé (zlib/gzip selon la config de l'agent) : on lit en brut
// et on décompresse au besoin avant de mapper vers le format normalisé.
function inflateBody(buf) {
  if (!buf?.length) return '';
  if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf).toString('utf8'); // gzip
  if (buf[0] === 0x78) return zlib.inflateSync(buf).toString('utf8'); // zlib/deflate
  return buf.toString('utf8'); // déjà du texte
}

router.post(
  '/glpi',
  express.raw({ type: () => true, limit: '15mb' }),
  requireInventoryToken,
  async (req, res) => {
    let payload;
    try {
      payload = Buffer.isBuffer(req.body) ? JSON.parse(inflateBody(req.body)) : req.body;
    } catch {
      return res.status(400).json({ error: 'Corps d’inventaire illisible (JSON attendu)' });
    }
    const result = await ingest(glpiToInventory(payload ?? {}), { source: 'agent' });
    if (result.error) return res.status(400).json({ error: result.error });
    // L'agent GLPI attend juste un 200 ; on renvoie un accusé minimal.
    res.status(200).json({ status: 'ok', action: result.action });
  }
);

// POST /api/inventory/intune/sync — synchronisation à la demande (admin).
router.post('/intune/sync', express.json(), authRequired, requireRole('admin'), async (req, res) => {
  if (!intuneEnabled()) return res.status(404).json({ error: 'Connecteur Intune non configuré' });
  try {
    const summary = await syncIntune();
    res.json(summary);
  } catch (err) {
    res.status(502).json({ error: `Synchronisation Intune échouée : ${err.message}` });
  }
});

// POST /api/inventory/snmp/scan — scan réseau à la demande (admin).
router.post('/snmp/scan', express.json(), authRequired, requireRole('admin'), async (req, res) => {
  if (!snmpEnabled()) return res.status(404).json({ error: 'Scan SNMP non configuré' });
  try {
    const summary = await scanSnmp();
    res.json(summary);
  } catch (err) {
    res.status(502).json({ error: `Scan SNMP échoué : ${err.message}` });
  }
});

export default router;
