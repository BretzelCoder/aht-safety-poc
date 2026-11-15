/* aht-safety-poc : outils partagés par tous les fichiers de la page ($ et clamp).
   @concern base
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
const $ = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
AHT.inscrire('js/base.js', 'ba66a5b9');
