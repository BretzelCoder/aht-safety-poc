// Répétition de GitHub Pages avant la fusion (spec 003, plan 3.8, S5, S6, AC-8, AC-19) : la page servie en HTTP sous
// le sous-chemin du site, noms de fichiers en casse exacte, seuls les fichiers suivis par git, types MIME de Pages.
// Ce n'est qu'une répétition : le cache réel du réseau de diffusion et HTTPS restent à vérifier sur le site publié.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { executer } from './helpers/scenario.mjs';
import { demarrerServeur, SOUS_CHEMIN } from './helpers/serveur-pages.mjs';
import { racine, telecharger } from './helpers/copie-page.mjs';
import { readPage } from '../scripts/read-page.mjs';

/** Fichiers du dépôt que git suit, comme ce que publie GitHub Pages. */
const suivisDuDepot = () => new Set(execFileSync('git', ['ls-files'], { cwd: racine }).toString().split('\n').filter(Boolean));

// Le navigateur demande /favicon.ico tout seul ; hors du sous-chemin, comme sur le site publié, il n'y a rien.
const sansFavicon = liste => liste.filter(r => !String(r.chemin ?? r.url ?? '').endsWith('favicon.ico'));

test.describe('T-30 GitHub Pages rehearsal (spec 003, AC-8, AC-19)', () => {
  let serveur;
  test.beforeAll(async () => { serveur = await demarrerServeur(racine, { suivis: suivisDuDepot() }); });
  test.afterAll(async () => { await serveur.fermer(); });

  for (const lang of ['fr', 'en', 'de']) {
    test(`the page served under ${SOUS_CHEMIN} starts, every own file answers 200 once, no error, no analytics (${lang})`, async ({ page }) => {
      serveur.requetes.length = 0;
      const journal = await openPage(page, lang, { adresse: serveur.url });
      await page.waitForTimeout(300);
      expect(journal.erreursPage, `page errors in ${lang}`).toEqual([]);
      const autres = journal.erreursConsole.filter(e => !journal.bloquees.includes(e.url) && !e.url.endsWith('favicon.ico'));
      expect(autres, `console errors in ${lang} other than the blocked fonts`).toEqual([]);

      const demandes = sansFavicon(serveur.requetes);
      const attendus = ['index.html', ...readPage(racine).fichiers].map(f => SOUS_CHEMIN + f);
      expect(demandes.filter(r => r.code !== 200), 'every request of the page answers 200').toEqual([]);
      const chemins = demandes.map(r => r.chemin.split('?')[0]).sort();
      expect(chemins, 'the entry file and each own file, once each').toEqual([...attendus].sort());

      expect(await page.evaluate(() => typeof window.__sim.sim), 'the simulation runs').toBe('object');
      expect(await page.evaluate(() => typeof window.goatcounter), 'no analytics from 127.0.0.1').toBe('undefined');
      expect(journal.requetes.filter(u => /gc\.zgo\.at|goatcounter\.com/.test(u))).toEqual([]);
    });
  }

  test('scenario A plays to its outcome from the rehearsal server', async ({ page }) => {
    await openPage(page, 'fr', { adresse: serveur.url });
    await pauseAndSeed(page, 1);
    const rec = await executer(page, { scenario: 'A', apresLancement: 45, pasTrace: 0.1 });
    expect(rec.lancement, 'the pickup is launched within 120 s').not.toBeNull();
    expect(rec.log.filter(e => e.id === 'FMS' && e.code === 'TOKEN_REVOKED'), 'the I1 token is revoked once').toHaveLength(1);
  });

  test('the server itself is as strict as Pages: wrong case, outside the site path, untracked file answer 404', async ({ request }) => {
    const base = serveur.origine + SOUS_CHEMIN;
    expect((await request.get(base + 'js/base.js')).status()).toBe(200);
    expect((await request.get(base + 'js/Base.js')).status(), 'another case').toBe(404);
    expect((await request.get(serveur.origine + '/js/base.js')).status(), 'outside the site path').toBe(404);
    expect((await request.get(base + 'node_modules/@playwright/test/package.json')).status(), 'on the disk but not tracked by git').toBe(404);
    expect((await request.get(base + 'js/base.js')).headers()['content-type']).toContain('text/javascript');
    expect((await request.get(base + 'css/style.css')).headers()['content-type']).toContain('text/css');
  });
});

// Trois pages cassées d'une façon que seul un vrai serveur montre : chacune doit répondre 404 et ne pas démarrer.
test.describe('T-30 the rehearsal catches what only a real server shows (negative tests)', () => {
  async function essayer(page, { sauf = [], modifierIndex = null, suivisSans = [], fichier }) {
    const copie = telecharger(sauf, modifierIndex);
    const suivis = new Set(copie.fichiers.filter(f => !suivisSans.includes(f)));
    const serveur = await demarrerServeur(copie.dossier, { suivis });
    try {
      await expect(openPage(page, 'fr', { adresse: serveur.url })).rejects.toThrow(new RegExp(`${fichier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(missing\\)`));
      const nom = fichier.split('/')[1].toLowerCase();
      expect(serveur.requetes.some(r => r.code === 404 && r.chemin.toLowerCase().includes(nom)), 'the server answered 404 for the file').toBe(true);
      expect(await page.evaluate(() => typeof (window.__sim && window.__sim.sim)), 'the simulation did not start').toBe('undefined');
    } finally {
      await serveur.fermer();
      rmSync(copie.dossier, { recursive: true, force: true });
    }
  }

  test('a tag in the wrong case (js/Base.js for js/base.js) answers 404 and the page refuses to start', async ({ page }) => {
    await essayer(page, { fichier: 'js/base.js', modifierIndex: h => h.replace('src="js/base.js"', 'src="js/Base.js"') });
  });

  test('an absolute path (/js/base.js) is outside the site path: 404 and the page refuses to start', async ({ page }) => {
    await essayer(page, { fichier: 'js/base.js', modifierIndex: h => h.replace('src="js/base.js"', 'src="/js/base.js"') });
  });

  test('a file that git does not track is not published: 404 and the page refuses to start', async ({ page }) => {
    await essayer(page, { fichier: 'js/m2-comms-bus.js', suivisSans: ['js/m2-comms-bus.js'] });
  });
});
