// Génère les PDF de documentation à la charte Parqueo.
//
//   cd docs && npm install && npm run build
//
// Chaque page porte le bandeau de marque (mot-symbole + titre du document) ;
// la première page ouvre sur un bloc de titre. Les polices de la marque sont
// embarquées en data URI, le PDF est donc autonome.
//
// Le rendu utilise le Chromium de Playwright. S'il n'est pas dans le cache
// habituel, donnez son chemin dans CHROME_PATH.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --- Charte (client/src/index.css) ---
const C = {
  canvas: '#f7f7f8',
  surface: '#ffffff',
  line: '#e4e4e7',
  ink: '#1c1c21',
  inkSoft: '#6b6b76',
  inkFaint: '#9b9ba4',
  accent: '#d9435f',
  accentSoft: '#fdf0f2',
  dark: '#15151b',
};

const DOCS = [
  {
    file: 'technique.md',
    pdf: 'Parqueo — Documentation technique.pdf',
    eyebrow: 'Documentation technique',
    subtitle:
      "Architecture, modèle de données, API, moteur de workflows et limites connues.",
  },
  {
    file: 'installation.md',
    pdf: 'Parqueo — Documentation d’installation.pdf',
    eyebrow: "Documentation d’installation",
    subtitle:
      "Prérequis, déploiement, configuration, sauvegarde, mise à jour et dépannage.",
  },
  {
    file: 'fonctionnel.md',
    pdf: 'Parqueo — Documentation fonctionnelle.pdf',
    eyebrow: 'Documentation fonctionnelle',
    subtitle:
      "Rôles, cycle de vie d’un ticket, workflows, inventaire et paramètres, écran par écran.",
  },
];

const VERSION = JSON.parse(await readFile(path.join(HERE, '../server/package.json'), 'utf8')).version;
const DATE = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// --- Ressources embarquées ---

// Chromium n'embarque pas les polices variables dans le PDF : il leur substitue
// une police système. Les fichiers sont donc des statiques, un par graisse.
async function fontFace(family, file, weight = 400) {
  const b64 = (await readFile(path.join(HERE, 'fonts', file))).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${weight};font-style:normal;font-display:block}`;
}

// Mot-symbole : le P est le symbole de marque, le mot écrit est « arqueo ».
const markSvg = (stroke) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 3 12 18" fill="none">` +
  `<path d="M7 3h6a5 5 0 0 1 0 10H7z" fill="${C.accent}"/>` +
  `<path d="M7 4v16" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/></svg>`;

const markUri = (stroke) => `data:image/svg+xml;base64,${Buffer.from(markSvg(stroke)).toString('base64')}`;

// --- Gabarit HTML ---

function template({ fonts, body, eyebrow, title, subtitle }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
${fonts}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:10.2pt;line-height:1.62;
  color:${C.ink};font-feature-settings:'kern' 1,'liga' 1}

/* --- Bloc de titre (première page) --- */
.cover{margin:0 0 26pt}
.cover .eyebrow{font-family:'PlexMono',ui-monospace,monospace;font-size:8pt;letter-spacing:.16em;
  text-transform:uppercase;color:${C.accent};margin:0 0 10pt}
.cover h1{font-family:'Archivo',system-ui,sans-serif;font-size:27pt;line-height:1.12;
  letter-spacing:-.02em;font-weight:700;margin:0 0 10pt;color:${C.ink}}
.cover .sub{font-size:11.5pt;line-height:1.5;color:${C.inkSoft};margin:0 0 18pt;max-width:118mm}
.cover .meta{display:flex;gap:22pt;padding-top:11pt;border-top:1.4pt solid ${C.accent};
  font-family:'PlexMono',ui-monospace,monospace;font-size:8pt;color:${C.inkFaint};
  letter-spacing:.05em;text-transform:uppercase}

/* --- Titres --- */
h2{font-family:'Archivo',system-ui,sans-serif;font-size:15pt;letter-spacing:-.015em;font-weight:700;
  margin:26pt 0 9pt;padding-top:9pt;border-top:.75pt solid ${C.line};color:${C.ink};
  break-after:avoid;break-inside:avoid}
