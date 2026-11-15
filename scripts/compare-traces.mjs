// Comparaison de trajectoires entre `main` et la branche courante (spec 002, S2 et AC-1).
// Développement uniquement : ne fait pas partie de `npm test` et n'est jamais chargé par la page.
//
// Usage : node scripts/compare-traces.mjs [--base main] [--secondes 60] [--seeds 10]
//
// Pour chaque cas (graines 1 à N sans scénario, puis les scénarios A à E sur les graines 1 et 2), la page de
// référence (`git show <base>:index.html`) et la page de la branche rejouent la même simulation avec le même
// générateur pseudo-aléatoire, et l'on compare à chaque pas : position, vitesse, état du superviseur, mode
// appliqué, latence de réaction, distance à l'obstacle, puis le journal complet. Rend 0 si tout est identique,
// 1 à la première différence (cas, pas, tombereau, grandeur).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i >= 0 ? process.argv[i + 1] : defaut; };
const base = arg('--base', 'main');
const secondes = Number(arg('--secondes', 60));
const nbGraines = Number(arg('--seeds', 10));
const racine = fileURLToPath(new URL('..', import.meta.url));

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

// Rejoue un cas dans la page et rend la trace : une ligne de valeurs par pas, plus le journal final.
function rejouer({ graine, scenario, secondes, dt, noyau, avant }) {
  const S = window.__sim;
  S.ENV.paused = true; window.__reseed(graine); S.resetSim(); S.setSel(0);
  // Profil de noyau choisi par le visiteur (spec 003, AC-6) : posé avant le scénario, que F et G respectent.
  if (noyau) S.ENV.kernel = noyau;
  const n = Math.round(secondes / dt), trace = [];
  const nAvant = Math.round((avant || 0) / dt);   // F et G s'attaquent au tombereau le plus rapide : on laisse d'abord rouler
  if (!nAvant) { if (scenario === 'E') { S.scenario('E'); } else if (scenario) { S.scenario(scenario); } }
  for (let i = 0; i < n; i++) {
    if (nAvant && i === nAvant && scenario) S.scenario(scenario);
    S.step();
    const ligne = [];
    for (const T of S.sim.trucks) ligne.push(T.s, T.v, T.state, T.mc.applied, T.m.tLat, T.m.dObs, T.m.dStop, T.F, T.l2.vAccepted, T.l2.seq, T.l2.rejRun);
    for (const L of S.sim.lvs) ligne.push(L.x, L.y, L.v);
    trace.push(ligne);
  }
  const journal = S.sim.log.map(e => `${e.t.toFixed(2)} ${e.id} ${e.code}`);
  return { trace, journal, collisions: S.sim.collisions };
}

const NOMS = ['s', 'v', 'state', 'applied', 'tLat', 'dObs', 'dStop', 'F', 'vAccepted', 'seq', 'rejRun'];
function decrire(i) { return i < 3 * NOMS.length ? `AHT-0${Math.floor(i / NOMS.length) + 1}.${NOMS[i % NOMS.length]}` : `light vehicle value ${i - 3 * NOMS.length}`; }

function comparer(cas, a, b) {
  const pas = Math.min(a.trace.length, b.trace.length);
  for (let k = 0; k < pas; k++) {
    const x = a.trace[k], y = b.trace[k];
    const m = Math.max(x.length, y.length);
    for (let i = 0; i < m; i++) {
      if (!Object.is(x[i], y[i])) return `${cas}: first difference at step ${k + 1} (t = ${((k + 1) * 0.02).toFixed(2)} s), ${decrire(i)}: ${x[i]} on ${base}, ${y[i]} on the branch`;
    }
  }
  if (a.journal.join('\n') !== b.journal.join('\n')) {
    const ja = a.journal, jb = b.journal;
    const i = ja.findIndex((l, j) => l !== jb[j]);
    return `${cas}: the event logs differ at line ${i + 1}: "${ja[i]}" on ${base}, "${jb[i]}" on the branch`;
  }
  if (a.collisions !== b.collisions) return `${cas}: collisions differ (${a.collisions} on ${base}, ${b.collisions} on the branch)`;
  return null;
}

// Page de référence : le fichier de la base, copié dans un dossier temporaire.
const dossier = mkdtempSync(join(tmpdir(), 'aht-base-'));
const fichierBase = join(dossier, 'index.html');
writeFileSync(fichierBase, execFileSync('git', ['show', `${base}:index.html`], { cwd: racine, maxBuffer: 64 * 1024 * 1024 }));
const urlBase = pathToFileURL(fichierBase).href;
const urlBranche = pathToFileURL(join(racine, 'index.html')).href;

const cas = [];
for (let g = 1; g <= nbGraines; g++) cas.push({ nom: `seed ${g}, no scenario`, graine: g, scenario: null });
for (const sc of ['A', 'B', 'C', 'D', 'E']) for (const g of [1, 2]) cas.push({ nom: `seed ${g}, scenario ${sc}`, graine: g, scenario: sc });
// Scénarios F et G sous les deux profils de noyau (spec 003, AC-6 et règle A-14), lancés après 15 s de roulage.
for (const sc of ['F', 'G']) for (const noyau of ['RT', 'GP']) for (const g of [1, 2]) cas.push({ nom: `seed ${g}, scenario ${sc}, kernel ${noyau}`, graine: g, scenario: sc, noyau, avant: 15 });

async function ouvrir(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route(u => !u.protocol.startsWith('file'), r => r.abort());
  await page.addInitScript(installerHasard, 1);
  await page.goto(`${url}?lang=fr`);
  await page.waitForFunction(() => window.__sim && window.__sim.sim, undefined, { timeout: 8000 });
  return page;
}

const browser = await chromium.launch();
let difference = null;
try {
  const pageBase = await ouvrir(browser, urlBase), pageBranche = await ouvrir(browser, urlBranche);
  for (const c of cas) {
    const arg1 = { graine: c.graine, scenario: c.scenario, secondes, dt: 0.02, noyau: c.noyau, avant: c.avant };
    const a = await pageBase.evaluate(rejouer, arg1);
    const b = await pageBranche.evaluate(rejouer, arg1);
    difference = comparer(c.nom, a, b);
    if (difference) break;
  }
} finally {
  await browser.close();
}
if (difference) { console.log(`DIFFERENT — ${difference}`); process.exit(1); }
console.log(`identical — ${cas.length} cases of ${secondes} s at 0.02 s (${nbGraines} seeds without scenario, scenarios A to E on seeds 1 and 2, scenarios F and G on seeds 1 and 2 under both kernel profiles), compared with ${base}.`);
