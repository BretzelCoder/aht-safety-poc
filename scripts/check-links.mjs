// Vérification des liens externes (spec 001, S11) : README.md et attributs href de index.html.
// Sans dépendance (fetch intégré à Node). Un lien mort, lent ou qui refuse les robots produit un
// AVERTISSEMENT, jamais un échec : les sites tiers peuvent tomber sans que le projet y soit pour rien.
// Le code de sortie vaut donc toujours 0, sauf bug du script lui-même.
//
// Usage : node scripts/check-links.mjs              vérifie README.md et index.html
//         node scripts/check-links.mjs --only URL…  ne vérifie que ces adresses (tests, essais)
//         --timeout MS                              délai par lien, 15000 par défaut
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));

/**
 * Liens qu'un lecteur peut suivre, sans doublon, dans l'ordre d'apparition :
 *  - README (Markdown) : toutes les adresses http(s), sans la ponctuation finale qui n'en fait pas partie ;
 *  - page HTML : seulement les ancres `<a href>` du guide. Les `<link>` (polices, preconnect), le script
 *    GoatCounter et son point de collecte sont des ressources de la page, pas des liens à contrôler.
 */
export function extraireLiens(readme, html) {
  const vus = new Set();
  for (const m of readme.matchAll(/https?:\/\/[^\s)>\]"'<`]+/g)) vus.add(m[0].replace(/[.,;:!?]+$/, ''));
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) vus.add(m[1]);
  return [...vus];
}

/**
 * Interroge chaque lien (une requête par lien, redirections suivies) et rend un résultat par lien :
 * { url, ok, statut, raison }. Ne lève jamais d'exception : un échec réseau est un résultat.
 */
export async function verifierLiens(urls, { delai = 15000, fetchImpl = fetch, parallele = 4 } = {}) {
  const resultats = new Array(urls.length);
  let suivant = 0;
  async function travailleur() {
    while (suivant < urls.length) {
      const i = suivant++;
      const url = urls[i];
      try {
        const res = await fetchImpl(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(delai),
          headers: { 'user-agent': 'aht-safety-poc-link-check' },
        });
        await res.body?.cancel(); // le corps n'intéresse pas : on libère la connexion
        const ok = res.status < 400;
        const bloque = res.status === 403 || res.status === 429;
        resultats[i] = {
          url, ok, statut: res.status,
          raison: ok ? '' : `answered ${res.status}${bloque ? ' (the site may block automated checks)' : ''}`,
        };
      } catch (e) {
        const delaiDepasse = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
        resultats[i] = { url, ok: false, statut: null, raison: delaiDepasse ? `no answer within ${delai / 1000} s` : `network error: ${e && e.cause && e.cause.code ? e.cause.code : e && e.message}` };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallele, urls.length) }, travailleur));
  return resultats;
}

/** Texte d'un avertissement : annotation GitHub Actions dans la CI, ligne lisible en local. */
export function formaterAvertissement(r, enCI) {
  return enCI
    ? `::warning title=Dead link::${r.url} ${r.raison}`
    : `WARNING dead link: ${r.url} ${r.raison}`;
}

async function principal(argv) {
  const enCI = process.env.GITHUB_ACTIONS === 'true';
  const i = argv.indexOf('--timeout');
  const delai = i >= 0 ? Number(argv[i + 1]) : 15000;
  const seul = argv.indexOf('--only');
  const urls = seul >= 0
    ? argv.slice(seul + 1).filter(a => /^https?:\/\//.test(a))
    : extraireLiens(readFileSync(`${racine}README.md`, 'utf8'), readFileSync(`${racine}index.html`, 'utf8'));

  console.log(`Checking ${urls.length} external links (warnings only, they never fail the run)…`);
  const resultats = await verifierLiens(urls, { delai });
  for (const r of resultats) if (r.ok) console.log(`  ok   ${r.statut}  ${r.url}`);
  const mauvais = resultats.filter(r => !r.ok);
  for (const r of mauvais) console.log(formaterAvertissement(r, enCI));
  console.log(`${urls.length} links checked, ${mauvais.length} warning${mauvais.length === 1 ? '' : 's'}.`);
}

// Exécuté directement (et non importé par un test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).then(() => process.exit(0));
}
