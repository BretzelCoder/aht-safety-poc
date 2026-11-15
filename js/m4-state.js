/* aht-safety-poc : module 4, FaultInjector et TelemetryHUD : état de la simulation, tombereaux et véhicules, journal, pas de simulation.
   @concern module-4
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* =====================================================================
   MODULE 4 — FaultInjector & TelemetryHUD (état, véhicules humains, journal)
   ===================================================================== */
let sim, selected = 0;
const keys = { up: false, down: false, left: false, right: false };
const layers = { bubbles: true, auth: true, sensors: true, links: true };
const TRUCK_COLORS = ['#f0c24b', '#7fd0e0', '#f29a6b'];

function makeTruck(id, s, color) {
  const loaded = isLoadedSection(s);
  return {
    id, kind: 'AHT', color, s, v: 8, F: 0, a: 0, mass: loaded ? P.mLoaded : P.mEmpty, massAuto: loaded ? P.mLoaded : P.mEmpty, massMode: 'AUTO',
    task: loaded ? 'HAUL_LOADED' : 'HAUL_EMPTY', taskT: 0, taskDist: 0,
    faults: { lidar: false, radar: false, gnss: false, estop: false }, gnssLostAt: 0,
    can: { load: 25, misprio: false, babbling: false }, dds: { mode: 'PERIODIC', loss: 0 },
    state: 'NOMINAL', stopKind: 'AUTH', latched: false, lowerAt: 0, reasons: [], active: new Map(),
    mc: { rxMode: 'NOMINAL', rxKind: 'AUTH', rxTime: 0, rxSent: -1, lastLat: 0, queue: [], lastSent: null, applied: 'NOMINAL', appliedKind: 'AUTH', localLvl: 0, localUntil: 0, codes: [] },
    l1: newL1(), l2: newL2(),
    ecuEmergency: false, cmdBuf: [], lastCmd: 0, auth: { sEnd: s + P.authHorizon, lastRx: 0 }, vPlan: 0, planTag: '',
    m: { dObs: Infinity, brakeLat: 0, diagLat: 0, busLoad: 0, aEff: 1, tLat: 0.5, dStop: 0, dCaution: 0, lidarOk: true, radarOk: true, env: null, grade: 0, ddsLat: 0 },
    perceived: [], hist: [], collided: false, mismatchSince: 0, pose: null
  };
}
function makeLV(id, x, y, h, o) { const L = { id, kind: 'LV', x, y, h, v: o.v || 0, steer: 0, v2x: o.v2x, ai: !!o.ai, user: !!o.user, alive: true, color: o.color }; L.pose = poseOf(L); return L; }
function resetSim() {
  sim = { pending: null, t: 0, tick: 0, nextFms: 0, nextHist: 0, cycles: 0, tons: 0, collisions: 0, contacts: new Set(), flashes: [], log: [], lastLog: new Map() };
  sim.trucks = [makeTruck('AHT-01', S_SHOVEL + 240, TRUCK_COLORS[0]), makeTruck('AHT-02', S_SHOVEL + 760, TRUCK_COLORS[1]), makeTruck('AHT-03', S_SHOVEL - 260, TRUCK_COLORS[2])];
  sim.lvs = [makeLV('VL-VOUS', 336, 210, -Math.PI / 2, { user: true, v2x: $('cV2x').checked, color: '#f4f1ea' })];
  for (const T of sim.trucks) T.pose = poseOf(T);
  for (const I of INTER) I.holder = null;
  const noyau = ENV.kernel;
  ENV.dust = false; ENV.fms = true; ENV.kernel = 'RT';
  logEv('SIM', 0, 'INFO', M('log.started'), 'info');
  if (noyau !== 'RT') logEv('SIM', 0, 'KERNEL_RESET', M('log.kernelReset'), 'info');
  syncControls();
}
/* msg : message {k, p} traduit à l'affichage (voir I18N), ou RAW(texte). */
function logEv(id, lvl, code, msg, cls) {
  if (!sim) return;
  const key = id + code, last = sim.lastLog.get(key);
  if (code !== 'STATE' && code !== 'COLLISION' && last !== undefined && sim.t - last < 3) return;
  sim.lastLog.set(key, sim.t);
  sim.log.push({ t: sim.t, id, lvl, code, msg, cls: cls || 'l' + lvl });
  if (sim.log.length > 250) sim.log.shift();
  logDirty = true;
}
function syncCodes(T, codes) {
  const now = new Map(codes.map(c => [c.code, c]));
  for (const [k, c] of now) if (!T.active.has(k)) logEv(T.id, c.lvl, k, c.msg);
  for (const [k] of T.active) if (!now.has(k)) { const lk = T.id + k + ':off', last = sim.lastLog.get(lk); if (last === undefined || sim.t - last > 3) { sim.lastLog.set(lk, sim.t); sim.log.push({ t: sim.t, id: T.id, lvl: 0, code: k, msg: M('log.resolved'), cls: 'off' }); logDirty = true; } }
  T.active = now;
}
function updateUserLV(L) {
  const vmax = 60 / 3.6;
  if (keys.up) L.v = Math.min(vmax, L.v + 3 * DT);
  else if (keys.down) L.v = L.v > 0 ? Math.max(0, L.v - 7 * DT) : Math.max(-10 / 3.6, L.v - 2 * DT);
  else L.v -= Math.sign(L.v) * Math.min(Math.abs(L.v), 0.8 * DT);
  const st = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  L.steer += (st * 0.55 - L.steer) * Math.min(1, DT * 6);
  L.h += L.v / 3.2 * Math.tan(L.steer) * DT;
  L.x = clamp(L.x + Math.cos(L.h) * L.v * DT, 3, W - 3);
  L.y = clamp(L.y + Math.sin(L.h) * L.v * DT, 3, H - 3);
}
function collisions() {
  const vs = [...sim.trucks, ...sim.lvs.filter(l => l.alive)];
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    const A = vs[i], B = vs[j];
    if (A.kind === 'LV' && B.kind === 'LV') continue;
    if (Math.hypot(A.pose.x - B.pose.x, A.pose.y - B.pose.y) > 22) { sim.contacts.delete(A.id + B.id); continue; }
    let hit = false;
    for (const a of A.pose.circ) for (const b of B.pose.circ) if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) hit = true;
    const key = A.id + B.id;
    if (hit && !sim.contacts.has(key)) {
      sim.contacts.add(key); sim.collisions++;
      sim.flashes.push({ x: (A.pose.x + B.pose.x) / 2, y: (A.pose.y + B.pose.y) / 2, t: sim.t });
      const T = A.kind === 'AHT' ? A : B, O = T === A ? B : A;
      const how = T.v < 0.3 ? M('coll.stopped', { o: O.id }) : M('coll.moving', { v: N(T.v * 3.6) });
      logEv(T.id, 3, 'COLLISION', M('coll.contact', { o: O.id, how }));
      for (const V of [A, B]) { if (V.kind === 'AHT') V.collided = true; else V.v = 0; }
    } else if (!hit) sim.contacts.delete(key);
  }
}
function step() {
  sim.t += DT; sim.tick++;
  for (const L of sim.lvs) {
    if (!L.alive) continue;
    if (L.user) { L.v2x = $('cV2x').checked; updateUserLV(L); }
    else if (L.ai) { L.x += Math.cos(L.h) * L.v * DT; L.y += Math.sin(L.h) * L.v * DT; if (L.y > H + 60) L.alive = false; }
  }
  sim.lvs = sim.lvs.filter(l => l.alive);
  for (const V of [...sim.trucks, ...sim.lvs]) V.pose = poseOf(V);
  if (sim.t >= sim.nextFms) { fmsTick(); sim.nextFms += P.fmsPeriod; if (sim.pending) tryLaunch(); }
  const all = [...sim.trucks, ...sim.lvs];
  for (const T of sim.trucks) {
    opsUpdate(T); canUpdate(T); perceive(T, all); bubble(T); obstacleDistance(T);
    l2Measure(T); l1EmitReport(T); l2Receive(T);
    supervise(T); ddsPublish(T); mcReceive(T);
    T.vPlan = planSpeed(T); l1EmitSetpoint(T); l2Receive(T); control(T); physics(T);
  }
  collisions();
  if (sim.t >= sim.nextHist) {
    sim.nextHist += 0.1;
    for (const T of sim.trucks) {
      const ddsMs = T.dds.mode === 'PERIODIC' ? (sim.t - T.mc.rxTime) * 1000 : T.mc.lastLat * 1000;
      T.hist.push({ t: sim.t, load: T.m.busLoad + (T.can.babbling ? 0 : (Math.random() - 0.5) * 3), brake: T.m.brakeLat * 1000 * (0.85 + Math.random() * 0.3), diag: T.m.diagLat * 1000 * (0.6 + Math.random() * 0.6), dds: ddsMs, lvl: LEVEL[T.state] });
      if (T.hist.length > 160) T.hist.shift();
    }
  }
}
AHT.inscrire('js/m4-state.js', '4d91584e');