h3{font-size:11.4pt;font-weight:600;letter-spacing:-.01em;margin:17pt 0 5pt;color:${C.ink};
  break-after:avoid}
h4{font-size:10.2pt;font-weight:600;margin:13pt 0 4pt;color:${C.inkSoft};break-after:avoid}
h2+h3{margin-top:11pt}

p{margin:0 0 8pt;orphans:2;widows:2}
strong{font-weight:600}
a{color:${C.accent};text-decoration:none}

/* --- Listes --- */
ul,ol{margin:0 0 9pt;padding-left:15pt}
li{margin:0 0 3pt;padding-left:2pt}
li::marker{color:${C.inkFaint}}

/* --- Sommaire : la première liste du document --- */
.toc{columns:2;column-gap:16pt;padding:11pt 13pt;margin:0 0 6pt;
  background:${C.canvas};border:.75pt solid ${C.line};border-radius:4pt;list-style:none}
.toc li{break-inside:avoid;margin:0 0 4pt;font-size:9.4pt}
.toc a{color:${C.ink}}

/* --- Tableaux --- */
/* Un tableau long se scinde entre deux pages plutôt que de laisser un grand
   vide : la ligne reste solidaire et l'en-tête se répète. */
table{width:100%;border-collapse:collapse;margin:4pt 0 12pt;font-size:9.2pt}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:${C.canvas};text-align:left;font-weight:600;color:${C.ink};
  border:.75pt solid ${C.line};padding:5pt 7pt;line-height:1.4}
