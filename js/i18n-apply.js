/* aht-safety-poc : application des textes statiques au HTML (applyStatic, moitié DOM de la traduction).
   @concern i18n
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
const ORIG = new Map();
function applyStatic() {
  const S = STATIC[LANG] || {};
  const pick = (key, fr) => (LANG === 'fr' || S[key] === undefined ? fr : S[key]);
  document.documentElement.lang = LANG;
  document.title = t('doc.title');
  document.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-title],[data-i18n-aria]').forEach(n => {
    let o = ORIG.get(n);
    if (!o) { o = { text: n.textContent, html: n.innerHTML, title: n.getAttribute('title'), aria: n.getAttribute('aria-label') }; ORIG.set(n, o); }
    const d = n.dataset;
    if (d.i18nHtml) n.innerHTML = pick(d.i18nHtml, o.html);
    else if (d.i18n) n.textContent = pick(d.i18n, o.text);
    if (d.i18nTitle) n.setAttribute('title', pick(d.i18nTitle, o.title));
    if (d.i18nAria) n.setAttribute('aria-label', pick(d.i18nAria, o.aria));
  });
  document.querySelectorAll('#langGrp [data-lang]').forEach(b => { const on = b.dataset.lang === LANG; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  // Profils de noyau : les durées viennent du modèle (P), jamais du HTML.
  const sk = document.getElementById('selKernel');
  if (sk) { sk.options[0].textContent = t('kern.rt', { ms: N(P.latCpuRT * 1000) }); sk.options[1].textContent = t('kern.gp', { ms: N(P.latCpuGP * 1000) }); }
}
AHT.inscrire('js/i18n-apply.js', 'c0c57e2a');
