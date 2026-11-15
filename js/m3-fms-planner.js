/* aht-safety-poc : module 3, AutonomyAndSafetyCore : FMS (intersections, autorisation de mouvement), cycle d'exploitation, planificateur.
   @concern module-3
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* FMS : allocation des intersections et autorisation de mouvement (2 Hz). */
function fmsTick() {
  if (!ENV.fms) return;
  for (const I of INTER) {
    const lvs = sim.lvs.filter(l => l.alive && l.v2x).map(l => {
      const dx = I.x - l.x, dy = I.y - l.y, d = Math.hypot(dx, dy);
      const closing = (Math.cos(l.h) * dx + Math.sin(l.h) * dy) / (d || 1) * Math.sign(l.v || 1);
      const inside = d < 20, approaching = closing > 0.3 && Math.abs(l.v) > 0.5;
      return { l, inside, eta: inside ? 0 : approaching && d < 220 ? Math.max(0, d - 18) / Math.max(Math.abs(l.v), 1) : Infinity };
    });
    const need = lvs.filter(x => x.inside || x.eta < 15);
    const lvEta = need.length ? Math.min(...need.map(x => x.eta)) : Infinity;
    const H0 = I.holder;
    if (H0 && H0.kind === 'AHT') {
      const r = relI(H0, I);
      if (!r.inside && r.dIn > P.tokenReq + 10) { I.holder = null; }
      else if (!r.inside && need.length) {
        const etaT = r.dIn / Math.max(H0.v, 3);
        if (lvEta < etaT + 6 && planStopDist(H0) < r.dIn - 4) {
          I.holder = null;
          logEv('FMS', 1, 'TOKEN_REVOKED', M('fms.revoked', { i: I.id, t: H0.id, lv: need[0].l.id, eta: N(lvEta) }));
        }
      }
    }
    if (I.holder && I.holder.kind === 'LV' && !need.length) { logEv('FMS', 0, 'TOKEN_RELEASED', M('fms.released', { i: I.id, lv: I.holder.id })); I.holder = null; }
    if (!I.holder) {
      const cands = sim.trucks.map(T => ({ T, r: relI(T, I) })).filter(c => c.r.inside || c.r.dIn < P.tokenReq).sort((a, b) => a.r.dIn - b.r.dIn);
      const c = cands[0];
      const etaC = c ? c.r.dIn / Math.max(c.T.v, 3) : Infinity;
      if (c && (c.r.inside || !need.length || etaC + 6 < lvEta)) I.holder = c.T;
      else if (need.length) { I.holder = need[0].l; logEv('FMS', 0, 'TOKEN_GRANTED', M('fms.granted', { i: I.id, lv: need[0].l.id })); }
    }
  }
  for (const T of sim.trucks) {
    let end = T.s + P.authHorizon;
    for (const I of INTER) {
      const r = relI(T, I);
      if (!r.inside && r.dIn < P.authHorizon + P.len && I.holder !== T) end = Math.min(end, T.s + r.dIn - 4);
    }
    T.auth.sEnd = Math.max(T.s, end); T.auth.lastRx = sim.t;
  }
}

function opsUpdate(T) {
  const now = sim.t;
  if (T.task === 'LOADING' || T.task === 'DUMPING') {
    T.taskT -= DT;
    if (T.task === 'LOADING') T.massAuto = P.mEmpty + (P.mLoaded - P.mEmpty) * Math.min(1, Math.floor((1 - T.taskT / P.loadTime) * 4 + 1e-9) / 4);
    if (T.taskT <= 0) {
      if (T.task === 'LOADING') { T.task = 'HAUL_LOADED'; T.massAuto = P.mLoaded; logEv(T.id, 0, 'CYCLE', M('cycle.loaded')); }
      else { T.task = 'HAUL_EMPTY'; T.massAuto = P.mEmpty; sim.cycles++; sim.tons += 240; logEv(T.id, 0, 'CYCLE', M('cycle.dumped')); }
    }
  } else {
    const target = T.task === 'HAUL_LOADED' ? S_CRUSH : S_SHOVEL;
    let d = modL(target - T.s); if (d > PATH.L - 3) d = 0;
    if (d < 3 && T.v < 0.2) { T.task = T.task === 'HAUL_LOADED' ? 'DUMPING' : 'LOADING'; T.taskT = T.task === 'DUMPING' ? P.dumpTime : P.loadTime; }
    T.taskDist = d;
  }
  T.mass = T.massMode === 'EMPTY' ? P.mEmpty : T.massMode === 'LOADED' ? P.mLoaded : T.massAuto;
  if (T.faults.gnss && !T.gnssLostAt) T.gnssLostAt = now;
  if (!T.faults.gnss) T.gnssLostAt = 0;
}

/* Planificateur : vitesse admissible pour s'arrêter avant chaque contrainte. */
function planSpeed(T) {
  const aPlan = Math.max(0.3, 0.4 * T.m.aEff);
  let v = Infinity, tag = M('plan.mission');
  for (let d = 0; d <= 150; d += 5) v = Math.min(v, Math.sqrt(vLimitAt(T.s + P.len / 2 + d) ** 2 + 2 * aPlan * d));
  const consider = (d, why) => { const vv = Math.sqrt(2 * aPlan * Math.max(0, d - 2.5)); if (vv < v - 0.05) { v = vv; tag = why; } };
  const authD = T.auth.sEnd - T.s;
  let why = M('plan.authEnd');
  for (const I of INTER) { const r = relI(T, I); if (!r.inside && Math.abs(r.dIn - 4 - authD) < 2 && I.holder !== T) why = I.holder ? M('plan.tokenHeld', { i: I.id, h: I.holder.id }) : M('plan.token', { i: I.id }); }
  consider(authD, why);
  if (T.task === 'LOADING' || T.task === 'DUMPING') { v = 0; tag = M(T.task === 'LOADING' ? 'plan.loading' : 'plan.dumping', { s: N(T.taskT) }); }
  else consider(T.taskDist + 2, M(T.task === 'HAUL_LOADED' ? 'plan.crusher' : 'plan.shovel'));
  let gap = Infinity, leader = null;
  for (const o of sim.trucks) if (o !== T) { const g = modL(o.s - T.s) - P.len; if (g < gap) { gap = g; leader = o; } }
  if (leader) consider(gap - 20 - T.v * 0.5, M('plan.follow', { id: leader.id }));
  T.planTag = tag;
  return v;
}
AHT.inscrire('js/m3-fms-planner.js', '73f1a8a1');
