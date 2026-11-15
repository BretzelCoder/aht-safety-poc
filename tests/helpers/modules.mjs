// Chargement d'un module de la page tout seul (spec 003, S11 et AC-13), sans navigateur : les fichiers du module et des
// modules plus bas qu'il appelle sont exécutés, dans l'ordre des balises de index.html, dans un contexte `node:vm` nu
// (ni `document`, ni `window`). Ce que le module appelle vers le haut (l'état de la simulation, le journal, le message
// éphémère…) est remplacé par des doublures déclarées par le test. Jamais de fichier de dessin ni d'écran.
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readPage, lireTexte } from '../../scripts/read-page.mjs';

const racine = fileURLToPath(new URL('../..', import.meta.url));

// Même générateur pseudo-aléatoire que les tests dans le navigateur (mulberry32).
function fabriquerHasard(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `fichiers` : chemins relatifs, qui doivent être des fichiers propres de la page et rester dans l'ordre des balises ;
 * `doubles` : objets déclarés dans le contexte avant le chargement (par exemple `{ sim: { t: 0 }, logEv: () => {} }`) ;
 * `graine` : graine du hasard. Rend { executer(code), lire(expression) } : `executer` lance du code dans le contexte
 * (les `const` et `function` de haut niveau des fichiers y sont visibles), `lire` rend la valeur d'une expression.
 */
export function chargerModule(fichiers, { doubles = {}, graine = 1 } = {}) {
  const tags = readPage(racine).fichiers;
  let precedent = -1;
  for (const f of fichiers) {
    const i = tags.indexOf(f);
    if (i < 0) throw new Error(`${f} is not one of the page's own files (tags of index.html)`);
    if (i < precedent) throw new Error(`${f} is listed out of order: the files must follow the order of the tags of index.html`);
    precedent = i;
  }
  const contexte = vm.createContext({ console, AHT: { inscrire() {} }, ...doubles });
  vm.runInContext('Math', contexte).random = fabriquerHasard(graine);
  for (const f of fichiers) new vm.Script(lireTexte(racine + f), { filename: f }).runInContext(contexte);
  return {
    executer: code => vm.runInContext(code, contexte),
    lire: expression => vm.runInContext(`(${expression})`, contexte),
  };
}
