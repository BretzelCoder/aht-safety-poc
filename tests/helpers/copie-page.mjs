// Copies de la page dans un dossier temporaire (spec 003) : ce que contient un téléchargement du dépôt.
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readPage } from '../../scripts/read-page.mjs';

export const racine = fileURLToPath(new URL('../..', import.meta.url));

/** Les fichiers de la page que git suit (comme dans un téléchargement du dépôt) ; à défaut de git, ceux des balises. */
export function fichiersSuivis() {
  try {
    return execFileSync('git', ['ls-files', 'index.html', 'css', 'js'], { cwd: racine }).toString().split('\n').filter(Boolean);
  } catch {
    return ['index.html', ...readPage(racine).fichiers];
  }
}

/**
 * Copie ces fichiers dans un dossier temporaire, sauf ceux de `sauf` ; `modifierIndex(texte)` change index.html de la
 * copie. Rend { dossier, index, fichiers } où `fichiers` est la liste des chemins copiés.
 */
export function telecharger(sauf = [], modifierIndex = null) {
  const dossier = mkdtempSync(join(tmpdir(), 'aht-copie-'));
  const fichiers = [];
  for (const f of fichiersSuivis()) {
    if (sauf.includes(f)) continue;
    mkdirSync(dirname(join(dossier, f)), { recursive: true });
    copyFileSync(join(racine, f), join(dossier, f));
    fichiers.push(f);
  }
  const index = join(dossier, 'index.html');
  if (modifierIndex) writeFileSync(index, modifierIndex(readFileSync(index, 'utf8')));
  return { dossier, index, fichiers };
}
