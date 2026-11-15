// Chargement de la page (spec 003, S12, S13, AC-14, AC-15, AC-17) : la garde de démarrage.
// Chaque cas travaille sur une COPIE de la page dans un dossier temporaire, jamais sur le dépôt.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPage } from './helpers/page.mjs';
import { lireEmpreinte } from '../scripts/empreintes.mjs';

const racine = fileURLToPath(new URL('..', import.meta.url));

/**
 * Copie les fichiers de la page dans un dossier temporaire et rend `{ dossier, index, lire, ecrire }`.
 * `modifier(html)` change index.html de la copie ; les autres fichiers se changent avec `ecrire`.
 */
function copierPage(modifier = h => h) {
  const dossier = mkdtempSync(join(tmpdir(), 'aht-page-'));
  for (const f of ['index.html', 'css', 'js']) { try { cpSync(join(racine, f), join(dossier, f), { recursive: true }); } catch { /* dossier pas encore créé */ } }
  const index = join(dossier, 'index.html');
  writeFileSync(index, modifier(readFileSync(index, 'utf8')));
  return {
    dossier, index,
    lire: chemin => readFileSync(join(dossier, chemin), 'utf8'),
    ecrire: (chemin, texte) => writeFileSync(join(dossier, chemin), texte),
    retirer: () => rmSync(dossier, { recursive: true, force: true }),
  };
}

/** Ajoute une entrée au manifeste de la copie (l'entrée `attendu`). */
const avecEntree = (chemin, empreinte) => html => html.replace(/(\n\s*attendu: \{\r?\n)/, `$1    '${chemin}': '${empreinte}',\n`);

/** Insère un script juste avant la garde de démarrage (la copie garde les fins de ligne de index.html, CRLF ou LF). */
const avantGarde = code => html => html.replace(/<script>(\r?\n)\/\/ Garde de démarrage/, `<script>${code}</script>$1<script>$1// Garde de démarrage`);

/** La page refuse de démarrer : message visible dans les trois langues, erreur nommée, aucune simulation. */
async function verifierRefus(page, copie, fichier, raison) {
  await expect(openPage(page, 'fr', { chemin: copie.index })).rejects.toThrow(new RegExp(`${fichier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(${raison}\\)`));
  const boite = page.locator('#chargementErreur');
  await expect(boite, 'the failure message is shown').toBeVisible();
  const texte = await boite.innerText();
  expect(texte, 'French').toContain("n'a pas pu démarrer");
  expect(texte, 'English').toContain('could not start');
  expect(texte, 'German').toContain('konnte nicht starten');
  expect(texte, 'the file is named').toContain(fichier);
  expect(await page.evaluate(() => window.AHT.erreur)).toContain(`${fichier} (${raison})`);
  expect(await page.evaluate(() => typeof (window.__sim && window.__sim.sim)), 'the simulation never started').toBe('undefined');
  expect(await page.evaluate(() => typeof window.goatcounter), 'no analytics object either').toBe('undefined');
}

test.describe('T-14 start-up guard (spec 003, S12, S13)', () => {
  test('a manifest that lists a file the page never loads: the page says so and does not start', async ({ page }) => {
    const copie = copierPage(avecEntree('js/inexistant.js', '12345678'));
    await verifierRefus(page, copie, 'js/inexistant.js', 'missing');
    copie.retirer();
  });

  test('a file that registers another stamp than the manifest expects: the page says "other version"', async ({ page }) => {
    const copie = copierPage(html => avantGarde("AHT.inscrire('js/faux.js', 'aaaaaaaa');")(avecEntree('js/faux.js', 'bbbbbbbb')(html)));
    await verifierRefus(page, copie, 'js/faux.js', 'other version');
    copie.retirer();
  });

  test('a file that registers although the manifest does not expect it: refused too', async ({ page }) => {
    const copie = copierPage(avantGarde("AHT.inscrire('js/surprise.js', 'aaaaaaaa');"));
    await verifierRefus(page, copie, 'js/surprise.js', 'not expected');
    copie.retirer();
  });

  test('the same copy with a consistent manifest starts normally (the guard does not refuse a good page)', async ({ page }) => {
    const copie = copierPage(html => avantGarde("AHT.inscrire('js/ok.js', 'cccccccc');")(avecEntree('js/ok.js', 'cccccccc')(html)));
    const journal = await openPage(page, 'fr', { chemin: copie.index });
    expect(journal.erreursPage).toEqual([]);
    expect(await page.evaluate(() => typeof window.__sim.sim)).toBe('object');
    await expect(page.locator('#chargementErreur')).toBeHidden();
    copie.retirer();
  });

  test('the style sheet deleted: the page says so and does not start', async ({ page }) => {
    const copie = copierPage();
    rmSync(join(copie.dossier, 'css/style.css'));
    await verifierRefus(page, copie, 'css/style.css', 'missing');
    copie.retirer();
  });

  test('the style sheet with another stamp than the manifest: the page says "other version"', async ({ page }) => {
    const copie = copierPage();
    copie.ecrire('css/style.css', copie.lire('css/style.css').replace(/--aht-stamp: '[0-9a-f]{8}'/, "--aht-stamp: '00000000'"));
    await verifierRefus(page, copie, 'css/style.css', 'other version');
    copie.retirer();
  });

  test('a script file deleted: the page says so and does not start', async ({ page }) => {
    const copie = copierPage();
    rmSync(join(copie.dossier, 'js/base.js'));
    await verifierRefus(page, copie, 'js/base.js', 'missing');
    copie.retirer();
  });

  test('a script file with a syntax error never registers: the page says so and does not start', async ({ page }) => {
    const copie = copierPage();
    copie.ecrire('js/analytics.js', copie.lire('js/analytics.js').replace("'use strict';", "'use strict';\nconst cassé = ;"));
    await verifierRefus(page, copie, 'js/analytics.js', 'missing');
    copie.retirer();
  });

  test('a file that registers twice (the same file run twice): the page says "loaded twice" and does not start', async ({ page }) => {
    const copie = copierPage();
    const stamp = lireEmpreinte(copie.lire('js/base.js'), 'js/base.js');
    copie.ecrire('index.html', avantGarde(`AHT.inscrire('js/base.js', '${stamp}');`)(copie.lire('index.html')));
    await verifierRefus(page, copie, 'js/base.js', 'loaded twice');
    copie.retirer();
  });

  test('a script tag listed twice: the browser refuses the second run of the declarations, nothing is duplicated', async ({ page }) => {
    const copie = copierPage(html => html.replace('<script src="js/analytics.js"></script>', '<script src="js/analytics.js"></script>\n<script src="js/analytics.js"></script>'));
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await openPage(page, 'fr', { chemin: copie.index });
    expect(erreurs.join('|'), 'the browser rejects the second run (constants declared twice)').toContain('already been declared');
    // un seul écouteur par bouton : un clic sur Pause bascule la pause une seule fois
    const avant = await page.evaluate(() => window.__sim.ENV.paused);
    await page.locator('#bPause').click();
    expect(await page.evaluate(() => window.__sim.ENV.paused), 'one click, one toggle').toBe(!avant);
    copie.retirer();
  });

  test('the real page starts: the message stays hidden', async ({ page }) => {
    await openPage(page, 'fr');
    await expect(page.locator('#chargementErreur')).toBeHidden();
    expect(await page.evaluate(() => window.AHT.erreur)).toBeNull();
  });
});
