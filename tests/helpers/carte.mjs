// La carte des fichiers de la page (spec 003, S10 et AC-12) : les balises de index.html, les dossiers js/ et css/,
// le tableau « Where things are » du README, la liste de chemins de CLAUDE.md et les fichiers suivis par git
// doivent dire la même chose. Fonctions pures : elles reçoivent des textes et des listes.

/** Lignes `| \`js/x.js\` | concern | texte |` du README : Map chemin → concern. */
export function lireCarteReadme(readme) {
  const carte = new Map();
  for (const m of readme.matchAll(/^\|\s*`((?:js|css)\/[^`]+)`\s*\|\s*([^|]+?)\s*\|/gm)) carte.set(m[1], m[2]);
  return carte;
}

/** Chemins `js/…` et `css/…` écrits entre accents graves dans CLAUDE.md. */
export function lireCheminsClaude(claude) {
  return new Set([...claude.matchAll(/`((?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))`/g)].map(m => m[1]));
}

const sansCasse = chemin => chemin.toLowerCase();

/**
 * `etiquettes` : fichiers propres nommés par les balises de index.html ; `repertoire` : fichiers trouvés dans js/ et
 * css/ ; `suivis` : fichiers de ces dossiers que git suit, ou null hors d'un dépôt git ; `textes` : { chemin: texte
 * brut } pour contrôler les fins de ligne. Rend les écarts (fichier, message).
 */
export function verifierCarte({ etiquettes, repertoire, readme, claude, suivis = null, textes = {} }) {
  const erreurs = [];
  const err = (fichier, message) => erreurs.push({ fichier, ligne: null, message });
  const tags = new Set(etiquettes), dossier = new Set(repertoire);

  for (const f of tags) {
    if (dossier.has(f)) continue;
    const autre = [...dossier].find(d => sansCasse(d) === sansCasse(f));
    err(f, autre ? `is named by a tag with another case than the file on disk (${autre}): GitHub Pages is case-sensitive` : 'is named by a tag but does not exist');
  }
  for (const f of dossier) if (!tags.has(f) && !etiquettes.some(e => sansCasse(e) === sansCasse(f))) err(f, 'exists in js/ or css/ but no tag of index.html loads it');

  const carte = lireCarteReadme(readme);
  for (const f of tags) if (!carte.has(f)) err('README.md', `the map "Where things are" has no row for ${f}`);
  for (const f of carte.keys()) if (!tags.has(f)) err('README.md', `the map "Where things are" names ${f}, which no tag of index.html loads`);

  const claudeChemins = lireCheminsClaude(claude);
  for (const f of tags) if (!claudeChemins.has(f)) err('CLAUDE.md', `the Stack part does not name ${f}`);
  for (const f of claudeChemins) if (!tags.has(f)) err('CLAUDE.md', `names ${f}, which no tag of index.html loads`);

  if (suivis) {
    const s = new Set(suivis);
    for (const f of tags) if (!s.has(f)) err(f, 'is not tracked by git: it would be missing from the published page');
  }
  for (const [f, texte] of Object.entries(textes)) {
    if (/\r\n/.test(texte) && /(^|[^\r])\n/.test(texte)) err(f, 'mixes CRLF and LF line endings');
  }
  return erreurs;
}

/** Marqueurs : un morceau de code propre à chaque module et à chaque sorte de fichier, dans la page reconstituée. */
export const MARQUEURS_PAGE = [
  ['css/style.css', '.gbody dt'], ['js/base.js', 'const clamp'], ['js/analytics.js', 'function demarrerMesure'],
  ['js/i18n-engine.js', 'const STATIC'], ['js/i18n-en-guide.js', "'guide.limites'"], ['js/i18n-messages.js', 'const MSG'],
  ['js/i18n-apply.js', 'function applyStatic'], ['js/m1-world-physics.js', 'function brakeEnvelope'],
  ['js/m2-comms-bus.js', 'function canResponse'], ['js/m3-perception.js', 'function perceive'],
  ['js/m3-fms-planner.js', 'function planSpeed'], ['js/m3-levels.js', 'function l2Judge'],
  ['js/m3-supervisor-control.js', 'function supervise'], ['js/m4-state.js', 'function resetSim'],
  ['js/m4-scenarios.js', 'function scenarioNiveau1'], ['js/m4-render.js', 'function drawScope'],
  ['js/m4-hud.js', 'function renderL12'], ['js/m4-controls.js', 'function brancherCommandes'],
  ['js/m4-start.js', 'function demarrer()'], ['js/test-hook.js', 'window.__sim'],
];

/** La page reconstituée doit contenir ces marqueurs : un lecteur qui ne rendrait que index.html les perdrait tous. */
export function verifierPageComplete(html) {
  return MARQUEURS_PAGE.filter(([, texte]) => !html.includes(texte)).map(([fichier, texte]) => ({ fichier, ligne: null, message: `the rebuilt page does not contain "${texte}": the reader does not give the whole code` }));
}

/** Les sortes de contenu qu'un fichier de la page peut porter (spec 003, S8 : un seul par fichier). */
export const CONCERNS = ['base', 'analytics', 'i18n', 'guide', 'module-1', 'module-2', 'module-3', 'module-4', 'style', 'test-hook'];

/** Bannières de section reconnues dans le code, et le concern qu'elles annoncent. */
const BANNIERES = [
  [/^\s+MODULE (\d) —/gm, m => `module-${m[1]}`],
  [/^\s+I18N —/gm, () => 'i18n'],
  [/^\s+Mesure d'audience —/gm, () => 'analytics'],
];

/**
 * S8 et AC-10 : chaque fichier de js/ et css/ annonce son concern dans son commentaire d'en-tête (`@concern nom`,
 * nom pris dans CONCERNS), tout autre marqueur `@concern` ou toute bannière de section du fichier annonce le même,
 * et ce concern est celui de la colonne « Concern » du README (`carte`, Map chemin → concern).
 * Limite connue : un bloc déplacé sans sa bannière n'est pas vu par ce contrôle.
 */
export function verifierConcerns(fichiers, carte) {
  const erreurs = [];
  const err = (fichier, message) => erreurs.push({ fichier, ligne: null, message });
  for (const { chemin, texte } of fichiers) {
    const marques = [...texte.matchAll(/@concern\s+([A-Za-z0-9-]+)/g)].map(m => m[1]);
    if (marques.length === 0) { err(chemin, 'has no `@concern` marker in its header comment'); continue; }
    const concern = marques[0];
    if (!CONCERNS.includes(concern)) err(chemin, `declares the concern "${concern}", which is not one of: ${CONCERNS.join(', ')}`);
    for (const autre of marques.slice(1)) if (autre !== concern) err(chemin, `holds a second \`@concern ${autre}\` marker next to its own "${concern}": one concern per file`);
    for (const [re, nom] of BANNIERES) {
      for (const m of texte.matchAll(re)) {
        const annonce = nom(m);
        if (annonce !== concern) err(chemin, `contains a section banner of the concern "${annonce}" (${m[0].trim()}) but declares "${concern}": one concern per file`);
      }
    }
    const readme = carte.get(chemin);
    if (readme !== undefined && readme !== concern) err(chemin, `declares "${concern}" but the README map says "${readme}"`);
  }
  return erreurs;
}
