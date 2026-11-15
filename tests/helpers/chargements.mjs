// Ce que la page charge depuis le disque ou le dépôt (spec 003, AC-9 et AC-16).
// Fonction pure : les adresses `file:` demandées par la page, et la liste des fichiers qu'elle a le droit de demander.

/**
 * `requetes` : les adresses demandées (seules les `file:` comptent) ; `attendus` : `index.html` plus les fichiers
 * propres de la page (chemins relatifs, dans l'ordre des balises). Rend les écarts : un fichier non prévu, un fichier
 * prévu jamais demandé, un fichier demandé plusieurs fois.
 */
export function verifierRequetes(requetes, attendus) {
  const erreurs = [];
  const err = (fichier, message) => erreurs.push({ fichier, ligne: null, message });
  const demandes = new Map(attendus.map(a => [a, 0]));
  for (const adresse of requetes.filter(u => u.startsWith('file:'))) {
    const chemin = decodeURIComponent(new URL(adresse).pathname);
    const prevu = attendus.find(a => chemin.endsWith('/' + a));
    if (!prevu) err(chemin.split('/').slice(-2).join('/'), 'was requested by the page but is not one of its own files');
    else demandes.set(prevu, demandes.get(prevu) + 1);
  }
  for (const [fichier, n] of demandes) {
    if (n === 0) err(fichier, 'is listed by the page but was never requested');
    else if (n > 1) err(fichier, `was requested ${n} times`);
  }
  return erreurs;
}

const HOTES_POLICES = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SCRIPTS_PACKAGE = ['test', 'test:browser', 'test:links'];
// Ce qui peut faire charger quelque chose depuis un script (spec 003, AC-9).
const APPELS_RESEAU = /\.src\s*=|\bfetch\s*\(|XMLHttpRequest|\bimport\s*\(|importScripts|new\s+Worker\s*\(|sendBeacon|new\s+WebSocket|new\s+Image\s*\(/;

/**
 * AC-9 : la page ne charge rien d'extérieur au dépôt sauf Google Fonts (les polices, par des balises) et GoatCounter
 * (seulement depuis js/analytics.js, sur le site publié) ; le dépôt ne contient aucun script de construction de la page.
 *  - `html` : le texte de index.html lui-même (balises) ; `fichiers` : [{ chemin, texte }] des fichiers propres ;
 *  - `pkg` : le texte de package.json.
 */
export function verifierChargements({ html, fichiers, pkg }) {
  const erreurs = [];
  const err = (fichier, message) => erreurs.push({ fichier, ligne: null, message });
  const relatif = adresse => !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(adresse);
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    if (!relatif(m[1])) err('index.html', `loads the script ${m[1]} from outside the repository`);
  }
  for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    if (relatif(m[1])) continue;
    let hote = '';
    try { hote = new URL(m[1]).hostname; } catch { /* adresse illisible : refusée */ }
    if (!HOTES_POLICES.includes(hote)) err('index.html', `links ${m[1]}, which is neither a file of the repository nor Google Fonts`);
  }
  for (const { chemin, texte } of fichiers) {
    texte.split('\n').forEach((ligne, i) => {
      if (!APPELS_RESEAU.test(ligne)) return;
      const autorise = chemin === 'js/analytics.js' && /gc\.zgo\.at/.test(ligne);
      if (!autorise) erreurs.push({ fichier: chemin, ligne: i + 1, message: `makes the page load or send something (${ligne.trim().slice(0, 70)}): only js/analytics.js may, and only to gc.zgo.at` });
    });
  }
  let scripts = {};
  try { scripts = JSON.parse(pkg).scripts ?? {}; } catch { err('package.json', 'unreadable'); }
  for (const nom of Object.keys(scripts)) {
    if (!SCRIPTS_PACKAGE.includes(nom)) err('package.json', `the script "${nom}" is not one of the test commands (${SCRIPTS_PACKAGE.join(', ')}): the page has no build step`);
  }
  return erreurs;
}
