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
 *  - `html` : le texte de index.html lui-même : ses balises, mais aussi ses scripts en ligne, son balisage (images, cadres…)
 *    et ses styles en ligne sont regardés (revue de la spec 003, G4) ;
 *  - `fichiers` : [{ chemin, texte }] des fichiers propres, scripts (.js) et feuille de style (.css) ;
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
  // Adresse hors du dépôt, sauf Google Fonts.
  const externe = adresse => {
    if (!/^(https?:)?\/\//i.test(adresse.trim())) return false;
    try { return !HOTES_POLICES.includes(new URL(adresse.trim().replace(/^\/\//, 'https://')).hostname); } catch { return true; }
  };
  const ligneDe = (texte, position) => texte.slice(0, position).split('\n').length;
  const appelsReseau = (chemin, texte, decalage = 0) => {
    texte.split('\n').forEach((ligne, i) => {
      if (!APPELS_RESEAU.test(ligne)) return;
      const autorise = chemin === 'js/analytics.js' && /gc\.zgo\.at/.test(ligne);
      if (!autorise) erreurs.push({ fichier: chemin, ligne: i + 1 + decalage, message: `makes the page load or send something (${ligne.trim().slice(0, 70)}): only js/analytics.js may, and only to gc.zgo.at` });
    });
  };
  const regles = (chemin, texte, decalage = 0) => {
    for (const m of texte.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
      if (externe(m[1])) erreurs.push({ fichier: chemin, ligne: ligneDe(texte, m.index) + decalage, message: `@import ${m[1]}: a style loads from outside the repository` });
    }
    for (const m of texte.matchAll(/url\(\s*["']?([^"')\s]+)/gi)) {
      if (externe(m[1])) erreurs.push({ fichier: chemin, ligne: ligneDe(texte, m.index) + decalage, message: `url(${m[1]}): a style loads from outside the repository` });
    }
  };
  for (const { chemin, texte } of fichiers) {
    if (chemin.endsWith('.css')) regles(chemin, texte);
    else appelsReseau(chemin, texte);
  }
  // index.html lui-même : scripts en ligne, blocs de style, styles en ligne, ressources du balisage.
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue;
    appelsReseau('index.html', m[2], ligneDe(html, m.index + m[0].indexOf('>') + 1) - 1);
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) regles('index.html', m[1], ligneDe(html, m.index));
  for (const m of html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)) regles('index.html', m[1], ligneDe(html, m.index) - 1);
  for (const m of html.matchAll(/<(?:img|iframe|frame|embed|object|source|audio|video|track|input)\b[^>]*?\b(?:src|data|poster)\s*=\s*["']([^"']+)["']/gi)) {
    if (externe(m[1])) err('index.html', `line ${ligneDe(html, m.index)}: the markup loads ${m[1]} from outside the repository`);
  }
  let scripts = {};
  try { scripts = JSON.parse(pkg).scripts ?? {}; } catch { err('package.json', 'unreadable'); }
  for (const nom of Object.keys(scripts)) {
    if (!SCRIPTS_PACKAGE.includes(nom)) err('package.json', `the script "${nom}" is not one of the test commands (${SCRIPTS_PACKAGE.join(', ')}): the page has no build step`);
  }
  return erreurs;
}
