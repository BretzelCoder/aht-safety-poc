// T-15 : traductions complètes, moitié « exécution » (S4). Les scénarios et les invariants sont rejoués
// dans les trois langues, l'interface est redessinée à intervalles réguliers, et aucune clé ne doit manquer.
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed, stepSeconds } from './helpers/page.mjs';
import { executer } from './helpers/scenario.mjs';

const LANGUES = ['fr', 'en', 'de'];

/** Redessine l'interface et le plan (deux images d'animation), pour produire tous les textes de l'instant. */
const rendre = page => page.evaluate(() => {
  window.__sim.setLang(document.documentElement.lang);
  return new Promise(fin => requestAnimationFrame(() => requestAnimationFrame(fin)));
});
const manquantes = page => page.evaluate(() => [...window.__sim.i18nMissing]);

const regler = (mode, perte) => `const T = S.sim.trucks.find(x => x.id === L.cible); T.dds.mode = '${mode}'; T.dds.loss = ${perte};`;
// Les parcours rejoués : scénarios A à E (avec les deux issues de D et le watchdog de E) et coupure du réseau.
const PARCOURS = [
  ['scenario A', { scenario: 'A', apresLancement: 45 }],
  ['scenario B', { scenario: 'B', apresLancement: 45 }],
  ['scenario C', { scenario: 'C', apresLancement: 45 }],
  ['scenario D, order lost', { scenario: 'D', apresLancement: 45, auLancement: regler('EVENT_BE', 1) }],
  ['scenario D, periodic', { scenario: 'D', apresLancement: 45, auLancement: regler('PERIODIC', 0.5) }],
  ['scenario E, deadline then watchdog', { scenario: 'E', duree: 20, evenements: [{ t: 10, js: 'S.sim.trucks[0].can.load = 90;' }] }],
  ['network cut', { duree: 40, evenements: [{ t: 5, js: 'S.ENV.fms = false;' }] }],
];

for (const lang of LANGUES) {
  test.describe(`T-15 runtime translations in ${lang}`, () => {
    for (const [nom, options] of PARCOURS) {
      test(`no key is missing during ${nom}`, async ({ page }) => {
        await openPage(page, lang);
        await pauseAndSeed(page, 1);
        await executer(page, { ...options, rendre: 1 });
        await rendre(page);
        expect(await manquantes(page), `keys missing in ${lang} during ${nom}`).toEqual([]);
      });
    }

    test('no key is missing during the emergency stop sequence driven by the buttons', async ({ page }) => {
      await openPage(page, lang);
      await pauseAndSeed(page, 1);
      await stepSeconds(page, 5);
      await page.click('[data-fault="estop"]'); await stepSeconds(page, 3); await rendre(page);
      await stepSeconds(page, 10); await rendre(page);
      await page.click('[data-fault="estop"]'); await stepSeconds(page, 3); await rendre(page);
      await page.click('#bAck'); await stepSeconds(page, 3); await rendre(page);
      expect(await manquantes(page), `keys missing in ${lang} during the emergency stop sequence`).toEqual([]);
    });
  });
}

// Preuve, à chaque exécution, que le relevé détecte bien un texte absent dans la langue courante.
for (const [lang, indice] of [['en', 1], ['de', 2]]) {
  test(`the runtime record detects a dynamic message missing in ${lang}`, async ({ page }) => {
    await openPage(page, lang);
    await page.evaluate(i => { delete window.__sim.i18n.MSG['log.started'][i]; }, indice);
    await rendre(page); // le journal affiche « log.started » dans la langue courante
    expect(await manquantes(page)).toContain(`log.started (${lang})`);
  });
}
