/* aht-safety-poc : module 3, AutonomyAndSafetyCore : perception, distance d'obstacle, bulle d'arrêt.
   @concern module-3
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* =====================================================================
   MODULE 3 — AutonomyAndSafetyCore
   Perception (LiDAR / radar / V2X), FMS (jetons, autorisation de mouvement),
   planificateur (évite les bulles), superviseur (vérifie), contrôleur.
   ===================================================================== */
function inDust(p, extra = 0) { return ENV.dust && Math.hypot(p.x - DUST.x, p.y - DUST.y) < DUST.r + extra; }
function poseOf(o) {
  if (o.kind === 'AHT') {
    const p = PATH.at(o.s), c = Math.cos(p.h), s = Math.sin(p.h);
    return { x: p.x, y: p.y, h: p.h, circ: [-5, 0, 5].map(d => ({ x: p.x + c * d, y: p.y + s * d, r: 4.6 })) };
  }
  const c = Math.cos(o.h), s = Math.sin(o.h);
  return { x: o.x, y: o.y, h: o.h, circ: [-1.4, 1.4].map(d => ({ x: o.x + c * d, y: o.y + s * d, r: 1.4 })) };
}
function perceive(T, all) {
  const me = T.pose, fx = me.x + Math.cos(me.h) * P.len / 2, fy = me.y + Math.sin(me.h) * P.len / 2;
  const lidarOk = !T.faults.lidar && !inDust(me, 27);
  const radarOk = !T.faults.radar;
  T.m.lidarOk = lidarOk; T.m.radarOk = radarOk;
  const out = [];
  for (const o of all) {
    if (o === T || o.alive === false) continue;
    const op = o.pose, d = Math.hypot(op.x - me.x, op.y - me.y);
    if (d > P.v2xRange + 30) continue;
    const df = Math.hypot(op.x - fx, op.y - fy), ang = Math.abs(angDiff(Math.atan2(op.y - fy, op.x - fx), me.h));
    const by = [];
    if (lidarOk && df < P.lidarRange && ang < P.lidarHalf && !inDust(op)) by.push('L');
    if (radarOk && df < P.radarRange && ang < P.radarHalf) by.push('R');
    if ((o.kind === 'AHT' || o.v2x) && d < P.v2xRange) by.push('V');
    if (by.length) out.push({ o, by });
  }
  T.perceived = out;
}
/* Distance le long de la trajectoire jusqu'au point où (x,y) entre dans le couloir du camion. */
function alongPath(s0, x, y, look, hw) {
  const hw2 = hw * hw; let best = Infinity, bestD = null, inside = false;
  for (let d = 0; d <= look; d += 2) {
    const p = PATH.pts[Math.floor(modL(s0 + d) / PATH.ds) % PATH.N];
    const q = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (q < hw2) { inside = true; if (q < best) { best = q; bestD = d; } }
    else if (inside) break;
  }
  return bestD;
}
function obstacleDistance(T) {
  const look = 230, vT = Math.max(T.v, 0.5);
  let best = Infinity, bestId = null, pred = false;
  for (const { o } of T.perceived) {
    const sh = o.pose, isT = o.kind === 'AHT', r = isT ? 4.6 : 1.5;
    if (Math.hypot(sh.x - T.pose.x, sh.y - T.pose.y) > look + 30 && !(o.kind === 'LV')) continue;
    const hw = P.wid / 2 + r + 1;
    for (const q of (isT ? sh.circ : [sh])) {
      const a = alongPath(T.s, q.x, q.y, look, hw);
      if (a !== null) { const d = Math.max(0, a - P.len / 2 - r); if (d < best) { best = d; bestId = o.id; pred = false; } }
    }
    if (!isT && Math.abs(o.v) > 0.5) {               // prédiction à vitesse constante (6 s)
      let tIn = null, tOut = null, dIn = Infinity;
      for (let t = 0.25; t <= 6; t += 0.25) {
        const px = sh.x + Math.cos(sh.h) * o.v * t, py = sh.y + Math.sin(sh.h) * o.v * t;
        const a = alongPath(T.s, px, py, look, hw);
        if (a !== null) { if (tIn === null) tIn = t; tOut = t; dIn = Math.min(dIn, Math.max(0, a - P.len / 2 - r)); }
        else if (tIn !== null) break;
      }
      if (tIn !== null) {
        const tArr = dIn / vT;
        if (tArr > tIn - 2.0 && tArr < tOut + 1.5 && dIn < best) { best = dIn; bestId = o.id; pred = true; }
      }
    }
  }
  T.m.dObs = best; T.m.obsId = bestId; T.m.obsPred = pred;
}
function bubble(T) {
  let gmin = Infinity;
  for (let d = 0; d <= 80; d += 10) gmin = Math.min(gmin, gradeAt(T.s + d));
  const env = brakeEnvelope(T.mass, gmin, ENV.mu);
  T.m.runaway = env.aEff < 0.15;
  T.m.env = env; T.m.grade = gmin; T.m.aEff = Math.max(env.aEff, 0.15);
  T.m.ddsLat = ddsBudget(T);
  T.m.tLat = P.latPer + latCpu() + T.m.ddsLat + (isFinite(T.m.brakeLat) ? T.m.brakeLat : 0.1) + P.latAct;
  T.m.dStop = stopDistance(T.v, T.m.tLat, T.m.aEff, P.marginSIL);
  T.m.dCaution = stopDistance(T.v, T.m.tLat, 0.5 * T.m.aEff, P.marginCaution);
}
function relI(T, I) {
  const f = modL(I.sIn - (T.s + P.len / 2));
  const inside = f > PATH.L - (I.sOut - I.sIn + P.len + 2);
  return { dIn: inside ? 0 : f, inside };
}
function planStopDist(T) { const a = Math.max(0.3, 0.4 * T.m.aEff); return T.v * 0.3 + T.v * T.v / (2 * a); }
AHT.inscrire('js/m3-perception.js', '5e282ef0');
