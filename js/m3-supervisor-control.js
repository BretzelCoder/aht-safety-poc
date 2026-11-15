/* aht-safety-poc : module 3, AutonomyAndSafetyCore : superviseur de sûreté, contrôleur de mouvement, physique du tombereau.
   @concern module-3
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* Superviseur de sûreté : machine à états, indépendante du planificateur. */
function supervise(T) {
  const now = sim.t, codes = [];
  let sev = 0, kind = 'AUTH';
  const KORD = { AUTH: 0, COMFORT: 1, MAX: 2 };
  const add = (lvl, code, msg, k) => { codes.push({ lvl, code, msg }); if (lvl > sev) sev = lvl; if (lvl === 2 && k && KORD[k] > KORD[kind]) kind = k; };
  const m = T.m;
  if (!m.lidarOk && !m.radarOk) add(3, 'DM1_PERCEPTION_LOST', M('sup.percLost'));
  else if (!m.lidarOk) add(1, T.faults.lidar ? 'DM1_LIDAR_FAULT' : 'DM1_LIDAR_DUST', M(T.faults.lidar ? 'sup.lidarFault' : 'sup.lidarDust'));
  if (T.faults.radar && m.lidarOk) add(1, 'DM1_RADAR_FAULT', M('sup.radarFault'));
  if (T.faults.gnss) {
    const d = now - T.gnssLostAt;
    if (d > P.gnssDR) add(2, 'DM1_GNSS_DR_LIMIT', M('sup.gnssDr', { s: N(d) }), 'COMFORT');
    else add(1, 'DM1_GNSS_RTK_LOST', M('sup.gnssLost', { s: N(P.gnssDR - d) }));
  }
  if (now - T.auth.lastRx > P.fmsLease) add(2, 'FMS_LINK_LOST', M('sup.fmsLost', { m: N(Math.max(0, T.auth.sEnd - T.s)) }), 'AUTH');
  if (T.ecuEmergency) add(3, 'DM1_BRAKE_CMD_TIMEOUT', M('sup.ecu'));
  else if (m.brakeLat > P.canDeadline) add(2, 'CAN_BRAKE_DEADLINE', M('sup.canDeadline', { ms: N(m.brakeLat * 1000) }), 'COMFORT');
  if (m.busLoad > 40) add(0, 'CAN_BUSLOAD_HIGH', M('sup.busLoad', { p: N(m.busLoad) }));
  const ob = T.l2.obs;   // ce que le niveau 1 a rapporté (spec 002), pas la valeur interne du planificateur
  if (ob.dObs < m.dStop) add(2, 'SIL_BUBBLE_INTRUSION', M(ob.obsPred ? 'sup.intrusionPred' : 'sup.intrusion', { id: ob.obsId, d: N(ob.dObs), s: N(m.dStop) }), 'MAX');
  else if (ob.dObs < m.dCaution) add(1, 'CAUTION_ZONE', M(ob.obsPred ? 'sup.cautionPred' : 'sup.caution', { id: ob.obsId, d: N(ob.dObs), c: N(m.dCaution) }));
  // Battement du niveau 1 (spec 002) : le niveau 2 décide seul. La perte dure jusqu'à ce que des consignes bien formées arrivent
  // sans interruption pendant P.l1Stable ; la reprise passe ensuite par l'hystérésis habituelle de l'état. Jamais verrouillée.
  const L2 = T.l2, hbAge = now - L2.lastValid;
  if (hbAge > P.l1Deadline) { L2.hbLost = true; L2.stableSince = 0; }
  else if (L2.hbLost) { if (!L2.stableSince) L2.stableSince = now; if (now - L2.stableSince >= P.l1Stable) L2.hbLost = false; }
  if (L2.hbLost) {
    const dl = N(P.l1Deadline * 1000);
    add(2, 'L1_HEARTBEAT_LOST', hbAge > P.l1Deadline ? M('sup.l1Lost', { ms: N(hbAge * 1000), dl }) : M('sup.l1Back', { s: N(now - L2.stableSince, 1), need: N(P.l1Stable, 1) }), 'MAX');
  }
  // Délai de détection : l'instant où le silence dépasse l'échéance après un gel (et non dès que la perte est active : un nouveau gel pendant la reprise donnait alors 0,02 s).
  if (hbAge > P.l1Deadline && T.l1.ev.tFreeze !== null && T.l1.ev.tDetect === null) T.l1.ev.tDetect = now;
  // Rejets consécutifs : un niveau 1 vivant mais qui se trompe sans cesse est traité comme un niveau 1 perdu (même arrêt, même reprise).
  if (L2.rejRun >= P.l1RejBound) { L2.rejLost = true; L2.rejStable = 0; }
  else if (L2.rejLost) {
    if (L2.rejRun > 0) L2.rejStable = 0;
    else { if (!L2.rejStable) L2.rejStable = now; if (now - L2.rejStable >= P.l1Stable) L2.rejLost = false; }
  }
  if (L2.rejLost) add(2, 'L1_SETPOINTS_REJECTED', L2.rejRun >= P.l1RejBound ? M('sup.l1Rej', { n: L2.rejRun }) : M('sup.l1RejBack', { s: N(L2.rejStable ? now - L2.rejStable : 0, 1), need: N(P.l1Stable, 1) }), 'MAX');
  if (T.l1.ev.tDetect !== null && T.l1.ev.sStill === null && T.v < 0.3) T.l1.ev.sStill = T.s;   // arrêt au sens du modèle : moins de 0,3 m/s
  if (T.faults.estop) add(3, 'REMOTE_ESTOP', M('sup.estop'));
  if (T.collided) add(3, 'COLLISION', M('sup.contact'));
  if (m.runaway) add(2, 'BRAKE_MARGIN_LOW', M('sup.runaway'), 'MAX');
  if (sev >= 3 && !T.latched) T.latched = true;
  let target = T.latched ? 3 : sev;
  const cur = LEVEL[T.state];
  if (target >= cur) { if (target > 0) T.lowerAt = now + P.stateHold; }
  else if (now < T.lowerAt) target = cur;
  const prev = T.state;
  T.state = NAMES[target];
  if (target === 2 && sev === 2) T.stopKind = kind;
  else if (target === 3) T.stopKind = 'MAX';
  else if (target < 2) T.stopKind = 'AUTH';
  if (prev !== T.state) logEv(T.id, target, 'STATE', RAW(`${prev} → ${T.state}${codes.filter(c => c.lvl === target).map(c => ' · ' + c.code).join('')}`), 'st');
  T.reasons = codes;
  syncCodes(T, codes.concat(T.mc.codes || []));
}

