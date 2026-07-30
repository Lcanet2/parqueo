// Génère les pages HTML de documentation publiées sur parqueo.fr/docs/.
//
//   cd docs && npm install && npm run build:web
//
// La sortie va dans le dépôt du site (../../parqueo-site/docs), qui est servi
// tel quel par GitHub Pages : rien à construire côté site. La source reste ici,
// à côté des PDF, pour qu'il n'existe qu'un seul exemplaire des documents.
//
// Donnez un autre chemin de sortie dans SITE_DIR si le dépôt du site n'est pas
// rangé à côté de celui du logiciel.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE_DIR || path.join(HERE, '../../parqueo-site');
const OUT = path.join(SITE, 'docs');
const ORIGINE = 'https://parqueo.fr';

const DOCS = [
  {
    slug: 'fonctionnel',
    file: 'fonctionnel.md',
    nav: 'Fonctionnelle',
    titre: 'Documentation fonctionnelle',
    resume:
      "Rôles, cycle de vie d'un ticket, workflows, inventaire et paramètres de Parqueo, écran par écran.",
    public: 'Utilisateurs, techniciens et administrateurs fonctionnels',
  },
  {
    slug: 'technique',
    file: 'technique.md',
    nav: 'Technique',
    titre: 'Documentation technique',
    resume:
      'Architecture, modèle de données, API REST, moteur de workflows et limites connues de Parqueo.',
    public: 'Développeurs et intégrateurs',
  },
  {
    slug: 'installation',
    file: 'installation.md',
    nav: 'Installation',
    titre: "Documentation d'installation",
    resume:
      'Prérequis, déploiement, configuration, sauvegarde, mise à jour et dépannage de Parqueo sur vos serveurs.',
    public: 'Administrateurs système',
  },
];

// --- Ancres ---

