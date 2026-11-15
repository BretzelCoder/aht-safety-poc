// Aide commune aux vérifications dans le navigateur (spec 001, plan section 3).
// Elle rend chaque test reproductible : hasard figé, réseau coupé, boucle d'animation en pause.
import { fileURLToPath, pathToFileURL } from 'node:url';

export const cheminPage = fileURLToPath(new URL('../../index.html', import.meta.url));
export const urlPage = pathToFileURL(cheminPage).href;

// Pas de la simulation, identique à la constante DT de index.html (50 Hz).
export const PAS = 0.02;

// Générateur pseudo-aléatoire (mulberry32) installé avant l'exécution du script de la page.
function installerHasard(graine) {
  let s = graine >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__reseed = n => { s = n >>> 0; };
}

/**
 * Ouvre index.html depuis le disque, dans la langue demandée.
 * Retourne le journal de ce qui s'est passé : requêtes, requêtes bloquées,
 * erreurs de la page et erreurs de la console.
 */
export async function openPage(page, lang = 'fr', { seed = 1, chemin = null } = {}) {
  const journal = { requetes: [], bloquees: [], erreursPage: [], erreursConsole: [] };
  page.on('request', r => journal.requetes.push(r.url()));
  page.on('pageerror', e => journal.erreursPage.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') journal.erreursConsole.push({ texte: m.text(), url: m.location().url });
  });
  await page.addInitScript(installerHasard, seed);
  // Réseau coupé : seules les requêtes file:// passent (polices et GoatCounter bloqués).
  await page.route(url => !url.protocol.startsWith('file'), route => {
    journal.bloquees.push(route.request().url());
    return route.abort();
  });
  // `chemin` : une copie de la page ailleurs (tests du chargement, spec 003) ; sinon index.html du dépôt.
  const url = chemin ? pathToFileURL(chemin).href : urlPage;
  await page.goto(`${url}?lang=${lang}`);
  // Une page cassée (erreur de syntaxe, exception au démarrage) ne définit jamais window.__sim : on échoue vite,
  // avec l'erreur de la page, au lieu d'attendre le délai du test (30 s) pour chacun des tests.
  // Depuis la spec 003, la garde de démarrage de la page note dans AHT.erreur les fichiers qui manquent, qui sont
  // d'une autre version ou chargés deux fois : on s'arrête aussitôt, en les nommant, sans attendre le délai.
  try {
    await page.waitForFunction(() => (window.__sim && window.__sim.sim) || (window.AHT && window.AHT.erreur), undefined, { timeout: 8000 });
  } catch {
    throw new Error(`the page did not start within 8 s (page errors: ${journal.erreursPage.join(' | ') || 'none'})`);
  }
  const refus = await page.evaluate(() => (window.AHT && window.AHT.erreur) || null);
  if (refus) throw new Error(`the page refused to start, files: ${refus}`);
  return journal;
}

/**
 * Met la boucle d'animation en pause, refixe le hasard, repart d'une simulation neuve
 * et sélectionne le tombereau 0. Les tirages ne dépendent alors plus du nombre
 * d'images affichées avant l'appel.
 */
export async function pauseAndSeed(page, seed = 1) {
  await page.evaluate(n => {
    window.__sim.ENV.paused = true;
    window.__reseed(n);
    window.__sim.resetSim();
    window.__sim.setSel(0);
  }, seed);
}

/** Avance la simulation de `secondes` secondes simulées, pas à pas. */
export async function stepSeconds(page, secondes) {
  await page.evaluate(([s, dt]) => {
    const n = Math.round(s / dt);
    for (let i = 0; i < n; i++) window.__sim.step();
  }, [secondes, PAS]);
}
