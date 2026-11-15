// T-07 : traductions complètes, moitié « tables » (S4). Les tables sont lues dans la page,
// les contrôles sont des fonctions pures testées sur le vrai contenu et sur des copies cassées.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openPage } from './helpers/page.mjs';
import { verifierTraductions } from './helpers/controles-statiques.mjs';
import { readPage } from '../scripts/read-page.mjs';

const html = readPage(fileURLToPath(new URL('..', import.meta.url))).html;   // index.html et ses fichiers propres (spec 003)
const decrire = erreurs => erreurs.map(e => `${e.fichier}${e.ligne ? ':' + e.ligne : ''} ${e.message}`).join('\n');

/** Copie profonde des tables de traduction de la page. */
async function tables(page) {
  await openPage(page, 'fr');
  return page.evaluate(() => JSON.parse(JSON.stringify({
    MSG: window.__sim.i18n.MSG, STATIC: window.__sim.i18n.STATIC, LANGS: window.__sim.i18n.LANGS,
  })));
}

test.describe('T-07 translation tables (S4)', () => {
  test('the real tables are complete in French, English and German', async ({ page }) => {
    const t = await tables(page);
    const erreurs = verifierTraductions(t, html);
    expect(erreurs, decrire(erreurs)).toEqual([]);
    expect(Object.keys(t.MSG).length, 'MSG should hold the dynamic messages').toBeGreaterThan(50);
  });

  test('a German static key removed is reported with the key and the language', async ({ page }) => {
    const t = await tables(page);
    delete t.STATIC.de['ui.guide'];
    const erreurs = verifierTraductions(t, html);
    const textes = erreurs.map(e => e.message).join('\n');
    expect(erreurs.length).toBeGreaterThan(0);
    expect(textes).toContain('STATIC.de');
    expect(textes).toContain('"ui.guide"');
  });

  test('an English static key removed is reported', async ({ page }) => {
    const t = await tables(page);
    delete t.STATIC.en['ui.reset'];
    const textes = verifierTraductions(t, html).map(e => e.message).join('\n');
    expect(textes).toContain('STATIC.en');
    expect(textes).toContain('"ui.reset"');
  });

  test('a static key that exists in only one language is reported', async ({ page }) => {
    const t = await tables(page);
    t.STATIC.de['ui.cle.en.trop'] = 'Nur Deutsch';
    const textes = verifierTraductions(t, html).map(e => e.message).join('\n');
    expect(textes).toContain('STATIC.en');
    expect(textes).toContain('"ui.cle.en.trop"');
  });

  test('an English text removed from a dynamic message is reported with the key and the language', async ({ page }) => {
    const t = await tables(page);
    t.MSG['log.started'][1] = '';
    const erreurs = verifierTraductions(t, html);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('MSG["log.started"]');
    expect(erreurs[0].message).toContain('en');
  });

  test('a dynamic message that is not a triplet is reported', async ({ page }) => {
    const t = await tables(page);
    t.MSG['log.started'] = t.MSG['log.started'].slice(0, 2);
    const erreurs = verifierTraductions(t, html);
    expect(erreurs.map(e => e.message).join('\n')).toContain('MSG["log.started"] must be a [fr, en, de] triplet');
  });

  test('a key used by the script but defined nowhere is reported with its line', async ({ page }) => {
    const t = await tables(page);
    const lignes = html.split('\n');
    const cible = lignes.findIndex(l => l.startsWith('const clamp = '));
    lignes.splice(cible + 1, 0, "const inconnu = t('log.cle.inexistante');");
    const erreurs = verifierTraductions(t, lignes.join('\n'));
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('"log.cle.inexistante"');
    expect(erreurs[0].ligne).toBe(cible + 2);
  });

  test('a data-i18n key of the HTML missing from STATIC is reported', async ({ page }) => {
    const t = await tables(page);
    const casse = html.replace('data-i18n="ui.kTime"', 'data-i18n="ui.kTemps"');
    const textes = verifierTraductions(t, casse).map(e => e.message).join('\n');
    expect(textes).toContain('"ui.kTemps"');
    expect(textes).toContain('STATIC.en');
    expect(textes).toContain('STATIC.de');
  });

  test('composed keys: the family hud.k is checked, and a prefix alone is not an error', async ({ page }) => {
    const t = await tables(page);
    expect(verifierTraductions(t, html), 'real tables: the family is complete and the prefix is accepted').toEqual([]);
    delete t.MSG['hud.kCOMFORT'];
    const textes = verifierTraductions(t, html).map(e => e.message).join('\n');
    expect(textes).toContain('"hud.kCOMFORT"');
  });

  // Revue de la spec 001, écart 4 : famille code.* (codeName retombe sans bruit sur le code brut), clés tronquées, types d'arrêt.
  test('composed keys: the home-made code translations of codeName() are checked', async ({ page }) => {
    const t = await tables(page);
    delete t.MSG['code.ORDER_NOT_APPLIED'];
    const textes = verifierTraductions(t, html).map(e => e.message).join('\n');
    expect(textes).toContain('"code.ORDER_NOT_APPLIED"');
  });

  test('composed keys: a code translation with a missing language is reported', async ({ page }) => {
    const t = await tables(page);
    t.MSG['code.ORDER_NOT_APPLIED'] = ['ORDRE_NON_APPLIQUÉ', 'ORDER_NOT_APPLIED', ''];
    const textes = verifierTraductions(t, html).map(e => e.message).join('\n');
    expect(textes).toContain('"code.ORDER_NOT_APPLIED"');
  });

  test('a truncated key is not accepted just because a longer key starts with it', async ({ page }) => {
    const t = await tables(page);
    expect(Object.keys(t.MSG), 'the premise: log.started exists').toContain('log.started');
    const lignes = html.split('\n');
    const cible = lignes.findIndex(l => l.startsWith('const clamp = '));
    lignes.splice(cible + 1, 0, "const tronquee = t('log.start');");
    const erreurs = verifierTraductions(t, lignes.join('\n'));
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('"log.start"');
  });

  test('composed keys: a new stop type found in the script without its hud.k translation is reported', async ({ page }) => {
    const t = await tables(page);
    const casse = html.replace("T.mc.appliedKind === 'COMFORT'", "T.mc.appliedKind === 'COMFORT' || T.mc.appliedKind === 'SLOW'");
    expect(casse, 'the breakage is applied').not.toBe(html);
    const textes = verifierTraductions(t, casse).map(e => e.message).join('\n');
    expect(textes).toContain('"hud.kSLOW"');
  });

  test('terms identical in every language by design are not reported', async ({ page }) => {
    const t = await tables(page);
    t.MSG['id.you'] = ['LV', 'LV', 'LV'];
    expect(verifierTraductions(t, html), 'the checks look at presence, never at differences between languages').toEqual([]);
  });
});
