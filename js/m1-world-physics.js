/* aht-safety-poc : module 1, MineWorld et PhysicsEngine : mine, trajectoire, paramètres du modèle, enveloppe de freinage.
   @concern module-1
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/* =====================================================================
   MODULE 1 — MineWorld & PhysicsEngine
   Graphe routier (boucle de roulage + piste de service), pentes, dynamique
   longitudinale avec limites d'adhérence, de traction et de freinage.
   ===================================================================== */
const G = 9.81, DT = 0.02;               // pas fixe 50 Hz
const W = 640, H = 400;                  // repère mine en mètres
const P = {
  mEmpty: 160, mLoaded: 400,             // t
  Fbrake: 1.15e6, Ftrac: 0.9e6, Pmax: 2.6e6, Crr: 0.02,
  len: 15, wid: 9, marginSIL: 5, marginCaution: 15,
  vNom: 45 / 3.6, vRamp: 30 / 3.6, vCorner: 25 / 3.6, vDeg: 15 / 3.6,
  latPer: 0.10, latCpuRT: 0.05, latCpuGP: 0.25, latAct: 0.25, tauAct: 0.25,   // latCpu* : calcul du niveau 1, noyau PREEMPT_RT / généraliste (valeurs illustratives, spec 002)
  lidarRange: 110, lidarHalf: 60 * Math.PI / 180, radarRange: 170, radarHalf: 18 * Math.PI / 180, v2xRange: 300,
  ddsPeriod: 0.02, ddsDeadline: 0.04, ddsLiveliness: 0.10, ddsRetx: 0.03,
  canFrame: 0.00054, canDeadline: 0.04, canWatchdog: 0.10,
  fmsPeriod: 0.5, fmsLease: 2.0, authHorizon: 160, tokenReq: 175,
  gnssDR: 5.0, loadTime: 10, dumpTime: 6,
  // Niveau 1 → niveau 2 (spec 002) : échéance du battement, péremption d'une consigne, stabilité avant reprise, rejets consécutifs tolérés, historique du niveau 2
  l1Deadline: 0.30, l1Stale: 0.25, l1Stable: 1.0, l1RejBound: 10, l1Hist: 1.0,
  stateHold: 1.0   // maintien d'un état de sûreté après la disparition de sa cause (hystérésis du superviseur)
};
const ENV = { mu: 0.6, ramp: 0.10, dust: false, fms: true, scale: 2, paused: false, kernel: 'RT', l1Defect: 'OVERSPEED', l1Repeat: false };   // kernel : profil du calculateur d'autonomie, 'RT' (PREEMPT_RT, défaut) ou 'GP' (généraliste)
const latCpu = () => ENV.kernel === 'GP' ? P.latCpuGP : P.latCpuRT;
const DUST = { x: 352, y: 72, r: 68 };
const LEVEL = { NOMINAL: 0, DEGRADED_SPEED: 1, CONTROLLED_STOP: 2, EMERGENCY_BRAKE: 3 };
const NAMES = ['NOMINAL', 'DEGRADED_SPEED', 'CONTROLLED_STOP', 'EMERGENCY_BRAKE'];

const PATH = (() => {
  const x0 = 70, x1 = 570, y0 = 70, y1 = 330, r = 40, D = Math.PI / 180, raw = [];
  const line = (ax, ay, bx, by, kind, ramp) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 0.25);
    for (let i = 0; i < n; i++) { const u = i / n; raw.push({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u, kind, ramp, u }); }
  };
  const arc = (cx, cy, a0, a1) => {
    const n = Math.ceil(r * Math.abs(a1 - a0) / 0.25);
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; raw.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), kind: 'corner', ramp: 0, u: 0 }); }
  };
  line(x0 + r, y0, x1 - r, y0, 'top', 0);
  arc(x1 - r, y0 + r, -90 * D, 0);
  line(x1, y0 + r, x1, y1 - r, 'right', -1);     // rampe descendue chargé
  arc(x1 - r, y1 - r, 0, 90 * D);
  line(x1 - r, y1, x0 + r, y1, 'bottom', 0);
  arc(x0 + r, y1 - r, 90 * D, 180 * D);
  line(x0, y1 - r, x0, y0 + r, 'left', 1);       // rampe remontée à vide
  arc(x0 + r, y0 + r, 180 * D, 270 * D);
  let s = 0; raw[0].s = 0;
  for (let i = 1; i < raw.length; i++) { s += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y); raw[i].s = s; }
  const L = s + Math.hypot(raw[0].x - raw[raw.length - 1].x, raw[0].y - raw[raw.length - 1].y);
  const N = Math.round(L), ds = L / N, pts = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const si = i * ds;
    while (j < raw.length - 2 && raw[j + 1].s < si) j++;
    const a = raw[j], b = raw[j + 1], u = clamp((si - a.s) / ((b.s - a.s) || 1), 0, 1);
    pts.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, kind: a.kind, ramp: a.ramp, ru: a.u });
  }
  const e = 20 / 180;
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    pts[i].h = Math.atan2(b.y - a.y, b.x - a.x);
    pts[i].f = pts[i].ramp * clamp(Math.min(pts[i].ru / e, (1 - pts[i].ru) / e), 0, 1);
  }
  const at = s => {
    const q = (((s % L) + L) % L) / ds, i = Math.floor(q) % N, k = (i + 1) % N, u = q - Math.floor(q), a = pts[i], b = pts[k];
    const dh = angDiff(b.h, a.h);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, h: a.h + dh * u, f: a.f + (b.f - a.f) * u, kind: a.kind };
  };
  const nearestS = (x, y) => { let best = 1e12, bs = 0; for (let i = 0; i < N; i++) { const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2; if (d < best) { best = d; bs = i * ds; } } return bs; };
  return { pts, N, ds, L, at, nearestS };
})();
const modL = d => ((d % PATH.L) + PATH.L) % PATH.L;
const gradeAt = s => PATH.at(s).f * ENV.ramp;                     // >0 montée, <0 descente
const vLimitAt = s => { const p = PATH.pts[Math.floor(modL(s) / PATH.ds) % PATH.N]; return p.kind === 'corner' ? P.vCorner : Math.abs(p.f) > 0.05 ? P.vRamp : P.vNom; };
const S_SHOVEL = PATH.nearestS(150, 70), S_CRUSH = PATH.nearestS(230, 330);
const INTER = [{ id: 'I1', x: 330, y: 70 }, { id: 'I2', x: 330, y: 330 }].map(I => { const sc = PATH.nearestS(I.x, I.y); return { ...I, sc, sIn: sc - 16, sOut: sc + 16, holder: null }; });
const isLoadedSection = s => modL(s - S_SHOVEL) < modL(S_CRUSH - S_SHOVEL);

/* Disponibilité de freinage : séparation des deux limites physiques. */
function brakeEnvelope(massT, grade, mu) {
  const m = massT * 1000, th = Math.atan(grade);
  const aCap = P.Fbrake / m, aAdh = mu * G * Math.cos(th);
  const aBrake = Math.min(aCap, aAdh);
  return { aEff: aBrake + G * Math.sin(th), limit: aCap < aAdh ? 'lim.cap' : 'lim.adh', aCap, aAdh, gsin: G * Math.sin(th) };
}
function stopDistance(v, tLat, aEff, margin) { return v * tLat + v * v / (2 * Math.max(aEff, 0.15)) + margin; }
AHT.inscrire('js/m1-world-physics.js', '5d89779f');
