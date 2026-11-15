// T-03 : l'aide commune rend les exécutions reproductibles.
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed, stepSeconds } from './helpers/page.mjs';

// Lance le scénario A et avance de 60 s simulées ; rend le journal complet et l'identifiant du véhicule léger.
async function jouerScenarioA(page, graine) {
  await pauseAndSeed(page, graine);
  await page.evaluate(() => window.__sim.scenario('A'));
  await stepSeconds(page, 60);
  return page.evaluate(() => ({
    log: JSON.stringify(window.__sim.sim.log),
    ids: window.__sim.sim.lvs.filter(l => l.ai).map(l => l.id),
    scenario: window.__sim.sim.log.some(e => e.code === 'SCENARIO'),
  }));
}

test('two runs on the same page give identical logs and vehicle identifiers', async ({ page }) => {
  await openPage(page, 'fr');
  const a = await jouerScenarioA(page, 7);
  const b = await jouerScenarioA(page, 7);
  expect(a.scenario, 'the scenario should have started within 60 s').toBe(true);
  expect(a.ids.length, 'a light vehicle should exist').toBe(1);
  expect(b.ids).toEqual(a.ids);
  expect(b.log).toBe(a.log);
});

test('two runs on freshly loaded pages give identical logs and vehicle identifiers', async ({ page, browser }) => {
  await openPage(page, 'en');
  const a = await jouerScenarioA(page, 7);
  const autre = await browser.newPage();
  await openPage(autre, 'en');
  const b = await jouerScenarioA(autre, 7);
  await autre.close();
  expect(b.ids).toEqual(a.ids);
  expect(b.log).toBe(a.log);
});

test('the seed really drives the random draws', async ({ page }) => {
  await openPage(page, 'fr');
  const ids = new Set();
  for (const graine of [1, 2, 3, 4, 5, 6]) ids.add((await jouerScenarioA(page, graine)).ids[0]);
  expect(ids.size, 'different seeds should give different vehicle identifiers').toBeGreaterThan(1);
});

test('the helper blocks the network and records what happened', async ({ page }) => {
  const journal = await openPage(page, 'fr');
  expect(journal.requetes.some(u => u.startsWith('file:')), 'index.html itself is requested').toBe(true);
  expect(journal.bloquees.length, 'Google Fonts requests are blocked').toBeGreaterThan(0);
  expect(journal.bloquees.every(u => /^https?:/.test(u)), 'only external requests are blocked').toBe(true);
  expect(journal.erreursPage, 'no page error').toEqual([]);
});
