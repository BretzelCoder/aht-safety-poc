/* aht-safety-poc : module 2, EmbeddedCommsBus : CAN J1939, DDS, réception du contrôleur, lien niveau 1 vers niveau 2.
   @concern module-2
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* =====================================================================
   MODULE 2 — EmbeddedCommsBus
   CAN : temps de réponse selon la charge des priorités supérieures.
   DDS : topic sécurité, motif périodique ou événementiel, pertes, QoS.
   ===================================================================== */
function canResponse(uHigher) { return uHigher >= 0.995 ? Infinity : P.canFrame + (uHigher * 0.020) / (1 - uHigher); }
function canUpdate(T) {
  const U = T.can.load / 100, safetyU = 0.03;
  const uHp = T.can.babbling ? 1 : (T.can.misprio ? Math.min(0.999, U) : safetyU * 0.5);
  T.m.brakeLat = canResponse(uHp);
  T.m.diagLat = T.can.babbling ? Infinity : canResponse(Math.min(0.999, U + safetyU));
  T.m.busLoad = T.can.babbling ? 100 : Math.min(100, (U + safetyU) * 100);
  if (T.m.brakeLat > P.canWatchdog && !T.ecuEmergency) {
    T.ecuEmergency = true;
    logEv(T.id, 3, 'DM1_BRAKE_CMD_TIMEOUT', M('log.watchdog', { ms: N(T.m.brakeLat * 1000) }));
  }
}
function k95(p) { return p <= 0 ? 0 : Math.max(0, Math.ceil(Math.log(0.05) / Math.log(p)) - 1); }
function ddsBudget(T) {
  if (T.dds.mode === 'PERIODIC') return P.ddsPeriod + 0.003;
  if (T.dds.mode === 'EVENT_BE') return 0.003;
  return 0.003 + P.ddsRetx * k95(T.dds.loss);
}
function ddsPublish(T) {
  const now = sim.t, msg = { mode: T.state, kind: T.stopKind };
  const last = T.mc.lastSent;
  const changed = !last || last.mode !== msg.mode || last.kind !== msg.kind;
  const p = T.dds.loss;
  if (T.dds.mode === 'PERIODIC') {
    if (Math.random() >= p) T.mc.queue.push({ at: now + 0.002 + Math.random() * 0.002, sent: now, ...msg });
  } else if (changed) {
    if (T.dds.mode === 'EVENT_BE') {
      if (Math.random() >= p) T.mc.queue.push({ at: now + 0.002, sent: now, ...msg });
      else logEv(T.id, LEVEL[msg.mode] >= 2 ? 2 : 1, 'DDS_SAMPLE_LOST', M('log.beLost', { mode: msg.mode }));
    } else {
      let k = 0; while (Math.random() < p && k < 20) k++;
      T.mc.queue.push({ at: now + 0.002 + k * P.ddsRetx, sent: now, ...msg });
      if (k > 1) logEv(T.id, 1, 'DDS_RELIABLE_RETX', M('log.retx', { k, mode: msg.mode, ms: N((0.002 + k * P.ddsRetx) * 1000) }));
    }
  }
  T.mc.lastSent = msg;
}
function mcReceive(T) {
  const now = sim.t;
  T.mc.queue = T.mc.queue.filter(m => {
    if (m.at <= now) {
      if (m.sent >= T.mc.rxSent) { T.mc.rxMode = m.mode; T.mc.rxKind = m.kind; T.mc.rxTime = now; T.mc.rxSent = m.sent; T.mc.lastLat = now - m.sent; }
      return false;
    }
    return true;
  });
  // Surveillance côté récepteur (uniquement possible en publication périodique)
  const age = now - T.mc.rxTime, codes = [];
  let local = 0;
  if (T.dds.mode === 'PERIODIC') {
    if (age > P.ddsLiveliness) { local = 2; codes.push({ lvl: 2, code: 'DDS_LIVELINESS_LOST', msg: M('mc.liveliness', { ms: N(age * 1000) }) }); }
    else if (age > P.ddsDeadline) { local = 1; codes.push({ lvl: 1, code: 'DDS_DEADLINE_MISSED', msg: M('mc.deadline', { ms: N(age * 1000) }) }); }
  }
  if (local > 0) { T.mc.localLvl = Math.max(T.mc.localLvl, local); T.mc.localUntil = now + 0.5; }
  else if (now > T.mc.localUntil) T.mc.localLvl = 0;
  T.mc.codes = codes;
  let lv = LEVEL[T.mc.rxMode], kind = T.mc.rxKind;
  if (T.mc.localLvl > lv) { lv = T.mc.localLvl; kind = 'COMFORT'; }
  if (T.ecuEmergency) { lv = 3; kind = 'MAX'; }
  T.mc.applied = NAMES[lv]; T.mc.appliedKind = kind;
  // Vue omnisciente : le simulateur sait que l'ordre n'est pas appliqué, le camion non.
  if (LEVEL[T.state] > lv) {
    if (!T.mismatchSince) T.mismatchSince = now;
    if (now - T.mismatchSince > 0.3 && !T.mismatchLogged) { T.mismatchLogged = true; logEv(T.id, 3, 'ORDER_NOT_APPLIED', M('log.mismatch', { sup: T.state, mc: NAMES[lv] })); }
  } else { T.mismatchSince = 0; T.mismatchLogged = false; }
}

/* Lien niveau 1 → niveau 2 (spec 002) : file ordonnée (FIFO), retardée par l'écart du profil de noyau avec PREEMPT_RT.
   Une somme de contrôle maison (pas un vrai CRC) permet au niveau 2 de détecter une consigne altérée. */
const l1Delay = () => latCpu() - P.latCpuRT;   // 0 avec PREEMPT_RT : la dynamique par défaut ne change pas
function sumOf(sp) {
  return (sp.session * 31 + sp.seq * 17 + Math.round(sp.ts * 1000) * 13 + Math.round(sp.vDemand * 1000) * 7 + Math.round(sp.dGoal * 100) * 3) % 65521;
}
function l1Send(T, kind, p) {
  const L = T.l2, at = Math.max(sim.t + l1Delay(), L.lastAt);   // jamais d'arrivée avant un message plus ancien
  L.lastAt = at; L.link.push({ at, kind, p });
}
AHT.inscrire('js/m2-comms-bus.js', 'dc14bd55');
