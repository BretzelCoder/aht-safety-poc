/* aht-safety-poc : module 4, FaultInjector et TelemetryHUD : tableau de bord (onglets, niveaux 1 et 2, mesures, journal, message éphémère).
   @concern module-4
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* ---------- HUD ---------- */
/* Carte à deux onglets : oscilloscope ou vue « niveaux 1 ↔ 2 » (spec 002). */
let sideTab = 'scope';
function showSideTab(name) {
  sideTab = name;
  for (const [id, n] of [['tabScope', 'scope'], ['tabL12', 'L12']]) { $(id).classList.toggle('on', name === n); $(id).setAttribute('aria-selected', String(name === n)); }
  $('scope').hidden = name !== 'scope'; $('paneL12').hidden = name !== 'L12'; $('bArchi').hidden = name !== 'L12';
  document.body.classList.toggle('l12open', name === 'L12');   // le journal cède un peu de hauteur à la vue des échanges
  scheduleResize();                                   // le canvas de l'oscilloscope retrouve sa taille quand on le réaffiche
  if (sim) hud();
}
function l1Status(T) {
  if (T.l1.frozen) return 'silent';
  const rj = T.l2.rej[T.l2.rej.length - 1];
  return T.l2.rejRun > 0 || T.l1.defect || (rj && sim.t - rj.t < 1) ? 'faulty' : 'running';
}
const BRAKE_ETAT = ['released', 'service', 'full', 'watchdog'], BRAKE_MSG = ['l12.brRel', 'l12.brSvc', 'l12.brFull', 'l12.brWd'];
/* Les deux calculateurs du tombereau sélectionné : ce que le niveau 1 annonce, ce que le niveau 2 mesure. */
function renderL12(T) {
  const A = T.l1, L = T.l2, ex = L.ex[L.ex.length - 1], st = l1Status(T);
  const br = T.ecuEmergency ? 3 : T.fullBrake ? 2 : T.lastCmd < -0.2 ? 1 : 0, hb = sim.t - L.lastValid;
  // Reprise : pendant que le battement, ou les consignes, sont revenus et que la stabilité se confirme, le temps restant avant le
  // relâchement prend la place de l'âge du battement (qui vaut alors zéro).
  const recup = (L.hbLost && L.stableSince && sim.t - L.lastValid <= P.l1Deadline) ? P.l1Stable - (sim.t - L.stableSince)
    : (L.rejLost && L.rejStable && L.rejRun === 0) ? P.l1Stable - (sim.t - L.rejStable) : null;
  // Le décompte va jusqu'au relâchement réel : fin de la stabilité, puis maintien d'état ; une fois la cause disparue, il ne reste que le maintien.
  const reste = recup !== null ? recup + P.stateHold
    : (!L.hbLost && !L.rejLost && !T.latched && !T.reasons.some(r => r.lvl > 0) && LEVEL[T.state] > 0 && T.lowerAt > sim.t) ? T.lowerAt - sim.t : null;
  const row = (k, v) => `<div><span>${k}</span><span class="num">${v}</span></div>`;
  // Gel du niveau 1 (scénario F) : délai de détection puis distance parcourue depuis le gel (jusqu'ici tant que le camion freine,
  // « … » à la fin), mesurés par le modèle. Quatrième rangée du bloc, libre, en face de « Freins » ; l'infobulle donne la phrase complète.
  const ev = A.ev, fini = ev.sStill !== null;
  const frzP = { s: N(ev.tDetect - ev.tFreeze, 2), m: N((fini ? ev.sStill : T.s) - ev.sFreeze, 1) };
  const frz = ev.tDetect === null ? '' : `<div title="${t(fini ? 'l12.frzDone' : 'l12.frz', frzP)}"><span>${t('l12.frzLbl')}</span><span class="num">${rp(frzP.s)} s · ${rp(frzP.m)} m${fini ? '' : ' …'}</span></div>`;
  const b1 = $('blkL1'), b2 = $('blkL2');
  b1.dataset.status = st; b2.dataset.brake = BRAKE_ETAT[br];
  b1.innerHTML = `<h4>${t('l12.l1')}</h4><small class="kl"><span>${t('l12.kernel')}</span><b>${t(ENV.kernel === 'GP' ? 'l12.kGP' : 'l12.kRT')}</b></small><small>${t('l12.cl1')}</small>` +
    `<span class="chip"><i class="${{ running: 'g', silent: 'r', faulty: 'a' }[st]}"></i>${t('l12.' + st)}</span>` +
    row(t('l12.session'), `${A.session} · #${A.seq}`) +
    row(t('l12.pos'), ex ? `${fmt(ex.sClaim, 0)} m` : '—') + row(t('l12.spd'), ex ? `${fmt(ex.vClaim * 3.6, 1)} km/h` : '—') + frz;
  b2.innerHTML = `<h4>${t('l12.l2')}</h4><small class="kl"><span>${t('l12.timeout')}</span><b>${fmt(P.l1Deadline * 1000, 0)} ms</b></small><small>${t('l12.cl2')}</small>` +
    `<span class="chip"><i style="background:${STATE_COL[LEVEL[T.state]]}"></i>${T.state}</span>` +
    (reste !== null ? row(t('l12.release'), `${fmt(Math.max(0, reste), 1)} s`) : row(t('l12.hb'), `${fmt(hb * 1000, 0)} ms`)) +
    row(t('l12.pos'), `${fmt(T.s, 0)} m`) + row(t('l12.spd'), `${fmt(T.v * 3.6, 1)} km/h`) +
    row(t('l12.brake'), t(BRAKE_MSG[br]));
  // Échanges : les 5 derniers jugements, plus les rejets plus anciens qui en sont sortis (3 au plus), lus dans les données
  // stockées et rédigés à l'affichage : un changement de langue retraduit aussi l'historique.
  const exs = [...L.rej.filter(e => !L.ex.includes(e)), ...L.ex];
  let h = `<div class="xr hd"><span>#</span><span>s</span><span>km/h</span><span>m</span><span>Σ</span><span>${t('l12.hVerdict')}</span></div>`;
  h += exs.length ? exs.map(e => `<div class="xr${e.ok ? '' : ' bad'}"><span>#${e.seq}</span><span>${fmt(e.ts, 2)}</span><span>${fmt(e.v * 3.6, 1)}</span><span>${fmt(e.d, 0)}</span><span>${e.sumOk ? '✓' : '✗'}</span><span>${e.ok ? t('l12.ok') : e.code}</span></div>`).join('') : `<div class="none">${t('l12.noEx')}</div>`;
  const rj = L.rej[L.rej.length - 1];
  if (rj) h += `<div class="why">${rp(rj.msg)}</div>`;
  $('exL12').innerHTML = h;
}
let logDirty = true, lastTabs = '';
function chip(ok, label, tri) { return `<span class="chip"><i class="${tri || (ok ? 'g' : 'r')}"></i>${label}</span>`; }
function hud() {
  const T = sim.trucks[selected], m = T.m, lv = LEVEL[T.state];
  $('kTime').textContent = `${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')}`;
  $('kCol').textContent = sim.collisions; $('kCol').style.color = sim.collisions ? 'var(--emer)' : '';
  $('kCycles').textContent = sim.cycles; $('kTons').textContent = sim.tons.toLocaleString(LOCALE[LANG]);
  const tabsHtml = sim.trucks.map((t, i) => `<button data-sel="${i}" class="${i === selected ? 'on' : ''}" style="border-left:4px solid ${t.color}">${t.id} <span style="color:${STATE_COL[LEVEL[t.state]]}">●</span></button>`).join('');
  if (tabsHtml !== lastTabs) { $('tabs').innerHTML = tabsHtml; lastTabs = tabsHtml; }
  const pill = $('statePill'); pill.textContent = T.state; pill.className = 'pill s' + lv;
  $('stateSub').textContent = `${rp(T.planTag)}${T.latched ? t('hud.latched') : ''}`;
  const al = LEVEL[T.mc.applied];
  $('appliedLine').innerHTML = `${t('hud.applied')} <b style="color:${STATE_COL[al]}">${T.mc.applied}</b>${T.mc.appliedKind && al === 2 ? ` (${t('hud.k' + T.mc.appliedKind)})` : ''}${al < lv ? ` <span class="mismatch">${t('hud.notReceived')}</span>` : ''}`;
  $('reasons').innerHTML = T.reasons.length ? T.reasons.map(r => `<li class="l${r.lvl}"><span class="num">${codeName(r.code)}</span> · ${rp(r.msg)}</li>`).join('') : `<li class="l0">${t('hud.noAlert')}</li>`;
  const v = T.v, env = m.env || brakeEnvelope(T.mass, 0, ENV.mu);
  $('formula').innerHTML =
    `a_eff = min(F/m, μ·g·cosθ) − g·|sinθ|<sub>desc</sub><br>` +
    `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; = min(<span class="hl">${fmt(env.aCap, 2)}</span>, <span class="hl">${fmt(env.aAdh, 2)}</span>) ${env.gsin < 0 ? '− ' + fmt(-env.gsin, 2) : '+ ' + fmt(env.gsin, 2)} = <span class="hl">${fmt(m.aEff, 2)} m/s²</span><br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="color:#9a9ea6">${t('hud.limit', { l: M(env.limit) })}</span><br>` +
    `d_stop = v·t_lat + v²/(2·a_eff) + ${t('hud.margin')}<br>` +
    `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; = ${fmt(v * m.tLat, 1)} + ${fmt(v * v / (2 * m.aEff), 1)} + 5 = <span class="hl">${fmt(m.dStop, 1)} m</span>`;
  // Décomposition de t_lat : le terme de calcul du niveau 1 change avec le profil de noyau (spec 002, S13).
  const ms = (x, d = 0) => fmt(x * 1000, d);
  $('tlat').innerHTML = `<span>${t('hud.tPer')} ${ms(P.latPer)}</span><span class="${ENV.kernel === 'GP' ? 'hl' : ''}">${t('hud.tCpu')} ${ms(latCpu())}</span><span>DDS ${ms(m.ddsLat)}</span><span>CAN ${ms(isFinite(m.brakeLat) ? m.brakeLat : 0.1, 1)}</span><span>${t('hud.tAct')} ${ms(P.latAct)}</span>`;
  $('metrics').innerHTML = [
    [t('met.speed'), `${fmt(v * 3.6, 1)} km/h`], [t('met.mass'), `${fmt(T.mass, 0)} t`],
    ['t_lat', `${fmt(m.tLat * 1000, 0)} ms`], [t('met.caution'), `${fmt(m.dCaution, 1)} m`],
    [t('met.obstacle'), isFinite(m.dObs) ? t('met.obsAt', { id: m.obsId, d: N(m.dObs) }) + (m.obsPred ? t('met.pred') : '') : t('met.none')], [t('met.auth'), `${fmt(Math.max(0, T.auth.sEnd - T.s), 0)} m`]
  ].map(([k, val]) => `<div><span>${k}</span><span class="num">${val}</span></div>`).join('');
  const vr = 40 / 3.6, tl = m.tLat, row = mass => [0, -ENV.ramp].map(gr => fmt(stopDistance(vr, tl, Math.max(0.15, brakeEnvelope(mass, gr, ENV.mu).aEff), P.marginSIL), 0) + ' m');
  const e0 = row(P.mEmpty), e1 = row(P.mLoaded);
  $('cmp').innerHTML = `<tr><th>${t('cmp.head')}</th><th>${t('cmp.flat')}</th><th>${t('cmp.down', { p: Math.round(ENV.ramp * 100) })}</th></tr><tr><td>${t('cmp.empty')}</td><td class="num">${e0[0]}</td><td class="num">${e0[1]}</td></tr><tr><td>${t('cmp.loaded')}</td><td class="num">${e1[0]}</td><td class="num">${e1[1]}</td></tr>`;
  const ddsAge = (sim.t - T.mc.rxTime) * 1000;
  $('chips').innerHTML = [
    chip(m.lidarOk, 'LiDAR'), chip(m.radarOk, 'Radar'),
    chip(!T.faults.gnss, T.faults.gnss ? t('chip.gnssDr', { s: N(sim.t - T.gnssLostAt) }) : 'GNSS RTK', T.faults.gnss ? 'a' : null),
    chip(true, t('chip.v2x', { n: T.perceived.filter(p => p.by.includes('V')).length })),
    chip(sim.t - T.auth.lastRx < P.fmsLease, t('chip.fms', { s: N(Math.max(0, sim.t - T.auth.lastRx), 1) }), sim.t - T.auth.lastRx < 0.8 ? 'g' : sim.t - T.auth.lastRx < P.fmsLease ? 'a' : 'r'),
    chip(true, `CAN ${fmt(m.busLoad, 0)} %`, m.busLoad > 85 ? 'r' : m.busLoad > 40 ? 'a' : 'g'),
    chip(true, t('chip.brake', { ms: N(m.brakeLat * 1000, 1) }), m.brakeLat > P.canDeadline ? 'r' : 'g'),
    chip(true, T.dds.mode === 'PERIODIC' ? t('chip.ddsAge', { ms: N(ddsAge) }) : t('chip.ddsNoMon', { m: T.dds.mode === 'EVENT_BE' ? 'BEST_EFFORT' : 'RELIABLE' }), T.dds.mode === 'PERIODIC' ? (ddsAge > 40 ? 'a' : 'g') : 'a')
  ].join('');
  if (logDirty) {
    const el = $('log');
    el.innerHTML = sim.log.slice(-120).map(e => `<div class="${e.cls}">${fmt(e.t, 1).padStart(6, ' ')}s ${vid(e.id).padEnd(7, ' ')} ${codeName(e.code)} · ${rp(e.msg)}</div>`).join('');
    el.scrollTop = el.scrollHeight; logDirty = false;
  }
  if (sideTab === 'scope') drawScope(); else renderL12(T);
  const U = sim.lvs.find(l => l.user), active = document.activeElement === cv;
  if (U) $('lvSpeed').textContent = `${fmt(U.v * 3.6, 0)} km/h`;
  const v2 = $('cV2x').checked;
  $('bV2x').textContent = t('lv.v2x', { s: M(v2 ? 'lv.yes' : 'lv.no') }); $('bV2x').classList.toggle('on', v2); $('bV2x').setAttribute('aria-pressed', String(v2));
  const kb = $('lvKbd'); kb.classList.toggle('on', active);
  kb.lastElementChild.textContent = t(active ? 'lv.kbdOn' : 'lv.kbdOff');
  syncControls(true);
}
function syncControls(light) {
  const T = sim.trucks[selected];
  document.querySelectorAll('[data-fault]').forEach(b => b.classList.toggle('on', !!T.faults[b.dataset.fault]));
  $('selKernel').value = ENV.kernel;
  $('bFreeze').textContent = t(T.l1.frozen ? 'btn.l1Restart' : 'btn.l1Freeze'); $('bFreeze').classList.toggle('on', T.l1.frozen);
  $('bDust').classList.toggle('on', ENV.dust); $('bFms').classList.toggle('on', !ENV.fms);
  $('bFms').textContent = t(ENV.fms ? 'btn.netCut' : 'btn.netRestore');
  $('bPause').textContent = t(ENV.paused ? 'btn.resume' : 'btn.pause');
  document.querySelectorAll('[data-scale]').forEach(b => b.classList.toggle('on', +b.dataset.scale === ENV.scale));
  if (light) return;
  $('rLoad').value = T.can.load; $('vLoad').textContent = T.can.load + ' %';
  $('cMisprio').checked = T.can.misprio; $('cBabble').checked = T.can.babbling;
  $('selDds').value = T.dds.mode; $('rLoss').value = Math.round(T.dds.loss * 100); $('vLoss').textContent = Math.round(T.dds.loss * 100) + ' %';
  $('selMass').value = T.massMode;
  $('selDefect').value = ENV.l1Defect; $('cDefRepeat').checked = ENV.l1Repeat;
}
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4500); }
AHT.inscrire('js/m4-hud.js', '4e0b5328');
