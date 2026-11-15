/* aht-safety-poc : module 3, AutonomyAndSafetyCore : niveau 1 (rapport et consigne, panne) et niveau 2 (mesures, jugement des consignes).
   @concern module-3
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* Niveau 1 : rapport d'obstacles (après la perception) et consigne (après le planificateur), à chaque pas.
   Un niveau 1 figé n'émet plus rien. Le niveau 2 ne voit que ce qui arrive par le lien. */
function l1EmitReport(T) {
  if (T.l1.frozen) return;
  l1Send(T, 'obs', { dObs: T.m.dObs, obsId: T.m.obsId, obsPred: T.m.obsPred });
}
function l1EmitSetpoint(T) {
  const A = T.l1;
  if (A.frozen) return;
  const d = A.defect;
  let sp;
  if (d === 'REPLAY' && A.captured.length) sp = { ...A.captured[A.captured.length - 1] };   // la consigne précédente, intacte, renvoyée à la place de la nouvelle : assez fraîche, même avec le retard du noyau généraliste, pour que le verdict soit « séquence »
  else {
    sp = { session: A.session, seq: A.seq++, ts: sim.t, vDemand: T.vPlan, dGoal: Math.max(0, T.auth.sEnd - T.s), sClaim: T.s, vClaim: T.v };
    if (d === 'STALE') sp.ts -= 1.0;
    if (d === 'OVERSPEED') sp.vDemand = vLimitAt(T.s + P.len / 2) + 15 / 3.6;   // 15 km/h au-dessus de la limite du tronçon
    if (d === 'BEYOND_MA') { sp.vDemand = vLimitAt(T.s + P.len / 2); sp.dGoal += 30; }   // vitesse de ligne sans tenir compte de l'autorisation, objectif 30 m au-delà de sa fin
    sp.sum = sumOf(sp);
    if (d === 'INTEGRITY') sp.vDemand += 5;                  // altérée après le calcul de la somme de contrôle
    if (!d) { A.captured.push({ ...sp }); if (A.captured.length > 5) A.captured.shift(); }
  }
  if (d && !A.repeat) A.defect = null;                       // un défaut ne dure qu'une consigne, sauf en mode continu
  l1Send(T, 'sp', sp);
}
/* Panne et redémarrage du niveau 1 (commandes du visiteur, scénario F). Figer garde en mémoire l'instant et la position,
   pour mesurer le délai de détection et la distance jusqu'à l'arrêt. */
function l1Freeze(T) {
  if (T.l1.frozen) return;
  T.l1.frozen = true; T.l1.ev = { tFreeze: sim.t, sFreeze: T.s, tDetect: null, sStill: null };
  logEv(T.id, 0, 'INJECT', M('l1.freeze'), 'info');
}
function l1Restart(T) {
  if (!T.l1.frozen) return;
  T.l1.frozen = false; T.l1.session++; T.l1.seq = 0;          // nouvelle session : le compteur repart de zéro sans passer pour un rejeu
  logEv(T.id, 0, 'INJECT', M('l1.restart', { n: T.l1.session }), 'info');
}
/* Niveau 2 : ses propres mesures (position, autorisation reçue du FMS), gardées une seconde, pour juger une consigne
   au moment où elle a été émise et non au moment où elle arrive (spec 002, S6). */
function l2Measure(T) {
  const L = T.l2;
  L.hist.push({ t: sim.t, s: T.s, sEnd: T.auth.sEnd });
  while (L.hist.length > 1 && L.hist[0].t < sim.t - P.l1Hist) L.hist.shift();
}
function l2At(L, ts) {
  let best = L.hist[L.hist.length - 1];
  for (const h of L.hist) if (Math.abs(h.t - ts) < Math.abs(best.t - ts)) best = h;
  return best;
}
/* Niveau 2 : livre ce qui est arrivé, juge chaque consigne et tient son état (consigne acceptée, battement, échanges). */
function l2Receive(T) {
  const L = T.l2;
  while (L.link.length && L.link[0].at <= sim.t + 1e-9) {   // 1e-9 : l'horloge s'accumule par pas de 0,02 s, sans cela un retard de 0,2 s arriverait un pas trop tard
    const it = L.link.shift();
    if (it.kind === 'obs') L.obs = it.p; else l2Judge(T, it.p);
  }
}
/* Jugement d'une consigne, dans l'ordre : intégrité, fraîcheur, séquence. Un message qui échoue à l'un de ces trois contrôles
   n'est pas un battement valide. Il ne change jamais la consigne acceptée. */
function l2Judge(T, sp) {
  const L = T.l2, age = sim.t - sp.ts;
  const e = { session: sp.session, seq: sp.seq, ts: sp.ts, v: sp.vDemand, d: sp.dGoal, sClaim: sp.sClaim, vClaim: sp.vClaim, sumOk: sumOf(sp) === sp.sum, ok: false, code: null };
  if (!e.sumOk) return l2Refuse(T, e, 'SETPOINT_INTEGRITY', 'l2.integrity', { seq: sp.seq });
  if (age > P.l1Stale) return l2Refuse(T, e, 'SETPOINT_STALE', 'l2.stale', { seq: sp.seq, ms: N(age * 1000) });
  if (sp.session < L.session || (sp.session === L.session && sp.seq <= L.seq)) return l2Refuse(T, e, 'SETPOINT_SEQUENCE', 'l2.sequence', { seq: sp.seq, last: L.seq });
  L.session = sp.session; L.seq = sp.seq; L.lastValid = sim.t;   // message bien formé : battement, séquence suivie
  // Contrôles de contenu, avec les mesures du niveau 2 à l'instant d'émission (jamais sClaim ni vClaim, affirmés par le niveau 1).
  const h = l2At(L, sp.ts), lim = vLimitAt(h.s + P.len / 2), depasse = h.s + sp.dGoal - h.sEnd;
  if (sp.vDemand > lim + 0.1) return l2Refuse(T, e, 'SETPOINT_OVERSPEED', 'l2.overspeed', { seq: sp.seq, v: N(sp.vDemand * 3.6), lim: N(lim * 3.6) });
  if (depasse > 0.1) return l2Refuse(T, e, 'SETPOINT_BEYOND_MA', 'l2.beyond', { seq: sp.seq, d: N(depasse) });
  L.vAccepted = sp.vDemand; L.rejRun = 0; e.ok = true;
  l2Record(L, e);
}
function l2Record(L, e) { L.ex.push(e); if (L.ex.length > 5) L.ex.shift(); }
function l2Refuse(T, e, code, k, p) {
  const L = T.l2;
  e.code = code; e.msg = M(k, p); e.t = sim.t; L.rejRun++;
  l2Record(L, e);
  L.rej.push(e); if (L.rej.length > 3) L.rej.shift();
  logEv(T.id, 1, code, e.msg);
}

/* Niveau 1 (calculateur d'autonomie) et niveau 2 (contrôleur de sûreté), état par tombereau (spec 002). */
function newL1() { return { frozen: false, session: 0, seq: 0, defect: null, repeat: false, captured: [], ev: { tFreeze: null, sFreeze: null, tDetect: null, sStill: null } }; }
function newL2() { return { link: [], lastAt: 0, vAccepted: 0, obs: { dObs: Infinity, obsId: null, obsPred: false }, lastValid: sim ? sim.t : 0, hbLost: false, stableSince: 0, rejLost: false, rejStable: 0, session: 0, seq: -1, rejRun: 0, hist: [], ex: [], rej: [] }; }
AHT.inscrire('js/m3-levels.js', '904f22de');
