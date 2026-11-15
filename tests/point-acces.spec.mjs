// T-02 : le point d'accès de test de la page expose les tables de traduction
// et note les clés introuvables, sans rien changer à ce que voit le visiteur.
import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pageUrl = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;

async function ouvrir(page, lang) {
  // Réseau coupé : seules les requêtes file:// passent (polices et GoatCounter bloqués).
  await page.route(url => !url.protocol.startsWith('file'), route => route.abort());
  await page.goto(`${pageUrl}?lang=${lang}`);
  await page.waitForFunction(() => window.__sim && window.__sim.sim);
}

test('window.__sim exposes the translation tables and the three languages', async ({ page }) => {
  await ouvrir(page, 'fr');
  const info = await page.evaluate(() => {
    const i = window.__sim.i18n;
    return {
      langs: i.LANGS,
      msgTriplet: i.MSG['log.started'],
      enKeys: Object.keys(i.STATIC.en).length,
      deKeys: Object.keys(i.STATIC.de).length,
      missingIsSet: window.__sim.i18nMissing instanceof Set,
    };
  });
  expect(info.langs).toEqual(['fr', 'en', 'de']);
  expect(info.msgTriplet, 'MSG entries are [fr, en, de] triplets').toHaveLength(3);
  expect(info.enKeys, 'STATIC.en should not be empty').toBeGreaterThan(10);
  expect(info.deKeys, 'STATIC.de should not be empty').toBeGreaterThan(10);
  expect(info.missingIsSet, 'i18nMissing should be a Set').toBe(true);
});

test('t() records an unknown key in i18nMissing', async ({ page }) => {
  await ouvrir(page, 'en');
  const res = await page.evaluate(() => {
    const { t } = window.__sim.i18n;
    const avant = [...window.__sim.i18nMissing];
    const rendu = t('cle.inexistante.pour.le.test');
    return { avant, rendu, apres: [...window.__sim.i18nMissing] };
  });
  expect(res.avant, 'no key should be missing right after loading').toEqual([]);
  expect(res.rendu, 'an unknown key is returned as is').toBe('cle.inexistante.pour.le.test');
  expect(res.apres).toContain('cle.inexistante.pour.le.test');
});

test('the French page looks and behaves as before', async ({ page }) => {
  await ouvrir(page, 'fr');
  await expect(page).toHaveTitle('Simulateur tombereau autonome');
  const premiere = page.locator('#log div').first();
  await expect(premiere).toContainText('Simulation démarrée');
});
