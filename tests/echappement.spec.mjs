// Spec 005 : le texte dynamique du HUD s'affiche comme du texte (constat M3 de l'audit de sécurité).
// T-02 : le gabarit étiqueté html`…` de js/base.js ; T-04 : la chaîne piégée dans les panneaux du HUD.
import { test, expect } from '@playwright/test';
import { rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage } from './helpers/page.mjs';
import { telecharger as copier } from './helpers/copie-page.mjs';

/** Les propriétés du gabarit html`…`, mesurées dans la page ; rend la liste de ce qui ne tient pas. */
async function mesurerGabarit(page) {
  return page.evaluate(() => {
    const ecarts = [];
    const attendre = (nom, obtenu, voulu) => { if (obtenu !== voulu) ecarts.push(`${nom}: got ${JSON.stringify(obtenu)}, wanted ${JSON.stringify(voulu)}`); };
    attendre('five characters', String(html`${'<&>"\''}`), '&lt;&amp;&gt;&quot;&#39;');
    attendre('literal markup untouched', String(html`<b class="x">&nbsp;${'a'}</b>`), '<b class="x">&nbsp;a</b>');
    attendre('nested html is not escaped twice', String(html`<p>${html`<i>${'<'}</i>`}</p>`), '<p><i>&lt;</i></p>');
    attendre('array item by item', String(html`<ul>${['a', html`<li>b</li>`, '<c>']}</ul>`), '<ul>a<li>b</li>&lt;c&gt;</ul>');
    attendre('null and undefined are empty', String(html`[${null}|${undefined}]`), '[|]');
    attendre('numbers', String(html`${0}|${-1.5}|${Infinity}`), '0|-1.5|Infinity');
    attendre('an attribute cannot be closed', String(html`<a title="${'x" onmouseover="1'}">`), '<a title="x&quot; onmouseover=&quot;1">');
    attendre('raw is left as is', String(html`${raw('<br>')}`), '<br>');
    attendre('an object result is a SafeHtml', html`a` instanceof SafeHtml, true);
    // Le navigateur relit la même chose : le DOM construit depuis le texte échappé est le texte d'origine.
    const el = document.createElement('div'); el.innerHTML = html`<span title="${'a"<&\'b'}">${'<img src=x>&amp;'}</span>`;
    attendre('one element only', el.children.length, 1);
    attendre('the text is read back verbatim', el.textContent, '<img src=x>&amp;');
    attendre('the attribute is read back verbatim', el.firstElementChild.getAttribute('title'), 'a"<&\'b');
    return ecarts;
  });
}

test.describe('spec 005 T-02 - the html`…` template of js/base.js', () => {
  test('every interpolated value is made inert, the literal markup and nested templates are not', async ({ page }) => {
    await openPage(page, 'fr');
    expect(await mesurerGabarit(page)).toEqual([]);
  });

  test('a copy whose escaping does nothing is reported', async ({ page }) => {
    const { dossier } = copier();
    const base = join(dossier, 'js/base.js');
    const texte = readFileSync(base, 'utf8');
    const casse = texte.replace(/const esc = v => String\(v\)\.replace\([^;]+;/, 'const esc = v => String(v);');
    expect(casse, 'the breakage was applied').not.toBe(texte);
    writeFileSync(base, casse);
    await openPage(page, 'fr', { chemin: join(dossier, 'index.html') });
    const ecarts = await mesurerGabarit(page);
    expect(ecarts.join(' | ')).toContain('five characters');
    expect(ecarts.join(' | ')).toContain('an attribute cannot be closed');
    rmSync(dossier, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T-04 (S4, AC-3) : une chaîne piégée, mise par le crochet de test dans tout ce que le HUD affiche, s'affiche comme du texte.
const PIEGE = `<img src=x onerror="window.__pwn=1"><b id="pwn">gras</b> &amp; "q" 'a'`;

/** Ouvre la page, met la simulation en pause, montre la vue des échanges, injecte la chaîne ; rend ce qui ne tient pas. */
async function mesurerPanneaux(page, lang, chemin = null) {
  await openPage(page, lang, chemin ? { chemin } : {});
  await page.evaluate(() => { window.__sim.ENV.paused = true; });
  await page.click('#tabL12');
  await page.evaluate(texte => window.__sim.hostile(texte), PIEGE);
  return page.evaluate(piege => {
    const ecarts = [], $$ = s => document.querySelector(s);
    const verifier = (nom, ok, detail = '') => { if (!ok) ecarts.push(`${nom}${detail ? ': ' + detail : ''}`); };
    const nbTrucks = window.__sim.sim.trucks.length;
    const log = $$('#log'), raisons = $$('#reasons'), onglets = $$('#tabs'), echanges = $$('#exL12');
    verifier('#log shows the string verbatim', log.textContent.includes(piege));
    verifier('#log holds only plain lines with a class attribute', [...log.children].every(c => c.tagName === 'DIV' && c.getAttributeNames().join() === 'class'), `children: ${[...log.children].map(c => c.tagName + '[' + c.getAttributeNames() + ']').slice(-3).join(' ')}`);
    verifier('#reasons shows the string verbatim', raisons.textContent.includes(piege));
    verifier('#reasons holds one line', raisons.children.length === 1 && raisons.firstElementChild.tagName === 'LI', `children: ${raisons.children.length}`);
    verifier('#tabs shows the string verbatim', onglets.textContent.includes(piege));
    verifier('#tabs holds one button per truck', onglets.children.length === nbTrucks && [...onglets.children].every(c => c.tagName === 'BUTTON'), `children: ${onglets.children.length} of ${nbTrucks}`);
    verifier('#exL12 shows the string verbatim', echanges.textContent.includes(piege));
    verifier('#exL12 holds only plain rows', [...echanges.children].every(c => c.tagName === 'DIV'), `children: ${[...echanges.children].map(c => c.tagName).join()}`);
    verifier('the rejection line is there', !!$$('#exL12 .why') && $$('#exL12 .why').textContent === piege);
    verifier('no element was created from the string', document.querySelectorAll('img[src="x"], #pwn').length === 0, `${document.querySelectorAll('img[src="x"], #pwn').length} found`);
    verifier('the injected handler did not run', window.__pwn === undefined);
    return ecarts;
  }, PIEGE);
}

test.describe('spec 005 T-04 - a hostile string shown by the HUD is text, in three languages', () => {
  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: log, reasons, tabs and rejection line show it verbatim and create no element`, async ({ page }) => {
      expect(await mesurerPanneaux(page, lang)).toEqual([]);
    });
  }

  test('a copy whose escaping does nothing is reported by the panel that shows it', async ({ page }) => {
    const { dossier } = copier();
    const base = join(dossier, 'js/base.js');
    const texte = readFileSync(base, 'utf8');
    const casse = texte.replace(/const esc = v => String\(v\)\.replace\([^;]+;/, 'const esc = v => String(v);');
    expect(casse, 'the breakage was applied').not.toBe(texte);
    writeFileSync(base, casse);
    const ecarts = (await mesurerPanneaux(page, 'fr', join(dossier, 'index.html'))).join(' | ');
    rmSync(dossier, { recursive: true, force: true });
    expect(ecarts).toContain('#log');
    expect(ecarts).toContain('#reasons');
    expect(ecarts).toContain('no element was created from the string');
  });
});
