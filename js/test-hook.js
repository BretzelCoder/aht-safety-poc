/* aht-safety-poc : porte d'entrée réservée aux vérifications automatiques (window.__sim), sans effet sur le comportement de la page.
   @concern test-hook
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
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
  i18n: { MSG, STATIC, LANGS, t }, i18nMissing };
AHT.inscrire('js/test-hook.js', '66c72140');
