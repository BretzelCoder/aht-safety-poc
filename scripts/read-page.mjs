// Lecture de la page complète (spec 003, plan 3.7) : développement uniquement, jamais chargé par la page.
//
// La page est un `index.html` plus ses propres fichiers (feuille de style et scripts), appelés par des balises à
// chemin relatif. Les contrôles de texte (syntaxe, traductions, analytics, liens…) ont besoin de voir TOUT le code :
// `readPage` rend le texte de `index.html` dans lequel chaque balise de ces fichiers est remplacée par le contenu du
// fichier (`<script>…</script>`, `<style>…</style>`), fins de ligne LF. Rien n'est écrit : c'est une lecture, pas
// une construction. Les chargements externes (Google Fonts, GoatCounter) restent tels quels.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Chemin relatif du dépôt : ni schéma (`https:`), ni `//hôte`, ni chemin absolu. */
const estRelatif = chemin => !/^([a-z][a-z0-9+.-]*:|\/)/i.test(chemin) && !chemin.startsWith('#');

/** Texte d'un fichier, fins de ligne ramenées à LF. */
export const lireTexte = chemin => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');

const attribut = (balise, nom) => {
  const m = new RegExp(`\\b${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(balise);
  return m ? (m[1] ?? m[2]) : null;
};

/**
 * Fonction pure : `entree` est le texte de index.html (LF), `lire(chemin)` rend le texte (LF) d'un fichier propre.
 * Rend { html, fichiers, origine } :
 *  - html : la page reconstituée ;
 *  - fichiers : les chemins relatifs des fichiers propres, dans l'ordre des balises ;
 *  - origine(ligne) : { fichier, ligne } du fichier source d'une ligne (à partir de 1) de la page reconstituée.
 */
export function reconstituerPage(entree, lire) {
  entree = entree.replace(/\r\n/g, '\n');
  const fichiers = [], segments = [];
  const re = /<script\b[^>]*>\s*<\/script>|<link\b[^>]*>/gi;
  let html = '', curseur = 0, m;
  const lignesDe = texte => texte.split('\n').length;
  while ((m = re.exec(entree))) {
    const balise = m[0];
    let chemin = null, ouvre = null, ferme = null;
    if (/^<script/i.test(balise)) {
      const src = attribut(balise, 'src');
      if (src !== null && estRelatif(src)) { chemin = src; ouvre = '<script>'; ferme = '</script>'; }
    } else if (/\brel\s*=\s*["']?stylesheet/i.test(balise)) {
      const href = attribut(balise, 'href');
      if (href !== null && estRelatif(href)) { chemin = href; ouvre = '<style>'; ferme = '</style>'; }
    }
    if (chemin === null) continue;
    const texte = lire(chemin).replace(/\r\n/g, '\n');
    fichiers.push(chemin);
    html += entree.slice(curseur, m.index);
    const ligneBalise = lignesDe(html);            // la balise ouvrante tombera sur cette ligne
    html += `${ouvre}\n${texte.replace(/\n$/, '')}\n${ferme}`;
    segments.push({ chemin, debut: ligneBalise + 1, n: lignesDe(texte.replace(/\n$/, '')), ligneBalise, ajout: lignesDe(texte.replace(/\n$/, '')) + 1 });
    curseur = m.index + balise.length;
  }
  html += entree.slice(curseur);

  const origine = ligne => {
    let enPlus = 0;
    for (const s of segments) {
      if (ligne >= s.debut && ligne < s.debut + s.n) return { fichier: s.chemin, ligne: ligne - s.debut + 1 };
      if (ligne >= s.debut + s.n) enPlus += s.ajout;   // lignes ajoutées par ce fichier avant la ligne demandée
    }
    return { fichier: 'index.html', ligne: ligne - enPlus };
  };
  return { html, fichiers, origine };
}

/** Lit index.html et ses fichiers propres à partir de la racine du dépôt. */
export function readPage(racine) {
  const lire = chemin => {
    try { return lireTexte(join(racine, chemin)); }
    catch { throw new Error(`own file of the page not found: ${chemin} (named by a tag of index.html)`); }
  };
  return reconstituerPage(lire('index.html'), lire);
}
