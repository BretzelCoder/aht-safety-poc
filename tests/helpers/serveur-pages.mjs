// Répétition de GitHub Pages (spec 003, plan 3.8) : un petit serveur local qui reproduit ce qui peut casser une page
// découpée sans casser les autres tests : le sous-chemin du site, la casse des noms de fichiers (Linux), les types
// MIME, et le fait que seuls les fichiers suivis par git existent sur le site publié.
import http from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
export const SOUS_CHEMIN = '/aht-safety-poc/';

/**
 * Sert le dossier `racine` uniquement sous `prefixe` ; `suivis` (un Set de chemins relatifs) limite les fichiers
 * servis à ceux que git suit ; null les sert tous. Un chemin hors du préfixe, une casse qui diffère du disque ou un
 * fichier non suivi répondent 404, comme sur le site publié. Rend { url, origine, requetes, fermer }.
 */
export async function demarrerServeur(racine, { prefixe = SOUS_CHEMIN, suivis = null } = {}) {
  const requetes = [];
  // Chemin réel si chaque segment existe avec exactement cette casse (le disque de Windows l'ignorerait).
  const reel = relatif => {
    let dossier = racine;
    for (const segment of relatif.split('/')) {
      let noms;
      try { noms = readdirSync(dossier); } catch { return null; }
      if (!noms.includes(segment)) return null;
      dossier = join(dossier, segment);
    }
    return dossier;
  };
  const serveur = http.createServer((req, res) => {
    const reponse = (code, corps = '', type = 'text/plain') => { requetes.push({ chemin: req.url, code }); res.writeHead(code, { 'content-type': type }); res.end(corps); };
    let chemin;
    try { chemin = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { return reponse(400); }
    if (!chemin.startsWith(prefixe)) return reponse(404, 'outside the site path');
    let relatif = chemin.slice(prefixe.length) || 'index.html';
    if (relatif.endsWith('/')) relatif += 'index.html';
    if (relatif.split('/').some(s => s === '..' || s === '')) return reponse(404);
    const complet = reel(relatif);
    if (!complet || !statSync(complet).isFile()) return reponse(404, 'no such file (case-sensitive)');
    if (suivis && !suivis.has(relatif)) return reponse(404, 'not tracked by git');
    return reponse(200, readFileSync(complet), TYPES[extname(complet)] ?? 'application/octet-stream');
  });
  await new Promise(fin => serveur.listen(0, '127.0.0.1', fin));
  const origine = `http://127.0.0.1:${serveur.address().port}`;
  return {
    origine, url: origine + prefixe + 'index.html', requetes,
    fermer: () => new Promise(fin => { serveur.closeAllConnections?.(); serveur.close(fin); }),
  };
}
