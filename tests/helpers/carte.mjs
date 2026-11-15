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
