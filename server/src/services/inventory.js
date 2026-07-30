import { prisma } from '../lib/prisma.js';
import { normalizeInventory, updateFields } from '../lib/inventory.js';

// Service d'ingestion d'inventaire : point d'entrée unique partagé par
// l'endpoint normalisé (POST /api/inventory), l'adaptateur agent GLPI et le
// connecteur Intune. Il normalise un rapport, retrouve l'actif par uuid puis
// numéro de série, le crée ou le rafraîchit (sans écraser les champs gérés par
// l'admin), et remplace la liste des logiciels installés.

// Résout l'utilisateur Parqueo correspondant à une adresse (rapprochement email).
async function findUserByEmail(email) {
  if (!email) return null;
  return prisma.user.findUnique({ where: { email } });
}

// Ingère un rapport (déjà au format normalisé attendu par normalizeInventory).
// source : agent | intune | scan. Renvoie { action, asset } ou { error }.
export async function ingest(payload, { source = 'agent' } = {}) {
  const norm = normalizeInventory(payload, { source });
  if (norm.error) return { error: norm.error };

  const { identity, data, software, assignedUserEmail, lastSeenAt } = norm;
  const seenAt = lastSeenAt ?? new Date();

  // Dédup : uuid d'abord (le plus stable), puis numéro de série.
  let existing = identity.uuid
    ? await prisma.asset.findUnique({ where: { uuid: identity.uuid } })
    : null;
  if (!existing && identity.serial) {
    existing = await prisma.asset.findUnique({ where: { serial: identity.serial } });
  }

  let asset;
  if (existing) {
    asset = await prisma.asset.update({
      where: { id: existing.id },
      data: { ...updateFields(data), lastSeenAt: seenAt },
    });
  } else {
    // À la création seulement : nom depuis l'inventaire et rapprochement de
    // l'utilisateur assigné par email (Intune). Les rapports suivants ne
    // toucheront plus ni au nom ni à l'affectation.
    const assignee = await findUserByEmail(assignedUserEmail);
    asset = await prisma.asset.create({
      data: {
        ...data,
        lastSeenAt: seenAt,
        assignedUserId: assignee?.id ?? null,
      },
    });
  }

  // Logiciels : remplacement complet quand le rapport en fournit (état courant
  // de la machine). Absent du rapport → on ne touche pas à l'existant.
  if (software !== undefined) {
    // Chaque logiciel est rattaché à son entrée de catalogue (créée au besoin),
    // puis lié à l'actif avec sa version.
    const rows = [];
    for (const s of software) {
      const publisher = s.publisher ?? '';
      const cat = await prisma.software.upsert({
        where: { name_publisher: { name: s.name, publisher } },
        update: {},
        create: { name: s.name, publisher },
      });
      rows.push({ assetId: asset.id, softwareId: cat.id, version: s.version });
    }
    await prisma.$transaction([
      prisma.softwareInstall.deleteMany({ where: { assetId: asset.id } }),
      ...(rows.length ? [prisma.softwareInstall.createMany({ data: rows })] : []),
    ]);
  }

  return { action: existing ? 'updated' : 'created', asset };
}
