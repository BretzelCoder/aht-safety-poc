/* aht-safety-poc : outils partagés par tous les fichiers de la page ($ et clamp).
   @concern base
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
const $ = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/* Texte dynamique dans du balisage (spec 005) : le gabarit étiqueté html`…` rend inerte chaque valeur insérée par ${} (« & < > " ' »
   deviennent du texte) ; seul le balisage écrit dans le gabarit lui-même, un autre html`…` (SafeHtml) ou un raw() est laissé tel quel.
   Un tableau est inséré élément par élément. Les messages restent du texte brut : on ne les échappe qu'ici, une seule fois,
   jamais dans t() ni rp() (sinon « & » serait doublé), et jamais dans sim.log, qui garde {k, p} pour le changement de langue. */
class SafeHtml { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v).replace(/[&<>"']/g, c => ESC_HTML[c]);
const inerte = v => v instanceof SafeHtml ? v.s : Array.isArray(v) ? v.map(inerte).join('') : v === null || v === undefined ? '' : esc(v);
function html(fr, ...vals) { let s = fr[0]; for (let i = 0; i < vals.length; i++) s += inerte(vals[i]) + fr[i + 1]; return new SafeHtml(s); }
/* Balisage ÉCRIT PAR LE DÉPÔT, jamais une donnée : chaque usage doit figurer sur la liste du contrôle verifierEchappement (vide aujourd'hui). */
const raw = texte => new SafeHtml(String(texte));
AHT.inscrire('js/base.js', 'a0c91c0a');
