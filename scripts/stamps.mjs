// Empreintes de version des fichiers de la page (spec 003, plan 3.4) : développement uniquement.
//
// Usage : node scripts/stamps.mjs            recalcule la ligne d'empreinte de chaque fichier propre de la page
//                                            et le manifeste de index.html (ne touche que ce qui a changé)
//         node scripts/stamps.mjs --check    ne fait que vérifier : code 1 et la liste des écarts si une empreinte est périmée
//         --racine DOSSIER                   autre racine que le dépôt (tests)
// La page fonctionne que ce script ait été lancé ou non ; une empreinte périmée affaiblit seulement la détection de
// versions mélangées, et `npm test` échoue dans ce cas.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPage } from './read-page.mjs';
import { empreinteDe, ecrireEmpreinte, lireManifeste, ecrireManifeste, verifierEmpreintes } from './empreintes.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--racine');
const racine = i >= 0 ? argv[i + 1].replace(/[\\/]?$/, '/') : fileURLToPath(new URL('..', import.meta.url));
const verifierSeulement = argv.includes('--check');

const { fichiers } = readPage(racine);
const lire = chemin => readFileSync(join(racine, chemin), 'utf8');
const propres = fichiers.map(chemin => ({ chemin, texte: lire(chemin) }));
const html = lire('index.html');

if (verifierSeulement) {
  const erreurs = verifierEmpreintes(propres, lireManifeste(html));
  if (erreurs.length) { for (const e of erreurs) console.log(`${e.fichier}: ${e.message}`); process.exit(1); }
  console.log(`stamps up to date (${propres.length} file${propres.length > 1 ? 's' : ''})`);
} else {
  const manifeste = new Map();
  let changes = 0;
  for (const { chemin, texte } of propres) {
    const valeur = empreinteDe(texte, chemin);
    const neuf = ecrireEmpreinte(texte, chemin, valeur);
    if (neuf !== texte) { writeFileSync(join(racine, chemin), neuf); changes++; }
    manifeste.set(chemin, valeur);
  }
  const htmlNeuf = ecrireManifeste(html, manifeste);
  if (htmlNeuf !== html) { writeFileSync(join(racine, 'index.html'), htmlNeuf); changes++; }
  console.log(changes ? `stamps rewritten (${changes} file${changes > 1 ? 's' : ''} changed)` : 'stamps already up to date');
}