// Reproduit la convention GitHub : les documents contiennent déjà un sommaire
// écrit à la main dont les liens pointent vers ces ancres. Les accents sont
// conservés, la ponctuation tombe — « 7. Le cycle de vie d'un ticket » donne
// « 7-le-cycle-de-vie-dun-ticket ».
function ancre(texte) {
  return texte
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    // marked échappe l'apostrophe en &#39; : sans ce retrait, les chiffres 3 et 9
    // survivraient au filtre ci-dessous et « l'administration » donnerait
    // « l39administration ». Les entités produites ici (' & " < >) sont toutes
    // des caractères que la convention GitHub supprime de toute façon.
    .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

const echappe = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Rendu markdown ---

function rendre(md) {
  const sommaire = [];
  const vus = new Map();

  const renderer = new marked.Renderer();

  renderer.heading = function ({ tokens, depth }) {
    const texte = this.parser.parseInline(tokens);
    let id = ancre(texte);
    // Deux titres identiques dans un même document : on suffixe, comme GitHub.
    if (vus.has(id)) {
      const n = vus.get(id) + 1;
      vus.set(id, n);
      id = `${id}-${n}`;
    } else {
      vus.set(id, 0);
    }
    if (depth === 2 || depth === 3) {
      sommaire.push({ niveau: depth, id, texte: texte.replace(/<[^>]+>/g, '') });
    }
    // Le lien d'ancrage donne au lecteur une URL citable vers la section.
    const lien =
      depth >= 2
        ? `<a class="anchor" href="#${id}" aria-label="Lien vers cette section">#</a>`
        : '';
    return `<h${depth} id="${id}">${texte}${lien}</h${depth}>\n`;
  };

  // Les tableaux sont nombreux et larges : ils doivent défiler seuls plutôt que
  // d'élargir la page.
  const tableOrig = renderer.table.bind(renderer);
  renderer.table = function (token) {
    return `<div class="table-scroll">${tableOrig(token)}</div>\n`;
  };

  const html = marked.parse(md, { renderer, mangle: false, headerIds: false });
  return { html, sommaire };
}

// Le sommaire écrit à la main fait doublon avec le panneau latéral sur grand
// écran ; on le repère pour le masquer là et le garder sur mobile.
function marqueSommaireInline(html) {
  return html.replace(/<ul>\n((?:<li><a href="#[^"]*">[^<]*<\/a><\/li>\n)+)<\/ul>/, (m, corps) =>
    `<ul class="toc-inline">\n${corps}</ul>`
  );
}

// --- Gabarit ---

const marque = `<svg class="mk" viewBox="6 3 12 18" fill="none" aria-hidden="true">
        <path d="M7 3h6a5 5 0 0 1 0 10H7z" fill="var(--accent)"/>
        <path d="M7 4v16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
      </svg>arqueo`;

function entete(actif) {
  const liens = DOCS.map(
    (d) =>
      `<a href="/docs/${d.slug}/"${d.slug === actif ? ' aria-current="page"' : ''}>${d.nav}</a>`
  ).join('\n      ');
  return `<header class="nav">
  <div class="wrap nav-in">
    <a class="brand" href="/" aria-label="Parqueo">${marque}</a>
    <nav class="nav-links" aria-label="Documentation">
      ${liens}
    </nav>
    <a class="btn btn-primary btn-sm" href="/#contact">Demander une démo</a>
  </div>
</header>`;
}

const piedDePage = `<footer>
  <div class="wrap foot-in">
    <span>Parqueo — logiciel de helpdesk et de gestion de parc informatique auto-hébergé.</span>
    <span class="sep"></span>
    <a href="/">Accueil</a>
    <a href="mailto:contact@parqueo.fr">contact@parqueo.fr</a>
  </div>
</footer>`;

// Surligne dans le sommaire latéral la section en cours de lecture. Sans
// dépendance, comme le reste du site.
const scrollSpy = `<script>
  (function () {
    const liens = new Map();
    document.querySelectorAll('.toc a[href^="#"]').forEach((a) => {
      liens.set(decodeURIComponent(a.getAttribute('href').slice(1)), a);
    });
    if (!liens.size) return;
    const cibles = [...liens.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    let courant = null;
    function actualiser() {
      // Section active : le dernier titre passé au-dessus du tiers haut de l'écran.
      let vu = null;
      for (const el of cibles) {
        if (el.getBoundingClientRect().top < innerHeight * 0.33) vu = el;
        else break;
      }
      const a = vu ? liens.get(vu.id) : null;
      if (a === courant) return;
      if (courant) courant.removeAttribute('aria-current');
      if (a) a.setAttribute('aria-current', 'true');
      courant = a;
    }
    let attente = false;
    addEventListener('scroll', () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { actualiser(); attente = false; });
    }, { passive: true });
    actualiser();
  })();
</script>`;

function page({ titre, description, url, corps, actif, jsonld, script = '' }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echappe(titre)}</title>
<meta name="description" content="${echappe(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="theme-color" content="#f6f6f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e0e13" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Parqueo">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${echappe(titre)}">
<meta property="og:description" content="${echappe(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGINE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGINE}/og-image.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/docs/docs.css">
<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
${entete(actif)}
${corps}
${piedDePage}
${script}
</body>
</html>
`;
}

// --- Pages de documentation ---

async function construireDoc(doc, index) {
  const md = await readFile(path.join(HERE, doc.file), 'utf8');
  const { html, sommaire } = rendre(md);
  const corpsHtml = marqueSommaireInline(html);

  const url = `${ORIGINE}/docs/${doc.slug}/`;
  const precedent = DOCS[index - 1];
  const suivant = DOCS[index + 1];

  const toc = sommaire
    .map(
      (s) =>
        `<li class="n${s.niveau}"><a href="#${s.id}">${echappe(s.texte)}</a></li>`
    )
    .join('\n        ');

  const suite =
    precedent || suivant
      ? `<nav class="suite" aria-label="Autres documents">
      ${precedent ? `<a class="suite-l" href="/docs/${precedent.slug}/"><span>Document précédent</span><strong>${precedent.titre}</strong></a>` : '<span></span>'}
      ${suivant ? `<a class="suite-l suite-r" href="/docs/${suivant.slug}/"><span>Document suivant</span><strong>${suivant.titre}</strong></a>` : ''}
    </nav>`
      : '';

  const corps = `<main class="wrap doc-layout" id="contenu">
  <aside class="toc" aria-label="Sommaire du document">
    <p class="toc-t">Sommaire</p>
    <nav>
      <ul>
        ${toc}
      </ul>
    </nav>
  </aside>
  <article class="doc">
    <nav class="fil" aria-label="Fil d'Ariane">
      <a href="/">Accueil</a> <span>/</span> <a href="/docs/">Documentation</a> <span>/</span> <span>${echappe(doc.nav)}</span>
    </nav>
    <p class="doc-public">${echappe(doc.public)}</p>
${corpsHtml}
    ${suite}
  </article>
</main>`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: doc.titre,
        name: `Parqueo — ${doc.titre.toLowerCase()}`,
        description: doc.resume,
        inLanguage: 'fr-FR',
        url,
        audience: { '@type': 'Audience', audienceType: doc.public },
        about: {
          '@type': 'SoftwareApplication',
          name: 'Parqueo',
          applicationCategory: 'BusinessApplication',
        },
        publisher: { '@type': 'Organization', name: 'Parqueo', url: `${ORIGINE}/` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${ORIGINE}/` },
          { '@type': 'ListItem', position: 2, name: 'Documentation', item: `${ORIGINE}/docs/` },
          { '@type': 'ListItem', position: 3, name: doc.nav, item: url },
        ],
      },
    ],
  };

  await mkdir(path.join(OUT, doc.slug), { recursive: true });
  await writeFile(
    path.join(OUT, doc.slug, 'index.html'),
    page({
      titre: `${doc.titre} | Parqueo`,
      description: doc.resume,
      url,
      corps,
      actif: doc.slug,
      jsonld,
      script: scrollSpy,
    })
  );
  return sommaire.length;
}

