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
