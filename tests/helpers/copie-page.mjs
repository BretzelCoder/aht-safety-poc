// Copies de la page dans un dossier temporaire (spec 003) : ce que contient un téléchargement du dépôt.
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
 * Spec 004 : la CSP de la page est épinglée par empreinte (base64 du SHA-256 du contenu de chaque
 * script en ligne, comme le navigateur le calcule après normalisation CRLF → LF). Toute copie qui
 * touche un script en ligne (les copies cassées ajoutent une entrée au manifeste ou un enregistrement)
 * invalide son empreinte : la politique de la copie est recalée ici SUR la liste complète de ses
 * propres scripts, qui restent les siens. Les clefs (fonts, gc.zgo.at) ne bougent jamais.
 */
export function recalageCsp(texte) {
  const meta = /<meta[^>]*Content-Security-Policy[^>]*>/i.exec(texte);
  if (!meta) return texte;
  const scripts = [...texte.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1].replace(/\r\n/g, '\n'));
  if (!scripts.length) return texte;
  const empreintes = scripts.map(s => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`);
  const contenu = meta[0].match(/content\s*=\s*"([^"]*)"/i)[1];
  const politique = contenu.split(';').map(p => p.trim()).filter(Boolean).map(partie => {
    const [nom, ...sources] = partie.split(/\s+/);
    if (nom !== 'script-src') return [nom, ...sources].join(' ');
    const gardees = sources.filter(s => !/^'sha256-/.test(s));
    return ['script-src', ...gardees, ...empreintes].join(' ');
  }).join('; ');
  return texte.replace(meta[0], meta[0].replace(/content\s*=\s*"[^"]*"/i, `content="${politique}"`));
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
  writeFileSync(index, recalageCsp(modifierIndex ? modifierIndex(readFileSync(index, 'utf8')) : readFileSync(index, 'utf8')));
  return { dossier, index, fichiers };
}
