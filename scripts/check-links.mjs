// Vérification des liens externes (spec 001, S11) : README.md et attributs href de index.html.
// Sans dépendance (fetch intégré à Node). Un lien mort, lent ou qui refuse les robots produit un
// AVERTISSEMENT, jamais un échec : les sites tiers peuvent tomber sans que le projet y soit pour rien.
// Le code de sortie vaut donc toujours 0, sauf bug du script lui-même.
// Exception (action A-1, amendement de S11) : un refus 403 d'un hôte connu pour refuser les robots est
// « invérifiable », une ligne d'information et non un avertissement, pour qu'un vrai lien mort reste visible.
//
// Usage : node scripts/check-links.mjs              vérifie README.md et index.html
//         node scripts/check-links.mjs --only URL…  ne vérifie que ces adresses (tests, essais)
//         --timeout MS                              délai par lien, 15000 par défaut
//         --blocking-hosts H1,H2                    remplace la liste des hôtes qui refusent les robots (tests)
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPage } from './read-page.mjs';

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
 * Hôtes qui répondent 403 à toute requête automatique, quel que soit le lien (constat RE-1 de la spec 001) :
 * iso.org toujours, image-ppubs.uspto.gov depuis les serveurs de GitHub seulement (200 depuis un poste ordinaire).
 * La liste ne masque que le 403 : un 404, un délai dépassé ou une erreur réseau sur ces hôtes reste un avertissement.
 * À compléter seulement après avoir vérifié à la main que le lien répond dans un navigateur.
 */
export const HOTES_BLOQUEURS = ['www.iso.org', 'image-ppubs.uspto.gov'];

/**
 * Interroge chaque lien (une requête par lien, redirections suivies) et rend un résultat par lien :
 * { url, ok, statut, raison, inverifiable }. Ne lève jamais d'exception : un échec réseau est un résultat.
 * `inverifiable` : refus 403 d'un hôte de `hotesBloqueurs`, à rapporter comme information et non comme avertissement.
 */
export async function verifierLiens(urls, { delai = 15000, fetchImpl = fetch, parallele = 4, hotesBloqueurs = HOTES_BLOQUEURS } = {}) {
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
        const inverifiable = !ok && res.status === 403 && hotesBloqueurs.includes(new URL(url).hostname);
        resultats[i] = {
          url, ok, statut: res.status, inverifiable,
          raison: ok ? '' : `answered ${res.status}${bloque ? ' (the site may block automated checks)' : ''}`,
        };
      } catch (e) {
        const delaiDepasse = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
        resultats[i] = { url, ok: false, statut: null, inverifiable: false, raison: delaiDepasse ? `no answer within ${delai / 1000} s` : `network error: ${e && e.cause && e.cause.code ? e.cause.code : e && e.message}` };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallele, urls.length) }, travailleur));
  return resultats;
}

/** Ligne d'information d'un lien invérifiable (hôte qui refuse les robots) : ni avertissement ni annotation. */
export const formaterInverifiable = r => `  info ${r.statut}  ${r.url} (unverifiable: this host refuses automated requests, check it by hand)`;

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
  const h = argv.indexOf('--blocking-hosts');
  const hotesBloqueurs = h >= 0 ? argv[h + 1].split(',') : HOTES_BLOQUEURS;
  const urls = seul >= 0
    ? argv.slice(seul + 1).filter(a => /^https?:\/\//.test(a))
    : extraireLiens(readFileSync(`${racine}README.md`, 'utf8'), readPage(racine).html);

  console.log(`Checking ${urls.length} external links (warnings only, they never fail the run)…`);
  const resultats = await verifierLiens(urls, { delai, hotesBloqueurs });
  for (const r of resultats) if (r.ok) console.log(`  ok   ${r.statut}  ${r.url}`);
  const inverifiables = resultats.filter(r => r.inverifiable);
  for (const r of inverifiables) console.log(formaterInverifiable(r));
  const mauvais = resultats.filter(r => !r.ok && !r.inverifiable);
  for (const r of mauvais) console.log(formaterAvertissement(r, enCI));
  console.log(`${urls.length} links checked, ${mauvais.length} warning${mauvais.length === 1 ? '' : 's'}${inverifiables.length ? `, ${inverifiables.length} unverifiable` : ''}.`);
}

// Exécuté directement (et non importé par un test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).then(() => process.exit(0));
}
