/* aht-safety-poc : mesure d'audience GoatCounter, sans cookie, sur le site publié seulement.
   @concern analytics
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* =====================================================================
   Mesure d'audience — GoatCounter (sans cookie, données agrégées)
   Actif uniquement sur le site GitHub Pages : rien n'est chargé ni compté
   en local (file://, localhost). Les visites sont comptées sur le chemin
   sans paramètres ; un éventuel ?ref=… est classé comme provenance par
   GoatCounter. Événements : langue, scénarios lancés, ouverture du guide.
   ===================================================================== */
const GC_HOST = 'bretzelcoder.github.io', GC_ENDPOINT = 'https://bretzelgoatcounter.goatcounter.com/count';
const gcQueue = [];
function track(path, title) {
  const gc = window.goatcounter;
  if (gc && typeof gc.count === 'function') { try { gc.count({ path, title: title || path, event: true }); } catch (e) {} }
  else if (location.hostname === GC_HOST && gcQueue.length < 20) gcQueue.push([path, title]);
}
function demarrerMesure() {
  if (location.hostname === GC_HOST) {
    window.goatcounter = { path: () => location.pathname };
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js'; s.dataset.goatcounter = GC_ENDPOINT;
    s.onload = () => { while (gcQueue.length) track(...gcQueue.shift()); };
    document.head.appendChild(s);
  }
}
AHT.inscrire('js/analytics.js', 'c450b1a7');
