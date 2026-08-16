import { Router } from '../lib/router.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { text, tropLong, LIMITS } from '../lib/input.js';

// Premier démarrage : création du compte administrateur depuis l'interface,
// à la place d'un compte livré avec un mot de passe connu de tous.
//
// La porte est ouverte tant que la base ne contient AUCUN utilisateur, et se
// referme définitivement à la création du premier. Le critère est bien « aucun
// utilisateur » et non « aucun administrateur » : si des comptes existaient
// déjà, rouvrir l'installation laisserait n'importe qui se déclarer admin sur
// une base en service.

const router = Router();

// Identifiant arbitraire mais stable, propre à ce verrou.
const VERROU_INSTALLATION = 4200240001n;

router.get('/status', async (req, res) => {
  const comptes = await prisma.user.count();
  res.json({ needsSetup: comptes === 0 });
});

router.post('/', async (req, res) => {
  const email = text(req.body.email).toLowerCase();
  const name = text(req.body.name);
  const { password } = req.body;

  if (!email || !name || typeof password !== 'string') {
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  }
  const trop = tropLong({ Nom: [name, LIMITS.nom], Email: [email, LIMITS.libelle] });
  if (trop) return res.status(400).json({ error: trop });
  if (password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let admin;
  try {
    admin = await prisma.$transaction(async (tx) => {
      // Verrou consultatif tenu jusqu'à la fin de la transaction : deux appels
      // simultanés sur une base vide verraient sinon tous les deux « aucun
      // utilisateur » et créeraient deux administrateurs.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_INSTALLATION})`;

      if ((await tx.user.count()) > 0) {
        throw Object.assign(new Error('déjà installé'), { dejaInstalle: true });
      }

      // Une catégorie est indispensable pour ouvrir un ticket, et une équipe
      // pour affecter : sur une base vierge, l'installation les pose.
      if ((await tx.category.count()) === 0) {
        await tx.category.create({ data: { name: 'Matériel' } });
      }
      if ((await tx.team.count()) === 0) {
        await tx.team.create({ data: { name: 'Support IT' } });
      }

      return tx.user.create({
        data: { email, name, passwordHash, role: 'admin' },
      });
    });
  } catch (err) {
    if (err.dejaInstalle) {
      return res.status(409).json({ error: 'Parqueo est déjà installé' });
    }
    throw err;
  }

  // Jeton renvoyé directement : l'administrateur entre dans l'application sans
  // repasser par l'écran de connexion qu'il vient de se créer.
  const token = jwt.sign(
    { sub: admin.id, role: admin.role, teamId: admin.teamId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  const { passwordHash: _, ...publicUser } = admin;
  res.status(201).json({ token, user: publicUser });
});

export default router;