// --- Sommaire général ---

async function construireIndex(compte) {
  const url = `${ORIGINE}/docs/`;
  const cartes = DOCS.map(
    (d) => `      <a class="carte" href="/docs/${d.slug}/">
        <p class="eyebrow">${echappe(d.public)}</p>
        <h2>${echappe(d.titre)}</h2>
        <p>${echappe(d.resume)}</p>
        <span class="carte-go">Lire le document</span>
      </a>`
  ).join('\n');

  const corps = `<main class="wrap doc-index" id="contenu">
  <nav class="fil" aria-label="Fil d'Ariane">
    <a href="/">Accueil</a> <span>/</span> <span>Documentation</span>
  </nav>
  <p class="eyebrow">Documentation</p>
  <h1>Tout Parqueo, écrit noir sur blanc.</h1>
  <p class="lede">
    Les trois documents livrés avec le logiciel, en accès libre : ce qu'il fait, comment il est
    construit, et comment l'installer sur vos serveurs. Aucune inscription demandée.
  </p>
  <div class="cartes">
${cartes}
  </div>
</main>`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        name: 'Documentation Parqueo',
        description:
          "Documentation fonctionnelle, technique et d'installation de Parqueo, logiciel de helpdesk et de gestion de parc informatique auto-hébergé.",
        inLanguage: 'fr-FR',
        url,
        hasPart: DOCS.map((d) => ({
          '@type': 'TechArticle',
          name: d.titre,
          url: `${ORIGINE}/docs/${d.slug}/`,
          description: d.resume,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${ORIGINE}/` },
          { '@type': 'ListItem', position: 2, name: 'Documentation', item: url },
        ],
      },
    ],
  };

  await writeFile(
    path.join(OUT, 'index.html'),
    page({
      titre: 'Documentation | Parqueo',
      description:
        "Documentation fonctionnelle, technique et d'installation de Parqueo : ticketing, inventaire du parc, workflows et déploiement auto-hébergé.",
      url,
      corps,
      actif: null,
      jsonld,
    })
  );
}

// --- Sitemap ---

async function construireSitemap() {
  const jour = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${ORIGINE}/`, priority: '1.0', changefreq: 'monthly' },
    { loc: `${ORIGINE}/docs/`, priority: '0.8', changefreq: 'monthly' },
    ...DOCS.map((d) => ({
      loc: `${ORIGINE}/docs/${d.slug}/`,
      priority: '0.7',
      changefreq: 'monthly',
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${jour}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
  await writeFile(path.join(SITE, 'sitemap.xml'), xml);
  return urls.length;
}

// --- Exécution ---

await mkdir(OUT, { recursive: true });
let sections = 0;
for (const [i, doc] of DOCS.entries()) {
  const n = await construireDoc(doc, i);
  sections += n;
  console.log(`· /docs/${doc.slug}/  ${n} sections`);
}
await construireIndex();
console.log('· /docs/  sommaire');
const n = await construireSitemap();
console.log(`· sitemap.xml  ${n} URL`);
console.log(`\n${sections} sections indexables générées dans ${OUT}`);
