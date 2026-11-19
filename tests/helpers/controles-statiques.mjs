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
 * L'affectation doit se trouver DANS le bloc d'un `if (location.hostname !== GC_HOST) { … }` (GC_HOST est défini
 * dans js/analytics.js). Les commentaires sont blanchis avant l'analyse (positions conservées) : une garde ou une
 * affectation écrite en commentaire ne compte pas. Limite connue : les accolades dans des chaînes ne sont pas gérées.
 */
export function verifierCrochet(texte, fichier = 'js/test-hook.js') {
  const erreurs = [];
  const blanchir = m => m.replace(/[^\n]/g, ' ');
  const code = texte.replace(/\/\*[\s\S]*?\*\//g, blanchir).replace(/\/\/[^\n]*/g, blanchir);
  const position = /window\.__sim\s*=/.exec(code)?.index ?? -1;
  if (position < 0) { erreurs.push({ fichier, ligne: null, message: 'the test hook window.__sim is missing: the checks need it' }); return erreurs; }
  const garde = /if\s*\(\s*location\.hostname\s*!==\s*GC_HOST\s*\)\s*\{/.exec(code);
  const debut = garde ? garde.index + garde[0].length - 1 : -1;
  const fin = garde ? accoladeFermante(code, debut) : -1;
  if (!garde || fin < 0 || position < debut || position > fin) {
    erreurs.push({ fichier, ligne: lignesAvant(texte, position) + 1, message: 'window.__sim is created outside the published-site guard (if (location.hostname !== GC_HOST) { … }): the test hook must never exist on the live site (spec 004, S4)' });
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
 * base64 du SHA-256 du contenu du script, fins de ligne CRLF ramenées à LF (le navigateur normalise avant de
 * comparer, mesure n° 4 du plan) ; un SHA en hexadécimal n'est pas valide.
 * Les sources sont allowlistées DIRECTIVE PAR DIRECTIVE : `'unsafe-inline'` n'est toléré que dans style-src,
 * `data:` que dans img-src, une empreinte que dans script-src.
 */
const CSP_SOURCES_PAR_DIRECTIVE = {
  'default-src': ["'self'", 'file:'],
  'script-src': ["'self'", 'file:', 'https://gc.zgo.at'],      // + les empreintes des scripts en ligne ; gc.zgo.at : mesure GoatCounter (site publié seulement)
  'style-src': ["'self'", 'file:', "'unsafe-inline'", 'https://fonts.googleapis.com'], // style= partout dans la page ; CSS des polices
  'font-src': ['https://fonts.gstatic.com'],                    // fichiers de polices
  'connect-src': ['https://bretzelgoatcounter.goatcounter.com'], // point de collecte (GC_ENDPOINT)
  'img-src': ["'self'", 'file:', 'data:', 'https://*.goatcounter.com'], // repli image des mesures GoatCounter
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
};
const CSP_DIRECTIVES_ATTENDUES = Object.keys(CSP_SOURCES_PAR_DIRECTIVE);

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
  // Sources : chaque source doit figurer dans la liste de SA directive (les empreintes : script-src seulement),
  // et toute directive inconnue est signalée (l'ajouter est un choix délibéré, à inscrire dans CSP_SOURCES_PAR_DIRECTIVE).
  for (const [nom, sources] of directives) {
    const permises = CSP_SOURCES_PAR_DIRECTIVE[nom];
    if (!permises) { signaler(`the directive ${nom} is not one the policy is expected to carry: add it to the check deliberately (spec 004, S2)`, meta.index); continue; }
    for (const source of sources) {
      if (nom === 'script-src' && /^'sha256-[A-Za-z0-9+/=]+'$/.test(source)) continue;
      if (!permises.includes(source)) {
        signaler(`the directive ${nom} allows "${source}": a source outside the allowlist of this directive must be deliberate (add it only after checking it, spec 004, S2)`, meta.index);
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
  // Un script en ligne portant des attributs (type=…) échappe au calcul ci-dessus : on le signale plutôt que de le laisser passer.
  for (const m of htmlBrut.matchAll(/<script\b([^>]*)>/g)) {
    if (m[1].trim() && !/\bsrc\s*=/.test(m[1]) && !/\/\s*$/.test(m[1])) signaler(`an inline <script${m[1]}> carries attributes: the check only hashes bare <script> elements (spec 004, S2)`, m.index);
  }
  for (const empreinte of empreintes) {
    if (!presentes.has(empreinte)) signaler(`the policy allows ${empreinte} but no inline script has this hash: a stale pin (spec 004, S2)`, meta.index);
  }
  if (scriptSrc.length && !scriptSrc.includes("'self'")) signaler("script-src must keep 'self' (the page loads its own files)", meta.index);
  return erreurs;
}


/* ---------------------------------------------------------------- spec 005 */

/**
 * Spec 005, S3 : tout texte dynamique entre dans le balisage par le gabarit étiqueté html`…` (js/base.js).
 * Le contrôle lit un fichier JavaScript en une passe (commentaires, chaînes, expressions régulières et gabarits à
 * ${…} imbriqués) et vérifie trois règles :
 *  1. un puits HTML (.innerHTML =, .outerHTML =, .srcdoc =, .insertAdjacentHTML(, document.write(, createContextualFragment(,
 *     parseFromString(, new DOMParser) reçoit html`…` ou raw(…), ou une expression de la liste ECHAPPEMENT_PERMIS ;
 *  2. un gabarit qui porte à la fois une balise et un ${…} est étiqueté html (sinon une fonction qui fabrique un fragment,
 *     comme row() ou chip(), échapperait au contrôle de la règle 1) ;
 *  3. raw(…) n'apparaît que sur la liste (vide à la livraison : le balisage écrit par le dépôt se loge dans le gabarit).
 * Une entrée de la liste qui ne correspond à rien est signalée (entrée périmée). Limites connues : le contrôle raisonne sur la
 * syntaxe, non sur le flux des données (il ne sait pas qu'un argument de raw() est bien écrit par le dépôt) ; une expression
 * régulière ou une chaîne que le lecteur ne comprend pas fait échouer le contrôle (« could not read »), jamais passer.
 */
export const ECHAPPEMENT_PERMIS = [
  { fichier: 'js/i18n-apply.js', expression: 'pick(d.i18nHtml, o.html)',
    raison: 'authored static text of the page and of the guide (data-i18n-html, STATIC), written in the repository, never a dynamic value (spec 005, section 5)' },
];

const MOTS_AVANT_REGEX = /(?:^|[^\w$.])(?:return|typeof|case|in|of|void|delete|else|do)\s*$/;

function lireJs(texte) {
  const n = texte.length, code = texte.replace(/[^\n]/g, ' ').split(''), gabarits = [];
  const pile = [{ t: 'code', acc: 0 }];
  let dernier = '', i = 0;
  const avant = k => code.slice(Math.max(0, k - 12), k).join('');
  while (i < n) {
    const ctx = pile[pile.length - 1], c = texte[i], d = texte[i + 1] || '';
    if (ctx.t === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') {
        code[i] = '`'; gabarits.push({ debut: ctx.debut, fin: i, etiquette: ctx.etiquette, aInterp: ctx.aInterp, aBalise: ctx.aBalise });
        pile.pop(); dernier = '`'; i++; continue;
      }
      if (c === '$' && d === '{') { ctx.aInterp = true; code[i] = '$'; code[i + 1] = '{'; pile.push({ t: 'interp', acc: 0 }); dernier = '{'; i += 2; continue; }
      if (c === '<' && /[a-zA-Z/]/.test(d)) ctx.aBalise = true;
      i++; continue;
    }
    if (c === '/' && d === '/') { while (i < n && texte[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const f = texte.indexOf('*/', i + 2); if (f < 0) return { incomplet: true }; i = f + 2; continue; }
    if (c === "'" || c === '"') {
      i++;
      while (i < n && texte[i] !== c && texte[i] !== '\n') i += texte[i] === '\\' ? 2 : 1;
      if (texte[i] !== c) return { incomplet: true };
      i++; dernier = c; continue;
    }
    if (c === '`') {
      const etiquette = /(?:^|[^\w$.])html$/.test(avant(i));
      code[i] = '`'; pile.push({ t: 'tpl', debut: i, etiquette, aInterp: false, aBalise: false }); i++; continue;
    }
    if (c === '/') {
      const regexPossible = dernier === '' || '(,=:[!&|?{};+-*%<>~^'.includes(dernier) || MOTS_AVANT_REGEX.test(avant(i));
      if (regexPossible) {
        let k = i + 1, classe = false;
        while (k < n && texte[k] !== '\n') {
          if (texte[k] === '\\') { k += 2; continue; }
          if (texte[k] === '[') classe = true; else if (texte[k] === ']') classe = false;
          else if (texte[k] === '/' && !classe) break;
          k++;
        }
        if (texte[k] !== '/') return { incomplet: true };
        k++; while (/[a-z]/.test(texte[k] || '')) k++;
        i = k; dernier = '/'; continue;
      }
    }
    if (ctx.t === 'interp') {
      if (c === '{') ctx.acc++;
      else if (c === '}') {
        if (ctx.acc === 0) { code[i] = '}'; pile.pop(); dernier = '}'; i++; continue; }
        ctx.acc--;
      }
    }
    code[i] = c; if (!/\s/.test(c)) dernier = c; i++;
  }
  return pile.length === 1 ? { code: code.join(''), gabarits } : { incomplet: true };
}

/** Position du début de l'argument numéro `rang` d'un appel dont la parenthèse ouvrante est en `ouvrante` ; -1 s'il n'existe pas. */
function debutArgument(code, ouvrante, rang) {
  let profondeur = 0, courant = 0, debut = ouvrante + 1;
  for (let i = ouvrante; i < code.length; i++) {
    const c = code[i];
    if ('([{'.includes(c)) profondeur++;
    else if (')]}'.includes(c)) { if (--profondeur === 0) return courant === rang ? debut : -1; }
    else if (c === ',' && profondeur === 1) { courant++; if (courant === rang) debut = i + 1; }
  }
  return -1;
}

/** Fin de l'expression qui commence en `debut` : le « ; » ou la parenthèse fermante de niveau zéro. */
function finExpression(code, debut) {
  let profondeur = 0;
  for (let i = debut; i < code.length; i++) {
    const c = code[i];
    if ('([{'.includes(c)) profondeur++;
    else if (')]}'.includes(c)) { if (--profondeur < 0) return i; }
    else if ((c === ';' || c === ',') && profondeur === 0) return i;
  }
  return code.length;
}

export function verifierEchappement(texte, fichier, permis = ECHAPPEMENT_PERMIS) {
  const erreurs = [];
  const signaler = (position, message) => erreurs.push({ fichier, ligne: lignesAvant(texte, position) + 1, message });
  const lu = lireJs(texte);
  if (lu.incomplet) { erreurs.push({ fichier, ligne: null, message: 'could not read this file to the end (a string, a regular expression or a template the check does not understand): it cannot vouch for it (spec 005, S3)' }); return erreurs; }
  const { code, gabarits } = lu;
  const siens = permis.filter(p => p.fichier === fichier), utilises = new Set();
  // html`…` doit être TOUT le côté droit : un « + texte » ou un « .concat(…) » derrière le gabarit remettrait une chaîne brute dans le balisage.
  const inerte = debut => {
    if (/^raw\(/.test(code.slice(debut))) return true;
    if (!code.startsWith('html`', debut)) return false;
    const g = gabarits.find(x => x.debut === debut + 4);
    return !!g && /^\s*(?:[;),}\]]|$)/.test(code.slice(g.fin + 1));
  };
  const admis = (debut, fin) => {
    const expression = texte.slice(debut, fin).replace(/\s+/g, ' ').trim();
    const entree = siens.find(p => p.expression === expression);
    if (entree) utilises.add(entree);
    return !!entree;
  };
  const puits = (position, nom, debut) => {
    if (debut < 0) { signaler(position, `${nom}: the argument that carries the markup was not found`); return; }
    const d = debut + code.slice(debut).match(/^\s*/)[0].length;
    if (inerte(d) || admis(d, finExpression(code, d))) return;
    signaler(position, `${nom} receives something other than html\`…\` or raw(…): a dynamic value would be read as markup (spec 005, S1). Write html\`…\`, or add an allow-list entry with its reason`);
  };
  for (const m of code.matchAll(/\.(innerHTML|outerHTML|srcdoc)\s*\+?=(?!=)/g)) puits(m.index, `.${m[1]} =`, m.index + m[0].length);
  for (const m of code.matchAll(/\.insertAdjacentHTML\s*\(/g)) puits(m.index, '.insertAdjacentHTML(…)', debutArgument(code, m.index + m[0].length - 1, 1));
  for (const m of code.matchAll(/\bdocument\s*\.\s*(write|writeln)\s*\(/g)) puits(m.index, `document.${m[1]}(…)`, debutArgument(code, m.index + m[0].length - 1, 0));
  for (const m of code.matchAll(/\.(createContextualFragment|parseFromString)\s*\(/g)) puits(m.index, `.${m[1]}(…)`, debutArgument(code, m.index + m[0].length - 1, 0));
  for (const m of code.matchAll(/\bnew\s+DOMParser\b/g)) signaler(m.index, 'new DOMParser parses markup: it is not allowed (spec 005, S3)');
  for (const g of gabarits) {
    if (g.aBalise && g.aInterp && !g.etiquette) signaler(g.debut, 'a template that holds markup and a ${…} is not tagged html: a dynamic value pasted in it would be read as markup (spec 005, S1)');
  }
  for (const m of code.matchAll(/(?<![\w$.])raw\s*\(/g)) {
    const f = finExpression(code, m.index + m[0].length);
    const expression = texte.slice(m.index, f + 1).replace(/\s+/g, ' ').trim();
    const entree = siens.find(p => p.expression === expression);
    if (entree) utilises.add(entree); else signaler(m.index, 'raw(…) marks text as authored markup and is not on the allow-list: give a reason or use html`…` (spec 005, S3)');
  }
  for (const p of siens) if (!utilises.has(p)) erreurs.push({ fichier, ligne: null, message: `the allow-list entry "${p.expression}" matches nothing in this file: a stale entry, remove it (spec 005, S3)` });
  return erreurs;
}
