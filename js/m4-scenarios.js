/* aht-safety-poc : module 4, FaultInjector et TelemetryHUD : scénarios A à G et injection de pannes.
   @concern module-4
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* ---------- Scénarios ---------- */
function clearAll() {
  for (const T of sim.trucks) {
    T.faults = { lidar: false, radar: false, gnss: false, estop: false };
    T.can = { load: 25, misprio: false, babbling: false }; T.dds = { mode: 'PERIODIC', loss: 0 };
    T.latched = false; T.ecuEmergency = false; T.collided = false; T.massMode = 'AUTO';
    // Niveaux 1 et 2 : on répare les pannes injectées (gel, défaut) sans effacer l'historique des consignes ni la session,
    // pour qu'un rejeu reste un rejeu et que les numéros de séquence continuent là où ils en étaient.
    const A = T.l1, L = T.l2;
    A.frozen = false; A.defect = null; A.repeat = false; A.ev = { tFreeze: null, sFreeze: null, tDetect: null, sStill: null };
    L.hbLost = false; L.rejLost = false; L.rejRun = 0; L.stableSince = 0; L.rejStable = 0; L.lastValid = sim.t; L.rej = [];
  }
  ENV.dust = false; ENV.fms = true;
  sim.lvs = sim.lvs.filter(l => !l.ai);
}
function scenario(code) {
  track('aht-safety-poc/scenario/' + code, 'aht-safety-poc · scénario ' + code);
  clearAll();
  if (code === 'F' || code === 'G') { scenarioNiveau1(code); return; }   // F et G gardent le profil de noyau choisi (spec 002, S12b)
  // A à E sont calibrés sur PREEMPT_RT : le profil y revient, et le visiteur en est averti.
  const noyau = ENV.kernel !== 'RT';
  if (noyau) { ENV.kernel = 'RT'; logEv('SIM', 0, 'KERNEL_RESET', M('log.kernelReset'), 'info'); }
  const avis = noyau ? ' ' + t('toast.kernelReset') : '';
  if (code === 'E') {
    const T = sim.trucks[selected]; T.can.load = 75; T.can.misprio = true;
    toast(t('toast.scenE', { id: T.id }) + avis);
    syncControls(); return;
  }
  if (code === 'C') ENV.dust = true;
  sim.pending = code;
  if (!tryLaunch()) toast(t('toast.armed') + avis); else if (noyau) toast(t('toast.kernelReset'));
  syncControls();
}
/* Scénarios F et G (spec 002) : on s'en prend au niveau 1 du tombereau le plus rapide. Rien n'est tiré au hasard. */
function scenarioNiveau1(code) {
  sim.pending = null;
  const T = sim.trucks.reduce((b, x) => x.v > b.v ? x : b);
  selected = sim.trucks.indexOf(T);
  showSideTab('L12');
  if (code === 'F') {
    l1Freeze(T);
    logEv('SIM', 0, 'SCENARIO', M('log.scenF', { t: T.id }), 'info');
    toast(t('toast.scenF', { id: T.id }));
  } else {
    T.l1.defect = ENV.l1Defect; T.l1.repeat = ENV.l1Repeat;
    logEv('SIM', 0, 'SCENARIO', M('log.scenG', { t: T.id, d: RAW(ENV.l1Defect) }), 'info');
    toast(t('toast.scenG', { id: T.id }));
  }
  syncControls();
}
function tryLaunch() {
  const code = sim.pending, I = INTER[0];
  if (!code) return false;
  const etaTo = (T, d) => {          // cinématique grossière : accélération limitée par la puissance
    let t = T.task === 'LOADING' ? Math.max(0, T.taskT) : 0, v = T.task === 'LOADING' ? 0 : T.v, x = 0;
    while (x < d && t < 120) { const a = Math.max(0.2, Math.min(0.8, P.Pmax / (P.mLoaded * 1000 * Math.max(v, 1)) - G * P.Crr)); v = Math.min(P.vNom, v + a * 0.1); x += v * 0.1; t += 0.1; }
    return t;
  };
  const cands = sim.trucks.map(T => ({ T, r: relI(T, I) }))
    .filter(c => !c.r.inside && (T => T.task === 'LOADING' || (T.task === 'HAUL_LOADED' && modL(T.s - S_SHOVEL) < modL(I.sIn - S_SHOVEL) && c.r.dIn > 85))(c.T))
    .map(c => ({ ...c, eta: etaTo(c.T, c.r.dIn + 16) })).filter(c => c.eta > 7).sort((a, b) => a.eta - b.eta);
  if (!cands.length) return false;
  sim.pending = null;
  const T = cands[0].T, tArr = cands[0].eta;
  selected = sim.trucks.indexOf(T);
  const vLV = 30 / 3.6, equipped = code === 'A';
  if (code === 'D') { T.dds.mode = 'EVENT_BE'; T.dds.loss = 0.5; }
  const L = makeLV('VL-' + (10 + Math.floor(Math.random() * 89)), I.x + 3, I.y - vLV * tArr, Math.PI / 2, { ai: true, v2x: equipped, v: vLV, color: '#f08a3c' });
  sim.lvs.push(L);
  logEv('SIM', 0, 'SCENARIO', M('log.scenario', { c: code, lv: L.id, eq: M(equipped ? 'sc.eq' : 'sc.uneq'), t: T.id }), 'info');
  syncControls();
  return true;
}
AHT.inscrire('js/m4-scenarios.js', 'eead0095');
