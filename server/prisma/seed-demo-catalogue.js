// Complète le jeu de démonstration de `seed-demo.js` avec ce qu'il ne crée pas :
// formulaires du catalogue, articles d'aide, logiciels installés.
//
//   node prisma/seed-demo-catalogue.js
//
// Idempotent : relançable sans dupliquer.
//
// Ce fichier vit dans le dépôt du logiciel, et non dans celui de la
// documentation, pour deux raisons : il est embarqué dans l'image Docker — donc
// utilisable par l'instance de démonstration publique, qui n'a pas les sources —
// et le catalogue qu'il décrit fait partie du produit, pas de sa documentation.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categorie = async (name) =>
  (await prisma.category.findFirst({ where: { name } })) ??
  (await prisma.category.create({ data: { name } }));

// --- Formulaires du catalogue ---

const FORMULAIRES = [
  {
    name: 'Demande d’accès à une application',
    description: 'Ouvrir un accès à un logiciel métier pour un collaborateur.',
    categorie: 'Accès & comptes',
    priority: 'medium',
    fields: [
      { label: 'Application concernée', type: 'select', required: true, options: ['CRM', 'Paie', 'Comptabilité', 'GED'] },
      { label: 'Collaborateur concerné', type: 'text', required: true },
      { label: 'Niveau d’accès souhaité', type: 'select', required: true, options: ['Lecture seule', 'Utilisateur', 'Administrateur'] },
      { label: 'Date d’effet souhaitée', type: 'date', required: false },
      { label: 'Justification', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Demande de matériel',
    description: 'Commander un poste, un écran, un casque ou un périphérique.',
    categorie: 'Matériel',
    priority: 'medium',
    fields: [
      { label: 'Type de matériel', type: 'select', required: true, options: ['Ordinateur portable', 'Écran', 'Station d’accueil', 'Casque', 'Téléphone'] },
      { label: 'Bénéficiaire', type: 'text', required: true },
      { label: 'Remplacement d’un matériel existant', type: 'checkbox', required: false },
      { label: 'Précisions', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Arrivée d’un collaborateur',
    description: 'Préparer poste, comptes et accès avant le premier jour.',
    categorie: 'Accès & comptes',
    priority: 'high',
    fields: [
      { label: 'Nom et prénom', type: 'text', required: true },
      { label: 'Service', type: 'select', required: true, options: ['Direction', 'Commerce', 'Production', 'Administratif'] },
      { label: 'Date d’arrivée', type: 'date', required: true },
      { label: 'Matériel à prévoir', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Départ d’un collaborateur',
    description: 'Clôturer les accès et récupérer le matériel.',
    categorie: 'Accès & comptes',
    priority: 'high',
    fields: [
      { label: 'Nom et prénom', type: 'text', required: true },
      { label: 'Dernier jour travaillé', type: 'date', required: true },
      { label: 'Matériel à récupérer', type: 'textarea', required: false },
    ],
  },
];

// --- Base de connaissances ---

const ARTICLES = [
  {
    title: 'Réinitialiser son mot de passe Windows',
    categorie: 'Accès & comptes',
    body: `Vous pouvez changer votre mot de passe sans passer par le support.

1. Appuyez sur Ctrl + Alt + Suppr.
2. Choisissez « Modifier un mot de passe ».
3. Saisissez l'ancien mot de passe, puis deux fois le nouveau.

Le mot de passe doit faire au moins 12 caractères et mélanger majuscules, minuscules et chiffres. Il expire tous les 6 mois.

Si vous avez oublié votre mot de passe et ne pouvez plus ouvrir votre session, ouvrez un ticket : seul le support peut le réinitialiser.`,
  },
  {
    title: 'Connecter une imprimante réseau',
    categorie: 'Imprimantes',
    body: `Les imprimantes de l'entreprise sont publiées sur le serveur d'impression.

1. Ouvrez l'explorateur de fichiers.
2. Saisissez \\\\srv-print dans la barre d'adresse.
3. Double-cliquez sur l'imprimante de votre étage. Le pilote s'installe automatiquement.

Les noms suivent la convention BATIMENT-ETAGE : par exemple SIEGE-R2 pour le deuxième étage du siège.

Si l'imprimante n'apparaît pas, vérifiez que vous êtes connecté au réseau de l'entreprise (pas au Wi-Fi invité).`,
  },
  {
    title: 'Le VPN ne se connecte pas',
    categorie: 'Réseau',
    body: `Avant d'ouvrir un ticket, trois vérifications règlent la majorité des cas.

**Vérifiez votre connexion Internet.** Ouvrez une page web quelconque. Si elle ne charge pas, le problème n'est pas le VPN.

**Vérifiez l'heure de votre poste.** Un décalage de plus de cinq minutes fait échouer l'authentification. Clic droit sur l'horloge, « Ajuster la date et l'heure », activez la synchronisation automatique.

**Redémarrez le client VPN.** Fermez-le complètement depuis la zone de notification, puis relancez-le.

Si le problème persiste, ouvrez un ticket en précisant le message d'erreur exact.`,
  },
  {
    title: 'Demander un nouvel équipement',
    categorie: 'Matériel',
    body: `Toutes les demandes de matériel passent par le catalogue de demandes.

Depuis « Nouvelle demande », choisissez le formulaire « Demande de matériel ». Il collecte d'emblée le type de matériel, le bénéficiaire et la justification : c'est ce qui permet de traiter la demande sans aller-retour.

Le délai habituel est de 5 à 10 jours ouvrés selon le matériel. Les remplacements de matériel en panne sont traités en priorité.`,
  },
  {
    title: 'Sauvegarder ses documents',
    categorie: 'Logiciel',
    body: `Seuls les dossiers synchronisés sont sauvegardés.

Le dossier **Documents** de votre profil est répliqué automatiquement toutes les heures. Le **Bureau** l'est également.

En revanche, tout ce qui est stocké ailleurs — racine du disque C:, dossier Téléchargements, clé USB — **n'est pas sauvegardé**. En cas de panne du disque, ces fichiers sont perdus.

En cas de suppression accidentelle, faites un clic droit sur le dossier parent puis « Restaurer les versions précédentes ». Les sauvegardes sont conservées 30 jours.`,
  },
];

// --- Logiciels installés (vue transversale du parc) ---

const LOGICIELS = [
  ['Microsoft 365 Apps', 'Microsoft', '16.0.17928'],
  ['Google Chrome', 'Google', '141.0.7390.54'],
  ['Mozilla Firefox', 'Mozilla', '145.0'],
  ['7-Zip', 'Igor Pavlov', '24.09'],
  ['Adobe Acrobat Reader', 'Adobe', '25.001.20643'],
  ['Notepad++', 'Don Ho', '8.7.1'],
  ['VLC media player', 'VideoLAN', '3.0.21'],
  ['Zoom Workplace', 'Zoom', '6.2.11'],
  ['TeamViewer', 'TeamViewer', '15.58.4'],
  ['Sage Comptabilité', 'Sage', '2026.1'],
];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { id: 'asc' } });
  if (!admin) throw new Error('Aucun compte administrateur — lancez prisma/seed.js d’abord');

  // Formulaires
  for (const f of FORMULAIRES) {
    if (await prisma.form.findFirst({ where: { name: f.name } })) continue;
    const cat = await categorie(f.categorie);
    const form = await prisma.form.create({
      data: {
        name: f.name,
        description: f.description,
        categoryId: cat.id,
        priority: f.priority,
        active: true,
      },
    });
    await prisma.formField.createMany({
      data: f.fields.map((c, i) => ({
        formId: form.id,
        label: c.label,
        type: c.type,
        required: c.required,
        options: c.type === 'select' ? JSON.stringify(c.options) : null,
        position: i,
      })),
    });
  }

  // Base de connaissances
  for (const a of ARTICLES) {
    if (await prisma.kbArticle.findFirst({ where: { title: a.title } })) continue;
    const cat = await categorie(a.categorie);
    await prisma.kbArticle.create({
      data: { title: a.title, body: a.body, categoryId: cat.id, authorId: admin.id, published: true },
    });
  }

  // Logiciels : répartis sur les postes, avec quelques versions divergentes pour
  // que la page Logiciels montre son intérêt.
  const postes = await prisma.asset.findMany({ where: { type: 'pc' }, orderBy: { id: 'asc' } });
  for (const [i, poste] of postes.entries()) {
    if (await prisma.softwareInstall.findFirst({ where: { assetId: poste.id } })) continue;
    const lot = LOGICIELS.filter((_, j) => (i + j) % 4 !== 0);
    for (const [name, publisher, version] of lot) {
      const cat = await prisma.software.upsert({
        where: { name_publisher: { name, publisher } },
        update: {},
        create: { name, publisher },
      });
      await prisma.softwareInstall.create({
        data: {
          assetId: poste.id,
          softwareId: cat.id,
          // Un poste sur cinq est en retard d'une version : c'est ce que la vue
          // transversale doit permettre de repérer.
          version: i % 5 === 0 ? version.replace(/\d+$/, (n) => String(Number(n) - 1)) : version,
        },
      });
    }
    await prisma.asset.update({
      where: { id: poste.id },
      data: { source: i % 3 === 0 ? 'intune' : 'agent', lastSeenAt: new Date(Date.now() - i * 36e5) },
    });
  }

  console.log(
    `Contenu de démo : ${await prisma.form.count()} formulaires, ` +
      `${await prisma.kbArticle.count()} articles, ` +
      `${await prisma.software.count()} logiciels, ` +
      `${await prisma.softwareInstall.count()} installations.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
