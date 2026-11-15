// Empreintes de version des fichiers de la page (spec 003, plan 3.4, S13) : développement uniquement.
//
// Chaque fichier de la page porte, sur sa dernière ligne, une empreinte de huit caractères calculée sur son propre
// texte (fins de ligne ramenées à LF, ligne d'empreinte exclue). `index.html` liste les empreintes attendues (le
// manifeste). La page compare les deux au chargement : un fichier d'une autre version que `index.html` est détecté.
// Ce module ne fait que calculer, lire, écrire et vérifier ces lignes ; la page n'en a pas besoin pour fonctionner.
import { createHash } from 'node:crypto';

/** Ligne d'empreinte d'un script : `AHT.inscrire('js/x.js', '1a2b3c4d');` */
const LIGNE_JS = /^AHT\.inscrire\('([^']+)', '([0-9a-f]{8})'\);[ \t]*$/m;
/** Ligne d'empreinte d'une feuille de style : `:root { --aht-stamp: '1a2b3c4d'; }` */
const LIGNE_CSS = /^:root \{ --aht-stamp: '([0-9a-f]{8})'; \}[ \t]*$/m;

const lf = texte => texte.replace(/\r\n/g, '\n');
const estCss = chemin => chemin.endsWith('.css');

/** Texte sans sa ligne d'empreinte (et sans le saut de ligne qui la suit), fins de ligne LF. */
export function sansEmpreinte(texte, chemin) {
  const re = estCss(chemin) ? LIGNE_CSS : LIGNE_JS;
  return lf(texte).replace(new RegExp(re.source + '\\n?', 'm'), '');
}

/** Empreinte du fichier : huit caractères hexadécimaux du SHA-256 de son texte sans la ligne d'empreinte. */
export function empreinteDe(texte, chemin) {
  // Les sauts de ligne finaux sont ramenés à un seul : ajouter la ligne d'empreinte ne change pas l'empreinte.
  const corps = sansEmpreinte(texte, chemin).replace(/\n*$/, '\n');
  return createHash('sha256').update(corps).digest('hex').slice(0, 8);
}

/** Empreinte écrite dans le fichier, ou null s'il n'a pas de ligne d'empreinte. */
export function lireEmpreinte(texte, chemin) {
  const m = (estCss(chemin) ? LIGNE_CSS : LIGNE_JS).exec(lf(texte));
  return m ? m[estCss(chemin) ? 1 : 2] : null;
}

/** Écrit (remplace ou ajoute en dernière ligne) la ligne d'empreinte ; garde les fins de ligne du fichier. */
export function ecrireEmpreinte(texte, chemin, valeur) {
  const crlf = texte.includes('\r\n');
  const ligne = estCss(chemin) ? `:root { --aht-stamp: '${valeur}'; }` : `AHT.inscrire('${chemin}', '${valeur}');`;
  const sans = sansEmpreinte(texte, chemin).replace(/\n*$/, '\n');
  const neuf = sans + ligne + '\n';
  return crlf ? neuf.replace(/\n/g, '\r\n') : neuf;
}

/** Manifeste de index.html : les lignes `'chemin': 'empreinte',` du bloc `attendu: { … }`. */
export function lireManifeste(html) {
  const l = lf(html).split('\n');
  const d = l.findIndex(x => /^\s*attendu:\s*\{\s*$/.test(x));
  if (d < 0) return null;
  const manifeste = new Map();
  for (let i = d + 1; i < l.length && !/^\s*\},?\s*$/.test(l[i]); i++) {
    const m = /^\s*'([^']+)':\s*'([0-9a-f]{8})',?\s*$/.exec(l[i]);
    if (m) manifeste.set(m[1], m[2]);
  }
  return manifeste;
}

/** Réécrit le bloc `attendu: { … }` de index.html avec ce manifeste (même ordre que la Map). */
export function ecrireManifeste(html, manifeste) {
  const crlf = html.includes('\r\n');
  const l = lf(html).split('\n');
  const d = l.findIndex(x => /^\s*attendu:\s*\{\s*$/.test(x));
  if (d < 0) throw new Error('index.html has no `attendu: {` block to hold the manifest');
  let f = d + 1;
  while (f < l.length && !/^\s*\},?\s*$/.test(l[f])) f++;
  const indent = (/^(\s*)attendu/.exec(l[d]) ?? ['', ''])[1] + '  ';
  const lignes = [...manifeste].map(([chemin, v]) => `${indent}'${chemin}': '${v}',`);
  l.splice(d + 1, f - d - 1, ...lignes);
  const neuf = l.join('\n');
  return crlf ? neuf.replace(/\n/g, '\r\n') : neuf;
}

/**
 * Contrôle : `fichiers` = [{ chemin, texte }] (les fichiers propres de la page), `manifeste` = Map lue dans index.html.
 * Rend la liste des écarts ; vide quand chaque empreinte est celle de son fichier et le manifeste la même.
 */
export function verifierEmpreintes(fichiers, manifeste) {
  const erreurs = [];
  const err = (fichier, message) => erreurs.push({ fichier, ligne: null, message });
  if (!manifeste) { err('index.html', 'no manifest found (`attendu: {` block of window.AHT)'); return erreurs; }
  for (const { chemin, texte } of fichiers) {
    const ecrite = lireEmpreinte(texte, chemin), calculee = empreinteDe(texte, chemin);
    if (ecrite === null) err(chemin, 'has no stamp line: run `node scripts/stamps.mjs`');
    else if (ecrite !== calculee) err(chemin, `its stamp ${ecrite} is stale (the file hashes to ${calculee}): run \`node scripts/stamps.mjs\``);
    if (!manifeste.has(chemin)) err('index.html', `the manifest does not list ${chemin}`);
    else if (ecrite !== null && manifeste.get(chemin) !== ecrite) err('index.html', `the manifest says ${manifeste.get(chemin)} for ${chemin} but the file says ${ecrite}`);
  }
  const propres = new Set(fichiers.map(f => f.chemin));
  for (const chemin of manifeste.keys()) if (!propres.has(chemin)) err('index.html', `the manifest lists ${chemin}, which no tag of the page loads`);
  return erreurs;
}