/* Contrôleur de mouvement (ECU temps réel) + actionneurs + physique. */
function control(T) {
  const mode = T.mc.applied;
  let vT = T.l2.vAccepted, decLim = Math.max(0.4, 0.6 * T.m.aEff), full = false;   // la consigne acceptée par le niveau 2, pas celle du planificateur
  if (mode === 'DEGRADED_SPEED') vT = Math.min(vT, P.vDeg);
  if (mode === 'CONTROLLED_STOP') {
    if (T.mc.appliedKind === 'MAX') { vT = 0; full = true; }
    else if (T.mc.appliedKind === 'COMFORT') { vT = 0; decLim = Math.max(0.4, 0.5 * T.m.aEff); }
  }
  if (mode === 'EMERGENCY_BRAKE') { vT = 0; full = true; }
  const aDes = full ? -50 : clamp(2.0 * (vT - T.v), -decLim, 0.8);
  T.cmdBuf.push({ t: sim.t, a: aDes });
  if (T.cmdBuf.length > 400) T.cmdBuf.shift();
  T.fullBrake = full;
}
function physics(T) {
  let aCmd = T.lastCmd;
  if (T.ecuEmergency) aCmd = -50;
  else {
    const tq = sim.t - T.m.brakeLat + 1e-9;
    for (let i = T.cmdBuf.length - 1; i >= 0; i--) if (T.cmdBuf[i].t <= tq) { aCmd = T.cmdBuf[i].a; break; }
  }
  T.lastCmd = aCmd;
  const m = T.mass * 1000, th = Math.atan(gradeAt(T.s)), sn = Math.sin(th), cs = Math.cos(th);
  const rr = T.v > 0.05 ? G * P.Crr : 0;
  const Fadh = ENV.mu * m * G * cs;
  const Fdes = clamp(m * (aCmd + G * sn + rr), -Math.min(P.Fbrake, Fadh), Math.min(P.Ftrac, P.Pmax / Math.max(T.v, 1), 0.6 * Fadh));
  T.F += (Fdes - T.F) * Math.min(1, DT / P.tauAct);
  const a = T.F / m - G * sn - rr;
  T.v = Math.max(0, T.v + a * DT);
  T.s += T.v * DT; T.a = a;
}
AHT.inscrire('js/m3-supervisor-control.js', '6181f0b2');
