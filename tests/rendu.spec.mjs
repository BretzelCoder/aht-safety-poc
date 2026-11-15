// T-08 : rendu dans les trois langues (S5), et ce que la page charge (S10 moitié exécution, AC-15).
import { test, expect } from '@playwright/test';
import { openPage } from './helpers/page.mjs';

// Textes attendus, écrits en dur : le test doit détecter une traduction fausse, pas seulement une incohérence.
const LANGUES = {
  fr: { titre: 'Simulateur tombereau autonome', guide: 'Guide et explications', journal: 'Simulation démarrée' },
  en: { titre: 'Autonomous haul truck simulator', guide: 'Guide and explanations', journal: 'Simulation started' },
  de: { titre: 'Simulator autonomer Muldenkipper', guide: 'Anleitung und Erklärungen', journal: 'Simulation gestartet' },
};
const HOTES_POLICES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

for (const [lang, attendu] of Object.entries(LANGUES)) {
  test.describe(`T-08 rendering in ${lang}`, () => {
    test('loads without error and shows the interface and the log in that language', async ({ page }) => {
      const journal = await openPage(page, lang);
      await expect(page.locator('#log div').first()).toContainText(attendu.journal);
      await page.waitForTimeout(300); // laisse passer les erreurs tardives (minuteurs, images d'animation)

      expect(journal.erreursPage, `page errors in ${lang}`).toEqual([]);
      // Les polices bloquées (réseau coupé) font une erreur de console attendue : on ne garde que les autres.
      const autres = journal.erreursConsole.filter(e => !journal.bloquees.includes(e.url));
      expect(autres, `console errors in ${lang} other than the blocked fonts`).toEqual([]);

      expect(await page.evaluate(() => document.documentElement.lang), '<html lang>').toBe(lang);
      await expect(page).toHaveTitle(attendu.titre);
      await expect(page.locator('#bGuide')).toContainText(attendu.guide);
    });

    test('requests nothing but index.html and the blocked Google Fonts, and no analytics', async ({ page }) => {
      const journal = await openPage(page, lang);
      await page.waitForTimeout(300);

      const fichiers = journal.requetes.filter(u => u.startsWith('file:'));
      expect(fichiers.length, 'only index.html is requested from disk').toBe(1);
      expect(fichiers[0]).toContain('index.html');

      const externes = journal.requetes.filter(u => !u.startsWith('file:'));
      for (const u of externes) {
        expect(HOTES_POLICES, `unexpected external request: ${u}`).toContain(new URL(u).hostname);
      }
      const analytics = journal.requetes.filter(u => /gc\.zgo\.at|goatcounter\.com/.test(u));
      expect(analytics, 'nothing is requested from GoatCounter when opened from disk').toEqual([]);
      expect(await page.evaluate(() => typeof window.goatcounter), 'the analytics object is not defined').toBe('undefined');
    });
  });
}
