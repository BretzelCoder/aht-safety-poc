// Comparaison de l'affichage du HUD entre `main` et la branche courante (spec 005, S2 et AC-4).
// Développement uniquement : ne fait pas partie de `npm test` et n'est jamais chargé par la page.
//
// Usage : node scripts/compare-hud.mjs [--base main] [--secondes 40] [--pas 1] [--branche chemin/vers/index.html]
//
// Pour chaque cas (sans scénario, puis les scénarios A à G ; F et G après 15 s de roulage) et dans chacune des trois langues,
// la page de référence (`git show <base>:…`) et la page de la branche rejouent la même simulation avec le même générateur
// pseudo-aléatoire. Toutes les `--pas` secondes, pour chaque tombereau sélectionné et pour les deux vues de la carte
// (oscilloscope, niveaux 1 ↔ 2), on relit le DOM sérialisé (innerHTML) de chaque panneau du HUD et on compare les deux pages
// caractère pour caractère. Rend 0 si tout est identique, 1 à la première différence (cas, instant, vue, panneau, extrait).
// `--branche` compare une autre copie de la page (elle sert à prouver que le script voit une différence : copie volontairement cassée).
import { chromium } from '@playwright/test';
import { extraireBase } from './lire-base.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i >= 0 ? process.argv[i + 1] : defaut; };
const base = arg('--base', 'main');
const secondes = Number(arg('--secondes', 40));
const pas = Number(arg('--pas', 1));
const racine = fileURLToPath(new URL('..', import.meta.url));
const PANNEAUX = ['#tabs', '#statePill', '#stateSub', '#appliedLine', '#reasons', '#formula', '#tlat', '#metrics', '#cmp', '#chips', '#log', '#blkL1', '#blkL2', '#exL12'];

// Même générateur que tests/helpers/page.mjs (mulberry32), installé avant le script de la page.
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

// Rejoue un cas dans la page et rend, à chaque instant demandé, le DOM sérialisé des panneaux (dans le navigateur).
function capturer({ graine, scenario, secondes, avant, pas, panneaux }) {
  const S = window.__sim, dt = 0.02, sorties = [];
  S.ENV.paused = true; window.__reseed(graine); S.resetSim(); S.setSel(0);
  const prendre = instant => {
    for (const vue of ['scope', 'L12']) {
      showSideTab(vue);
      for (let i = 0; i < S.sim.trucks.length; i++) {
        S.setSel(i); logDirty = true; hud();
        const dom = {};
        for (const p of panneaux) dom[p] = document.querySelector(p).innerHTML;
        sorties.push({ lieu: `t = ${instant} s, ${vue === 'scope' ? 'oscilloscope' : 'levels 1-2'} view, truck ${i + 1}`, dom });
      }
    }
    S.setSel(0); showSideTab('scope');
  };
  const n = Math.round(secondes / dt), nAvant = Math.round((avant || 0) / dt), cadence = Math.round(pas / dt);
  if (!nAvant && scenario) S.scenario(scenario);
  for (let i = 0; i < n; i++) {
    if (nAvant && i === nAvant && scenario) S.scenario(scenario);
    S.step();
    if ((i + 1) % cadence === 0) prendre(((i + 1) * dt).toFixed(0));
  }
  return sorties;
}

function comparer(cas, a, b) {
  if (a.length !== b.length) return `${cas}: ${a.length} captures on ${base}, ${b.length} on the branch`;
  for (let k = 0; k < a.length; k++) {
    for (const p of PANNEAUX) {
      const x = a[k].dom[p], y = b[k].dom[p];
      if (x === y) continue;
      let i = 0; while (i < x.length && x[i] === y[i]) i++;
      const extrait = s => JSON.stringify(s.slice(Math.max(0, i - 30), i + 50));
      return `${cas}, ${a[k].lieu}, panel ${p}, first difference at character ${i}:\n  ${base}:   ${extrait(x)}\n  branch: ${extrait(y)}`;
    }
  }
  return null;
}

// Page de référence : les fichiers de la page dans la révision de base, recopiés dans un dossier temporaire.
const dossier = mkdtempSync(join(tmpdir(), 'aht-base-'));
const fichiersBase = extraireBase(base, racine, dossier);
const urlBase = pathToFileURL(join(dossier, 'index.html')).href;
const urlBranche = pathToFileURL(arg('--branche', null) ? resolve(arg('--branche')) : join(racine, 'index.html')).href;

const cas = [{ nom: 'no scenario', scenario: null }, ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(sc => ({ nom: `scenario ${sc}`, scenario: sc, avant: ['F', 'G'].includes(sc) ? 15 : 0 }))];

async function ouvrir(browser, url, lang) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route(u => !u.protocol.startsWith('file'), r => r.abort());
  await page.addInitScript(installerHasard, 1);
  await page.goto(`${url}?lang=${lang}`);
  await page.waitForFunction(() => window.__sim && window.__sim.sim, undefined, { timeout: 8000 });
  return page;
}

const browser = await chromium.launch();
let difference = null, captures = 0;
try {
  for (const lang of ['fr', 'en', 'de']) {
    const pageBase = await ouvrir(browser, urlBase, lang), pageBranche = await ouvrir(browser, urlBranche, lang);
    for (const c of cas) {
      const arg1 = { graine: 1, scenario: c.scenario, secondes, avant: c.avant, pas, panneaux: PANNEAUX };
      const a = await pageBase.evaluate(capturer, arg1);
      const b = await pageBranche.evaluate(capturer, arg1);
      captures += a.length;
      difference = comparer(`${lang}, ${c.nom}`, a, b);
      if (difference) break;
    }
    await pageBase.close(); await pageBranche.close();
    if (difference) break;
  }
} finally {
  await browser.close();
}
if (difference) { console.log(`DIFFERENT — ${difference}`); process.exit(1); }
console.log(`identical — ${cas.length} cases (no scenario, scenarios A to G) in 3 languages, ${captures} captures of ${PANNEAUX.length} panels (serialised DOM, both views, every truck) over ${secondes} s every ${pas} s, compared with ${base} (${fichiersBase.length} file${fichiersBase.length > 1 ? 's' : ''} of the page).`);
