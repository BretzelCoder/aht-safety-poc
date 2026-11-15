// Contrôles statiques : fonctions pures sur du texte, sans navigateur (spec 001, plan section 3).
// Chaque fonction rend la liste des erreurs trouvées ; une liste vide veut dire « conforme ».
import vm from 'node:vm';
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
const PHRASES_AVERTISSEMENT = ['not a safety tool', 'not affiliated'];
export function verifierAvertissement(readme, html) {
  const erreurs = [];
  const enTete = /<!--([\s\S]*?)-->/.exec(html);
  const cibles = [['README.md', readme], ['index.html', enTete ? enTete[1] : '']];
  for (const [fichier, texte] of cibles) {
    for (const phrase of PHRASES_AVERTISSEMENT) {
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
    for (const m of html.matchAll(/gc\.zgo\.at/g)) {
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