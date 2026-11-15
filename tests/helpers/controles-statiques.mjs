// Contrôles statiques : fonctions pures sur du texte, sans navigateur (spec 001, plan section 3).
// Chaque fonction rend la liste des erreurs trouvées ; une liste vide veut dire « conforme ».
import vm from 'node:vm';

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