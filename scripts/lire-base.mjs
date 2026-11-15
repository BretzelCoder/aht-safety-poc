// Page de référence pour la comparaison de trajectoires (spec 003, plan 3.6) : développement uniquement.
//
// La page d'une révision git est `index.html` seule (avant le découpage) ou `index.html` plus les dossiers
// `css/` et `js/` (après). Ce module liste ces fichiers dans une révision et les recopie dans un dossier, tels quels,
// pour qu'on puisse ouvrir la page de référence depuis le disque comme la page de la branche.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const estFichierDePage = chemin => chemin === 'index.html' || /^(css|js)\/.+/.test(chemin);

/** Fichiers de la page dans la révision `base` du dépôt `racine` (index.html, css/…, js/…), triés. */
export function fichiersDeLaBase(base, racine) {
  const sortie = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', base], { cwd: racine, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  return sortie.split('\0').filter(Boolean).filter(estFichierDePage).sort();
}

/** Recopie ces fichiers dans `dossier` (même arborescence) et rend leur liste. */
export function extraireBase(base, racine, dossier) {
  const fichiers = fichiersDeLaBase(base, racine);
  if (!fichiers.includes('index.html')) throw new Error(`no index.html in ${base}`);
  for (const f of fichiers) {
    const cible = join(dossier, f);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, execFileSync('git', ['show', `${base}:${f}`], { cwd: racine, maxBuffer: 64 * 1024 * 1024 }));
  }
  return fichiers;
}
