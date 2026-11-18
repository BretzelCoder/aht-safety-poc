// Contrôles statiques : fonctions pures sur du texte, sans navigateur (spec 001, plan section 3).
// Chaque fonction rend la liste des erreurs trouvées ; une liste vide veut dire « conforme ».
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Nombre de retours à la ligne avant la position donnée : sert à situer un script dans le fichier. */
function lignesAvant(texte, position) {
  let n = 0;
  for (let i = 0; i < position; i++) if (texte.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * S3 : compile chaque script en ligne (sans l'exécuter) et rend les erreurs de syntaxe,
 * avec le numéro de ligne dans le fichier HTML.
 * Les scripts chargés depuis un fichier (attribut src) et les blocs non JavaScript sont ignorés.
 */
export function verifierSyntaxe(html, fichier = 'index.html') {
  const erreurs = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attributs = m[1];
    if (/\bsrc\s*=/.test(attributs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributs);
    if (type && !/^(text|application)\/javascript$/i.test(type[1])) continue;
    const debut = m.index + m[0].indexOf('>') + 1; // début du contenu, juste après la balise ouvrante
    try {
      new vm.Script(m[2], { filename: fichier, lineOffset: lignesAvant(html, debut) });
    } catch (e) {
      const ligne = /^.*?:(\d+)\n/.exec(String(e.stack));
      erreurs.push({ fichier, ligne: ligne ? Number(ligne[1]) : null, message: e.message });
    }
  }
  return erreurs;
}

/** Numéro de ligne (à partir de 1) d'une position dans un texte. */
const numeroLigne = (texte, position) => lignesAvant(texte, position) + 1;

/**
 * S9 : l'avertissement « modèle pédagogique, pas un outil de sûreté, non affilié » doit rester
 * dans le README et dans le commentaire d'en-tête de index.html (le premier commentaire du fichier).
 */
// Les trois idées de l'avertissement (spec 001, S9) : modèle pédagogique, pas un outil de sûreté, aucune affiliation.
// Le README dit « educational model » ; l'en-tête de index.html dit « educational safety simulator » (même idée).
const PHRASES_AVERTISSEMENT = {
  'README.md': ['educational model', 'not a safety tool', 'not affiliated'],
  'index.html': ['educational', 'not a safety tool', 'not affiliated'],
};
export function verifierAvertissement(readme, html) {
  const erreurs = [];
  const enTete = /<!--([\s\S]*?)-->/.exec(html);
  const cibles = [['README.md', readme], ['index.html', enTete ? enTete[1] : '']];
  for (const [fichier, texte] of cibles) {
    for (const phrase of PHRASES_AVERTISSEMENT[fichier]) {
      if (!texte.toLowerCase().includes(phrase)) {
        const ou = fichier === 'index.html' ? 'header comment of index.html' : 'README.md';
        erreurs.push({ fichier, ligne: null, message: `disclaimer missing in the ${ou}: "${phrase}"` });
      }
    }
  }
  return erreurs;
}

/** Position de l'accolade fermante qui correspond à l'accolade ouvrante située à `ouvrante`. */
function accoladeFermante(texte, ouvrante) {
  let profondeur = 0;
  for (let i = ouvrante; i < texte.length; i++) {
    if (texte[i] === '{') profondeur++;
    else if (texte[i] === '}' && --profondeur === 0) return i;
  }
  return -1;
}

/**
 * S10 (moitié statique) : le chargement de GoatCounter est gardé par l'hôte du site publié,
 * et chaque événement de mesure est préfixé « aht-safety-poc/ » (le tableau de bord est partagé).
 * Limite connue : le décompte des accolades ne tient pas compte de celles qui seraient dans des chaînes.
 */
export function verifierAnalytics(html, fichier = 'index.html') {
  const erreurs = [];
  const signaler = (position, message) => erreurs.push({ fichier, ligne: position === null ? null : numeroLigne(html, position), message });

  if (!/GC_HOST\s*=\s*'bretzelcoder\.github\.io'/.test(html)) {
    signaler(null, "GC_HOST must be set to 'bretzelcoder.github.io' (analytics loads only on the live site)");
  }

  const garde = /if\s*\(\s*location\.hostname\s*===\s*GC_HOST\s*\)\s*\{/.exec(html);
  if (!garde) {
    signaler(null, 'analytics loader guard missing: expected `if (location.hostname === GC_HOST) {` around the GoatCounter script');
  } else {
    const debut = garde.index + garde[0].length - 1;
    const fin = accoladeFermante(html, debut);
    // La CSP (spec 004) allowliste gc.zgo.at dans la méta Content-Security-Policy : ce n'est pas du code
    // d'analyse, c'est la politique elle-même (contrôlée par verifierCsp). Son domaine est exclu du scan.
    const metaCsp = /<meta[^>]*Content-Security-Policy[^>]*>/i.exec(html);
    for (const m of html.matchAll(/gc\.zgo\.at/g)) {
      if (metaCsp && m.index >= metaCsp.index && m.index < metaCsp.index + metaCsp[0].length) continue;
      if (m.index < debut || m.index > fin) signaler(m.index, 'gc.zgo.at referenced outside the host guard');
    }
  }

  for (const m of html.matchAll(/\btrack\(/g)) {
    if (html.slice(m.index - 9, m.index) === 'function ') continue; // définition de la fonction
    const suite = html.slice(m.index + m[0].length);
    if (suite.startsWith('...gcQueue')) continue;                    // relecture interne de la file d'attente
    if (!/^\s*(['"])aht-safety-poc\//.test(suite)) {
      signaler(m.index, `analytics event name must be a literal starting with the aht-safety-poc/ prefix: track(${suite.slice(0, 30).split('\n')[0]}…`);
    }
  }
  return erreurs;
}

/**
 * Le contexte est « main » quand on contrôle main elle-même ou une pull request qui vise main.
 * Dans GitHub Actions : GITHUB_BASE_REF (cible d'une pull request) puis GITHUB_REF ; en local : la branche courante.
 */
export function estContexteMain(env = process.env, brancheLocale = null) {
  if (env.GITHUB_BASE_REF) return env.GITHUB_BASE_REF === 'main';
  if (env.GITHUB_REF) return env.GITHUB_REF === 'refs/heads/main';
  return brancheLocale === 'main';
}

/** Branche git courante, ou null si git est absent ou si le dossier n'est pas un dépôt. */
export function brancheCourante() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Lit les `specs/*\/spec.md` du dépôt : [{ chemin, texte }]. */
export function lireSpecs(racine) {
  const dossier = `${racine}/specs`;
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(`${dossier}/${d.name}/spec.md`))
    .map(d => ({ chemin: `specs/${d.name}/spec.md`, texte: readFileSync(`${dossier}/${d.name}/spec.md`, 'utf8').replace(/\r\n/g, '\n') }));
}

/**
 * S8 : une spec présente sur main n'est jamais DRAFT ni IN REVIEW. Hors contexte main,
 * le contrôle ne fait que lister les statuts. Le modèle `specs/000-template` est ignoré.
 */
const STATUTS = ['DRAFT', 'IN REVIEW', 'APPROVED', 'DELIVERED', 'CLOSED', 'ON HOLD', 'ABANDONED'];
export function verifierStatuts(specs, { main }) {
  const erreurs = [], liste = [];
  for (const { chemin, texte } of specs) {
    if (chemin.includes('specs/000-template/')) continue;
    const m = new RegExp(`^>\\s*Status:\\s*(${STATUTS.join('|')})\\b`, 'm').exec(texte);
    const statut = m ? m[1] : null;
    liste.push(`${chemin}: ${statut ?? 'no readable status'}`);
    if (!main) continue;
    if (!statut) erreurs.push({ fichier: chemin, ligne: null, message: 'no readable status in the spec header (expected `> Status: …`)' });
    else if (statut === 'DRAFT' || statut === 'IN REVIEW') {
      erreurs.push({ fichier: chemin, ligne: numeroLigne(texte, m.index), message: `a spec on main must not be ${statut}: approve it, put it on hold or abandon it` });
    }
  }
  return { erreurs, liste };
}

/** Texte valable d'une traduction : une chaîne non vide. */
const texteValable = v => typeof v === 'string' && v.trim() !== '';
/** Entrée de MSG complète : un triplet de textes non vides. */
const texteComplet = v => Array.isArray(v) && v.length === 3 && v.every(texteValable);

/**
 * S4 (moitié « tables ») : les traductions sont complètes en français, anglais et allemand.
 * `tables` = { MSG, STATIC, LANGS } lues dans la page ; `html` = contenu de index.html.
 *  - chaque clé data-i18n* du HTML existe dans STATIC.en et STATIC.de ;
 *  - STATIC.en et STATIC.de ont exactement les mêmes clés ;
 *  - chaque entrée de MSG est un triplet [fr, en, de] de textes non vides ;
 *  - chaque clé de message écrite en toutes lettres dans le script existe dans MSG, et les familles
 *    de clés composées pendant l'exécution (préfixe + suffixe) sont complètes.
 * On ne compare jamais les textes entre langues : les termes identiques par conception ne sont pas signalés.
 */
const FAMILLES_COMPOSEES = [
  // t('hud.k' + T.mc.appliedKind), avec appliedKind parmi les arrêts de type MAX, COMFORT et AUTH. Les types
  // vus dans le script (appliedKind === 'X' ou appliedKind: 'X') s'ajoutent à cette liste : un nouveau type
  // sans traduction est signalé sans qu'il faille penser à modifier ce contrôle.
  { prefixe: 'hud.k', suffixes: ['MAX', 'COMFORT', 'AUTH'], lecture: /appliedKind\s*(?:===|:)\s*'([A-Z]+)'/g },
  // codeName(c) lit MSG['code.' + c] et retombe sans bruit sur le code brut s'il est absent, et il ne passe pas
  // par t() : sans cette famille, supprimer la traduction d'un code maison ne ferait échouer rien. Seuls les
  // codes maison sont localisés (CLAUDE.md, « Never translated ») ; la liste est celle de ces codes.
  { prefixe: 'code.', suffixes: ['ORDER_NOT_APPLIED'] },
];
export function verifierTraductions({ MSG, STATIC, LANGS }, html) {
  const erreurs = [];
  const signaler = (message, position = null) => erreurs.push({ fichier: 'index.html', ligne: position === null ? null : numeroLigne(html, position), message });

  if (JSON.stringify(LANGS) !== '["fr","en","de"]') signaler(`LANGS must be ["fr","en","de"], found ${JSON.stringify(LANGS)}`);

  // Le HTML hors scripts, en gardant les numéros de ligne : le contenu des scripts est remplacé par des espaces.
  const horsScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, m => m.replace(/[^\n]/g, ' '));
  const deja = new Set();
  for (const m of horsScripts.matchAll(/\bdata-i18n(?:-html|-title|-aria)?\s*=\s*"([^"]+)"/g)) {
    const cle = m[1];
    if (deja.has(cle)) continue;
    deja.add(cle);
    for (const lang of ['en', 'de']) {
      if (!texteValable(STATIC[lang]?.[cle])) signaler(`STATIC.${lang} is missing the key "${cle}" used by the page (data-i18n)`, m.index);
    }
  }

  for (const [a, b] of [['en', 'de'], ['de', 'en']]) {
    for (const cle of Object.keys(STATIC[a] ?? {})) {
      if (!(cle in (STATIC[b] ?? {}))) signaler(`STATIC.${b} is missing the key "${cle}" (present in STATIC.${a})`);
    }
  }

  for (const [cle, v] of Object.entries(MSG)) {
    if (!Array.isArray(v) || v.length !== 3) { signaler(`MSG["${cle}"] must be a [fr, en, de] triplet`); continue; }
    v.forEach((texte, i) => { if (!texteValable(texte)) signaler(`MSG["${cle}"] has no ${['fr', 'en', 'de'][i]} text`); });
  }

  // Clés de message écrites en toutes lettres dans les scripts : 'espace.nom', avec un espace de MSG.
  const espaces = new Set(Object.keys(MSG).map(k => k.split('.')[0]));
  const reCle = /(?<![\w$.])'([a-z0-9]+(?:\.[A-Za-z0-9_]+)+)'(?![\w])/g;
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let s;
  while ((s = re.exec(html))) {
    if (/\bsrc\s*=/.test(s[1])) continue;
    const debut = s.index + s[0].indexOf('>') + 1;
    for (const m of s[2].matchAll(reCle)) {
      const cle = m[1];
      if (!espaces.has(cle.split('.')[0]) || cle in MSG) continue;
      if (FAMILLES_COMPOSEES.some(f => f.prefixe === cle)) continue; // préfixe d'une clé composée, vérifié par les familles
      signaler(`key "${cle}" is used by the script but defined nowhere in MSG`, debut + m.index);
    }
  }
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(x => !/\bsrc\s*=/.test(x[1])).map(x => x[2]).join('\n');
  for (const { prefixe, suffixes, lecture } of FAMILLES_COMPOSEES) {
    const vus = lecture ? [...scripts.matchAll(lecture)].map(m => m[1]) : [];
    for (const suffixe of new Set([...suffixes, ...vus])) {
      if (!texteComplet(MSG[prefixe + suffixe])) signaler(`composed key "${prefixe + suffixe}" is built by the script but missing from MSG`);
    }
  }
  return erreurs;
}

/**
 * Spec 002, AC-18 : aucun constructeur n'est nommé comme propriétaire de l'architecture montrée.
 * La liste est volontairement courte (le nom que le brief mentionnait) : d'autres noms de matériel
 * figurent déjà, légitimement, dans les sources du guide.
 * Amendement du 2026-11-15 (décision du propriétaire) : aucune distribution Linux ni aucun outil de construction n'est nommé non plus
 * (ni Debian ni Yocto) : le schéma dit « distribution Linux », en variante temps réel ou standard.
 */
export const NOMS_INTERDITS = ['Liebherr', 'Yocto', 'Debian'];
export function verifierSansConstructeur(readme, html) {
  const erreurs = [];
  for (const [fichier, texte] of [['README.md', readme], ['index.html', html]]) {
    for (const nom of NOMS_INTERDITS) {
      const re = new RegExp(nom, 'gi');
      let m;
      while ((m = re.exec(texte))) {
        erreurs.push({ fichier, ligne: lignesAvant(texte, m.index) + 1, message: `"${nom}" must not appear in the shipped page or the README (spec 002: no manufacturer, no Linux distribution, no build system is named)` });
      }
    }
  }
  return erreurs;
}


/** Extrait le bloc <div> qui contient `marqueur` (jusqu'à son </div> fermant), ou null. */
function extraireBloc(html, marqueur) {
  const i = html.indexOf(marqueur);
  if (i < 0) return null;
  const debut = html.lastIndexOf('<div', i);
  const re = /<div\b|<\/div>/g;
  re.lastIndex = debut;
  let prof = 0, m;
  while ((m = re.exec(html))) {
    prof += m[0] === '</div>' ? -1 : 1;
    if (prof === 0) return { debut, texte: html.slice(debut, re.lastIndex) };
  }
  return null;
}

/**
 * Spec 002, AC-15 : aucune durée de latence n'est écrite en dur dans le HTML de la carte « Autonomie · niveau 1 » ni de la
 * vue « niveaux 1 ↔ 2 », ni dans les textes statiques qui s'y rattachent : les durées affichées viennent du modèle.
 */
const CLES_NIVEAU1 = 'l1H|l1Help|kernAria|freezeT|defAria|defOver|defBeyond|defStale|defReplay|defInteg|defSend|defSendT|defRepeat|tabL12|tabsAria|scF|scFt|scG|scGt';
export function verifierLatenceSansChiffre(html) {
  const erreurs = [], reDuree = /\d+(?:[.,]\d+)?\s*ms\b/g;
  const signaler = (message, position) => erreurs.push({ fichier: 'index.html', ligne: lignesAvant(html, position) + 1, message });
  for (const marqueur of ['id="cardL1"', 'id="paneL12"']) {
    const b = extraireBloc(html, marqueur);
    if (!b) { signaler(`the block ${marqueur} was not found`, 0); continue; }
    for (const m of b.texte.matchAll(reDuree)) signaler(`a latency "${m[0]}" is written in the HTML of ${marqueur}: it must come from the model`, b.debut + m.index);
  }
  const reStatic = new RegExp(String.raw`'ui\.(${CLES_NIVEAU1})':\s*'((?:[^'\\]|\\.)*)'`, 'g');
  for (const m of html.matchAll(reStatic)) {
    if (new RegExp(reDuree.source).test(m[2])) signaler(`the static text ui.${m[1]} contains a written latency: "${m[2]}"`, m.index);
  }
  return erreurs;
}

/* ---------------------------------------------------------------- spec 004 */

/**
 * Spec 004, S6 : le crochet de test `window.__sim` ne doit être créé qu'en dehors du site publié.
 * Le fichier doit montrer une garde sur GC_HOST (défini dans js/analytics.js) avant l'affectation.
 */
export function verifierCrochet(texte, fichier = 'js/test-hook.js') {
  const erreurs = [];
  const position = /window\.__sim\s*=/.exec(texte)?.index ?? -1;
  if (position < 0) erreurs.push({ fichier, ligne: null, message: 'the test hook window.__sim is missing: the checks need it' });
  else {
    const avant = texte.slice(0, position);
    if (!/location\.hostname\s*!==\s*GC_HOST/.test(avant)) {
      erreurs.push({ fichier, ligne: lignesAvant(texte, position) + 1, message: 'window.__sim is created without the published-site guard (location.hostname !== GC_HOST): the test hook must never exist on the live site (spec 004, S4)' });
    }
  }
  return erreurs;
}

/**
 * Spec 004, S7 : chaque action appelée par le workflow doit être épinglée à un SHA de commit complet
 * (40 caractères hexadécimaux) : un tag ou une branche est déplaçable. La version lisible peut rester en commentaire.
 */
export function verifierEpinglage(texte, fichier = '.github/workflows/checks.yml') {
  const erreurs = [];
  for (const m of texte.matchAll(/\buses:\s*['"]?([^'"\s#]+)/gi)) {
    const [, action] = m;
    if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(action)) {
      erreurs.push({ fichier, ligne: lignesAvant(texte, m.index) + 1, message: `"${action}" is pinned by a movable ref (tag or branch): pin it to the full 40-hex commit SHA, with the version as a comment (spec 004, S7)` });
    }
  }
  return erreurs;
}

/**
 * Spec 004, S1/S2 : la politique de sécurité du contenu (Content-Security-Policy) de la page.
 * L'empreinte de chaque script en ligne est recalculée ici comme le navigateur la calcule :
 * base64 du SHA-256 des octets exacts du contenu du script (retours chariot compris : ne pas
 * normaliser les fins de ligne avant de hacher, un SHA en hexadécimal n'est pas valide).
 */
const CSP_ORIGINES_AUTORISEES = [
  "'self'", 'file:', 'data:', "'none'", "'unsafe-inline'",
  'https://fonts.googleapis.com',   // feuilles de style des polices (CSS externe)
  'https://fonts.gstatic.com',      // fichiers de polices
  'https://gc.zgo.at',              // script de mesure GoatCounter (site publié seulement)
  'https://*.goatcounter.com',      // repli image des mesures GoatCounter
  'https://bretzelgoatcounter.goatcounter.com', // point de collecte (GC_ENDPOINT)
];
const CSP_DIRECTIVES_ATTENDUES = ['default-src', 'script-src', 'style-src', 'font-src', 'connect-src', 'img-src', 'base-uri', 'form-action'];

export function verifierCsp(htmlBrut, fichier = 'index.html') {
  const erreurs = [];
  const signaler = (message, position) => erreurs.push({ fichier, ligne: lignesAvant(htmlBrut, position) + 1, message });
  const meta = /<meta\s+http-equiv\s*=\s*["']?Content-Security-Policy["']?\s+content\s*=\s*"([^"]*)"/i.exec(htmlBrut);
  if (!meta) { signaler('no Content-Security-Policy meta tag: third-party scripts would run with full privileges (spec 004, S1)', 0); return erreurs; }
  const directives = new Map();
  for (const partie of meta[1].split(';').map(p => p.trim()).filter(Boolean)) {
    const [nom, ...sources] = partie.split(/\s+/);
    if (directives.has(nom)) signaler(`the directive ${nom} is written more than once in the policy`, meta.index);
    directives.set(nom, sources);
  }
  for (const nom of CSP_DIRECTIVES_ATTENDUES) {
    if (!directives.has(nom)) signaler(`the directive ${nom} is missing from the policy (spec 004, S1)`, meta.index);
  }
  // Origines : toute source qui n'est ni une empreinte ni une clef connue doit figurer dans la liste autorisée.
  for (const [nom, sources] of directives) {
    for (const source of sources) {
      if (/^'sha256-[A-Za-z0-9+/=]+'$/.test(source)) continue;
      if (!CSP_ORIGINES_AUTORISEES.includes(source)) {
        signaler(`the directive ${nom} allows "${source}": an origin outside the allowlist must be deliberate (add it only after checking it, spec 004, S2)`, meta.index);
      }
    }
  }
  // Empreintes : chaque script en ligne de la page doit être allowlisté par la sienne, exacte, et réciproquement.
  // Le hachage se fait comme le navigateur le calcule : le prétraitement HTML normalise CRLF → LF dans le contenu
  // du script avant que l'empreinte portée dans la politique ne soit comparée ; un hachage sur les octets bruts
  // (CRLF conservés) ne correspond donc jamais sur une copie Windows.
  const scriptSrc = directives.get('script-src') || [];
  const empreintes = new Set(scriptSrc.filter(s => /^'sha256-/.test(s)));
  const presentes = new Set();
  for (const m of htmlBrut.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const empreinte = `'sha256-${createHash('sha256').update(m[1].replace(/\r\n/g, '\n'), 'utf8').digest('base64')}'`;
    presentes.add(empreinte);
    if (!empreintes.has(empreinte)) {
      signaler(`an inline script is not allowed by its own hash (${empreinte}): update the policy or recompute the hashes after node scripts/stamps.mjs (spec 004, S2)`, m.index);
    }
  }
  for (const empreinte of empreintes) {
    if (!presentes.has(empreinte)) signaler(`the policy allows ${empreinte} but no inline script has this hash: a stale pin (spec 004, S2)`, meta.index);
  }
  if (scriptSrc.length && !scriptSrc.includes("'self'")) signaler("script-src must keep 'self' (the page loads its own files)", meta.index);
  return erreurs;
}