td{border:.75pt solid ${C.line};padding:5pt 7pt;vertical-align:top;line-height:1.45}
td code{font-size:8.4pt}
tbody tr:nth-child(even){background:#fbfbfc}

/* --- Code --- */
code{font-family:'PlexMono',ui-monospace,monospace;font-size:8.8pt;
  background:${C.canvas};border:.5pt solid ${C.line};border-radius:3pt;padding:.5pt 3pt;
  color:${C.ink}}
pre{background:${C.canvas};border:.75pt solid ${C.line};border-radius:4pt;
  padding:9pt 11pt;margin:4pt 0 12pt;overflow:hidden;break-inside:avoid}
pre code{background:none;border:0;padding:0;font-size:8.3pt;line-height:1.5;white-space:pre}

/* --- Copies d'écran --- */
figure{margin:12pt 0 16pt;break-inside:avoid}
/* max-width, pas width : une capture plus étroite que la colonne (l'écran de
   connexion) ne doit pas être étirée. */
figure img{display:block;max-width:100%;width:auto;height:auto;margin:0 auto;
  border:.75pt solid ${C.line};border-radius:4pt}
/* Capture d'un seul composant plutôt que d'un écran entier. */
figure.etroite img{max-width:74mm}
figcaption{font-size:8.6pt;line-height:1.45;color:${C.inkFaint};margin-top:6pt}
figcaption code{font-size:7.8pt}

/* --- Citations / encarts --- */
blockquote{margin:4pt 0 12pt;padding:8pt 12pt;background:${C.accentSoft};
  border-left:2.5pt solid ${C.accent};border-radius:0 3pt 3pt 0;break-inside:avoid}
blockquote p{margin:0 0 5pt}
blockquote p:last-child{margin:0}

/* Les « --- » du Markdown feraient doublon avec le filet des titres de section. */
hr{display:none}
</style></head><body>
<section class="cover">
  <p class="eyebrow">${eyebrow}</p>
  <h1>${title}</h1>
  <p class="sub">${subtitle}</p>
  <div class="meta"><span>Version ${VERSION}</span><span>${DATE}</span><span>github.com/Lcanet2/parqueo</span></div>
</section>
${body}
</body></html>`;
}

// Bandeau répété sur chaque page : mot-symbole à gauche, document à droite.
// Les gabarits d'en-tête/pied sont rendus dans un document isolé : les polices
// du corps ne s'y appliquent pas, il faut les redéclarer ici.
function header(docName, fonts) {
  return `<style>${fonts}</style>
<div style="width:100%;font-family:'Inter',system-ui,sans-serif;-webkit-print-color-adjust:exact;">
  <div style="display:flex;align-items:center;justify-content:space-between;
              padding:0 18mm 5pt;border-bottom:.75pt solid ${C.line};position:relative;">
    <div style="display:flex;align-items:center;gap:2pt;font-size:10pt;font-weight:600;
                letter-spacing:-.01em;color:${C.ink};">
      <img src="${markUri(C.ink)}" style="height:9pt;width:6pt;display:block;">
      <span style="line-height:1;">arqueo</span>
    </div>
    <div style="font-size:7.2pt;letter-spacing:.13em;text-transform:uppercase;color:${C.inkFaint};">
      ${docName}
    </div>
    <div style="position:absolute;left:18mm;bottom:-1pt;width:22mm;height:1.6pt;background:${C.accent};"></div>
  </div>
</div>`;
}

function footer(fonts) {
  return `<style>${fonts}</style>
<div style="width:100%;font-family:'Inter',system-ui,sans-serif;-webkit-print-color-adjust:exact;">
  <div style="display:flex;align-items:center;justify-content:space-between;
              padding:5pt 18mm 0;border-top:.75pt solid ${C.line};
              font-size:7.4pt;color:${C.inkFaint};letter-spacing:.04em;">
    <span>Parqueo · documentation ${VERSION}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>`;
}

// --- Rendu ---

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (!existsSync(cache)) return null;
  for (const dir of ['chromium-1228', ...[]]) {
    const p = path.join(cache, dir, 'chrome-linux64/chrome');
    if (existsSync(p)) return p;
  }
  return null;
}

async function resolveChrome() {
  const direct = findChrome();
  if (direct) return direct;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  for (const entry of await readdir(cache)) {
    if (!entry.startsWith('chromium-')) continue;
    for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const p = path.join(cache, entry, rel);
      if (existsSync(p)) return p;
    }
  }
  throw new Error('Chromium introuvable — renseignez CHROME_PATH.');
}

const interOnly = [
  await fontFace('Inter', 'inter-latin-400-normal.woff2', 400),
  await fontFace('Inter', 'inter-latin-600-normal.woff2', 600),
].join('\n');
const fonts = [
  interOnly,
  await fontFace('Inter', 'inter-latin-700-normal.woff2', 700),
  await fontFace('Archivo', 'archivo-latin-700-normal.woff2', 700),
  await fontFace('PlexMono', 'plexmono.woff2', 400),
].join('\n');

const browser = await chromium.launch({ executablePath: await resolveChrome() });
const page = await browser.newPage();

for (const doc of DOCS) {
  const md = await readFile(path.join(HERE, doc.file), 'utf8');

  // Le H1 du Markdown est remplacé par le bloc de titre : on le retire du corps.
  let body = marked
    .parse(md.replace(/^#\s+.+$/m, ''), { mangle: false, headerIds: true })
    // La première liste du document est le sommaire.
    .replace('<ul>', '<ul class="toc">');

  // setContent ne donne pas d'URL de base au document : les copies d'écran sont
  // intégrées en data URI, ce qui rend aussi le HTML de debug autonome.
  for (const [tag, file] of body.matchAll(/<img src="(img\/[^"]+)"/g)) {
    const b64 = (await readFile(path.join(HERE, file))).toString('base64');
    body = body.replace(tag, `<img src="data:image/png;base64,${b64}"`);
  }

  const html = template({
    fonts,
    body,
    eyebrow: 'Parqueo · logiciel ITSM auto-hébergé',
    title: doc.eyebrow,
    subtitle: doc.subtitle,
  });

  // DEBUG_HTML=1 conserve le HTML intermédiaire, utile pour régler la charte.
  if (process.env.DEBUG_HTML) {
    await writeFile(path.join(HERE, doc.file.replace(/\.md$/, '.debug.html')), html);
  }

  await page.setContent(html, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: path.join(HERE, doc.pdf),
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: header(doc.eyebrow, interOnly),
    footerTemplate: footer(interOnly),
    margin: { top: '24mm', bottom: '17mm', left: '18mm', right: '18mm' },
  });

  console.log(`✓ ${doc.pdf}`);
}

await browser.close();
