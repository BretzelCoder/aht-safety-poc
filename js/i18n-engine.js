/* aht-safety-poc : moteur de traduction (langue courante, tables STATIC vides, fmt, M, N, RAW, vid, codeName, rp, t).
   @concern i18n
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* =====================================================================
   I18N — français (défaut) / anglais / allemand
   Textes statiques : le français reste dans le HTML, marqué par data-i18n
   (texte), data-i18n-html, data-i18n-title, data-i18n-aria ; EN et DE sont
   dans STATIC. Textes dynamiques : triplets [fr, en, de] dans MSG.
   Les messages du journal et les raisons sont stockés sous forme {k, p}
   et traduits à l'affichage : changer de langue retraduit l'historique.
   Restent tels quels dans toutes les langues : états (NOMINAL…), codes
   (DM1_…, DDS_…), QoS DDS, sigles (SIL, FMS, V2X, CAN, ECU…), normes,
   variables des formules.
   ===================================================================== */
const LANGS = ['fr', 'en', 'de'], LANG_KEY = 'aht-lang';
const LOCALE = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
let LANG = 'fr';
// Priorité : argument d'URL (?lang=en) > choix mémorisé > français
try { const v = localStorage.getItem(LANG_KEY); if (LANGS.includes(v)) LANG = v; } catch (e) {}
try { const q = new URLSearchParams(location.search).get('lang'); if (LANGS.includes(q)) LANG = q; } catch (e) {}

// Textes statiques EN et DE : les fichiers i18n-en-*.js et i18n-de-*.js complètent ces deux tables.
const STATIC = { en: {}, de: {} };

const LI = () => LANGS.indexOf(LANG);
const fmt = (x, d = 1) => { if (!isFinite(x)) return '∞'; const s = x.toFixed(d); return LANG === 'en' ? s : s.replace('.', ','); };
const M = (k, p) => ({ k, p });          // message traduisible, résolu à l'affichage
const N = (n, d = 0) => ({ n, d });      // nombre formaté selon la langue à l'affichage
const RAW = raw => ({ raw });            // texte non traduit (codes, états)
/* Identifiant véhicule affiché : VL-VOUS → LV-YOU, VL-42 → LV-42… */
function vid(id) { return id === 'VL-VOUS' ? t('id.you') : String(id).startsWith('VL-') ? t('id.lv') + id.slice(3) : id; }
function codeName(c) { const e = MSG['code.' + c]; return e ? e[LI()] : c; }
function rp(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('raw' in v) return v.raw;
    if ('k' in v) return t(v.k, v.p);
    if ('n' in v) return fmt(v.n, v.d);
  }
  return typeof v === 'string' ? vid(v) : String(v);
}
const i18nMissing = new Set();           // clés introuvables, lues par les vérifications automatiques
function t(k, p) {
  const e = MSG[k], s = e ? (e[LI()] ?? e[0]) : k;
  if (!e) i18nMissing.add(k);
  else if (e[LI()] === undefined) i18nMissing.add(`${k} (${LANG})`);
  return p ? s.replace(/\{(\w+)\}/g, (m, n) => (p[n] !== undefined ? rp(p[n]) : m)) : s;
}
AHT.inscrire('js/i18n-engine.js', '66a73e86');
