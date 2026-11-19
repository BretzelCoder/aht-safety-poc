/* aht-safety-poc : porte d'entrée réservée aux vérifications automatiques (window.__sim), sans effet sur le comportement de la page.
   @concern test-hook
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* Jamais sur le site publié (spec 004, S4) : le crochet n'existe que pour les vérifications automatiques
   (disque, serveur local). GC_HOST, défini dans js/analytics.js (chargé avant), est la seule autorité. */
if (location.hostname !== GC_HOST) {
window.__sim = { get sim() { return sim; }, step, scenario, ENV, P, brakeEnvelope, stopDistance, resetSim, setSel: i => { selected = i; }, setLang,
  // Réservé aux vérifications automatiques (spec 002) : envoie une consigne du niveau 1 du tombereau i, les champs de `patch`
  // remplaçant ceux d'une consigne normale ; la somme de contrôle est recalculée sauf si `patch.sum` est fourni.
  PATH, vLimitAt, l1Freeze: i => l1Freeze(sim.trucks[i]), l1Restart: i => l1Restart(sim.trucks[i]),
  l1Inject: (i, patch) => {
    const T = sim.trucks[i], A = T.l1;
    const sp = { session: A.session, seq: A.seq++, ts: sim.t, vDemand: T.vPlan, dGoal: Math.max(0, T.auth.sEnd - T.s), sClaim: T.s, vClaim: T.v, ...patch };
    if (patch.sum === undefined) sp.sum = sumOf(sp);
    l1Send(T, 'sp', sp);
  },
  // Réservé aux vérifications automatiques (spec 001) : tables de traduction et clés introuvables.
  i18n: { MSG, STATIC, LANGS, t }, i18nMissing,
  // Réservé aux vérifications automatiques (spec 005, S4) : met une chaîne piégée dans tout ce que le HUD affiche du modèle (identifiant
  // du tombereau sélectionné, journal avec sa classe, raisons du superviseur, dernier rejet du niveau 2, ligne d'échanges) puis redessine.
  // À appeler simulation en pause ; l'état n'est pas fait pour continuer à tourner après.
  hostile: texte => {
    const T = sim.trucks[selected], msg = RAW(texte);
    T.id = texte;
    logEv(texte, 1, texte, msg, texte);
    T.reasons = [{ lvl: 1, code: texte, msg }];
    const e = { seq: 0, ts: sim.t, v: 0, d: 0, sumOk: true, ok: false, code: texte, msg, t: sim.t };
    T.l2.rej.push(e); T.l2.ex.push(e);
    hud();
  } };
}
AHT.inscrire('js/test-hook.js', 'd563e378');
