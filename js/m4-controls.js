/* aht-safety-poc : module 4, FaultInjector et TelemetryHUD : commandes du visiteur (clics, curseurs, clavier), langue, ouverture du guide.
   @concern module-4
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* ---------- Câblage des commandes ---------- */
function setLang(l) {
  if (!LANGS.includes(l)) return;
  if (l !== LANG) track('aht-safety-poc/lang-switch/' + l, 'aht-safety-poc · langue choisie : ' + l.toUpperCase());
  LANG = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  try { const u = new URL(location.href); u.searchParams.set('lang', l); history.replaceState(null, '', u); } catch (e) {}
  applyStatic();
  logDirty = true; hud(); syncControls(true);
}
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const charMap = { z: 'up', s: 'down', q: 'left', d: 'right', w: 'up', a: 'left' };
function keyOf(e) { return charMap[(e.key || '').toLowerCase()] || KEYMAP[e.code]; }
const releaseKeys = () => { for (const k in keys) keys[k] = false; };
const guide = $('guide'); let pausedBefore = false;
function openGuide(tab) {
  if (guide.open) return;
  track('aht-safety-poc/guide', 'aht-safety-poc · ouverture du guide');
  pausedBefore = ENV.paused; ENV.paused = true; releaseKeys();
  if (tab) showTab(tab);
  guide.showModal();
}
function showTab(t) {
  guide.querySelectorAll('[data-gtab]').forEach(b => { b.classList.toggle('on', b.dataset.gtab === t); b.setAttribute('aria-selected', String(b.dataset.gtab === t)); });
  guide.querySelectorAll('[data-gpane]').forEach(p => p.classList.toggle('on', p.dataset.gpane === t));
}

function brancherCommandes() {
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const T = sim.trucks[selected];
    if (b.dataset.lang) setLang(b.dataset.lang);
    else if (b.dataset.sel !== undefined) { selected = +b.dataset.sel; syncControls(); }
    else if (b.dataset.scale) ENV.scale = +b.dataset.scale;
    else if (b.dataset.scen) scenario(b.dataset.scen);
    else if (b.dataset.fault) { const f = b.dataset.fault; T.faults[f] = !T.faults[f]; logEv(T.id, 0, 'INJECT', M(T.faults[f] ? 'inj.on' : 'inj.off', { f }), 'info'); }
    else if (b.id === 'bFreeze') { if (T.l1.frozen) l1Restart(T); else l1Freeze(T); }
    else if (b.id === 'bSendDef') { T.l1.defect = ENV.l1Defect; T.l1.repeat = ENV.l1Repeat; }
    else if (b.id === 'bPause') ENV.paused = !ENV.paused;
    else if (b.id === 'bReset') { const noyau = ENV.kernel !== 'RT'; resetSim(); selected = 0; if (noyau) toast(t('toast.kernelReset')); }
    else if (b.id === 'bDust') { ENV.dust = !ENV.dust; logEv('SIM', 0, 'INJECT', M(ENV.dust ? 'dust.on' : 'dust.off'), 'info'); }
    else if (b.id === 'bFms') { ENV.fms = !ENV.fms; logEv('SIM', ENV.fms ? 0 : 2, 'INJECT', M(ENV.fms ? 'net.on' : 'net.off'), 'info'); }
    else if (b.id === 'bAck') {
      T.faults.estop = false; T.collided = false; T.ecuEmergency = false; T.latched = false; T.lowerAt = 0;
      if (T.can.babbling || (T.can.misprio && canResponse(T.can.load / 100) > P.canWatchdog)) toast(t('toast.cause'));
      logEv(T.id, 0, 'ACK', M('log.ack'), 'info');
    }
    syncControls(true);
  });
  $('selMu').addEventListener('change', e => { ENV.mu = +e.target.value; logEv('SIM', 0, 'ENV', M('log.mu', { mu: N(ENV.mu, 2) }), 'info'); });
  $('rRamp').addEventListener('input', e => { ENV.ramp = +e.target.value / 100; $('vRamp').textContent = e.target.value + ' %'; });
  $('rLoad').addEventListener('input', e => { sim.trucks[selected].can.load = +e.target.value; $('vLoad').textContent = e.target.value + ' %'; });
  $('cMisprio').addEventListener('change', e => { sim.trucks[selected].can.misprio = e.target.checked; });
  $('cBabble').addEventListener('change', e => { sim.trucks[selected].can.babbling = e.target.checked; });
  $('selDds').addEventListener('change', e => { const T = sim.trucks[selected]; T.dds.mode = e.target.value; T.mc.lastSent = null; T.mc.rxTime = sim.t; });
  $('rLoss').addEventListener('input', e => { sim.trucks[selected].dds.loss = +e.target.value / 100; $('vLoss').textContent = e.target.value + ' %'; });
  $('selMass').addEventListener('change', e => { sim.trucks[selected].massMode = e.target.value; });
  $('bArchi').addEventListener('click', () => openGuide('archi'));
  $('tabScope').addEventListener('click', () => showSideTab('scope'));
  $('tabL12').addEventListener('click', () => showSideTab('L12'));
  $('selKernel').addEventListener('change', e => { ENV.kernel = e.target.value; logEv('SIM', 0, 'ENV', M(ENV.kernel === 'GP' ? 'log.kernelGP' : 'log.kernelRT'), 'info'); });
  $('selDefect').addEventListener('change', e => { ENV.l1Defect = e.target.value; });
  $('cDefRepeat').addEventListener('change', e => { ENV.l1Repeat = e.target.checked; if (!ENV.l1Repeat) for (const T of sim.trucks) { T.l1.repeat = false; T.l1.defect = null; } });
  document.querySelectorAll('[data-layer]').forEach(c => c.addEventListener('change', () => { layers[c.dataset.layer] = c.checked; }));
  cv.addEventListener('mousedown', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    let best = 20, idx = -1;
    sim.trucks.forEach((T, i) => { const d = Math.hypot(T.pose.x - x, T.pose.y - y); if (d < best) { best = d; idx = i; } });
    if (idx >= 0) { selected = idx; syncControls(); }
  });
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    if ((e.key || '').toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) { guide.open ? guide.close() : openGuide(); return; }
    const k = keyOf(e); if (!k || document.activeElement !== cv) return;   // pilotage seulement carte active
    e.preventDefault(); keys[k] = true;
  });
  window.addEventListener('keyup', e => { const k = keyOf(e); if (k) keys[k] = false; });
  window.addEventListener('blur', releaseKeys);
  cv.addEventListener('blur', releaseKeys);
  guide.addEventListener('close', () => { ENV.paused = pausedBefore; });
  $('gClose').addEventListener('click', () => guide.close());
  guide.addEventListener('click', e => { if (e.target === guide) guide.close(); const b = e.target.closest('[data-gtab]'); if (b) showTab(b.dataset.gtab); });
  $('bGuide').addEventListener('click', () => openGuide());
  $('bV2x').addEventListener('click', () => { const c = $('cV2x'); c.checked = !c.checked; logEv('VL-VOUS', 0, 'V2X', M(c.checked ? 'v2x.on' : 'v2x.off'), 'info'); });
  $('bLvHome').addEventListener('click', () => { const L = sim.lvs.find(l => l.user); if (L) { Object.assign(L, { x: 336, y: 210, h: -Math.PI / 2, v: 0, steer: 0 }); L.pose = poseOf(L); } cv.focus(); });
}
AHT.inscrire('js/m4-controls.js', '95a13dd2');
