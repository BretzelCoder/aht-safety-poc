/* aht-safety-poc : module 4, FaultInjector et TelemetryHUD : dessin de la carte et de l'oscilloscope.
   @concern module-4
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* ---------- Rendu carte ---------- */
const cv = $('map'), ctx = cv.getContext('2d');
let K = 1, pxm = 1;
const FIT = window.matchMedia('(min-width:1280px) and (min-height:700px)');
let lastSizeKey = '';
function resize() {
  const box = $('mapbox'), dpr = window.devicePixelRatio || 1, sc0 = $('scope');
  // Ne rien refaire si les dimensions utiles n'ont pas changé (évite les boucles de redimensionnement)
  const key = [box.clientWidth, FIT.matches ? box.clientHeight : 0, sc0.clientWidth, sc0.clientHeight, dpr, FIT.matches].join('x');
  if (key === lastSizeKey) return;
  lastSizeKey = key;
  let w = box.clientWidth;
  if (FIT.matches) w = Math.min(w, box.clientHeight * W / H);   // cockpit : la carte remplit l'espace libre
  w = Math.max(240, Math.floor(w));
  cv.style.width = w + 'px'; cv.style.height = (w * H / W) + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * H / W * dpr);
  K = cv.width / W; pxm = W / w;
  const sc = $('scope'); sc.width = sc.clientWidth * dpr; sc.height = sc.clientHeight * dpr;
}
// Redimensionnement différé à la frame suivante : on ne modifie jamais une taille observée
// pendant le callback du ResizeObserver (sinon « ResizeObserver loop completed… »).
let resizeQueued = false;
function scheduleResize() { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; resize(); }); }
function brancherRendu() {
  window.addEventListener('resize', scheduleResize);
  if (window.ResizeObserver) { const ro = new ResizeObserver(scheduleResize); ro.observe($('mapbox')); ro.observe($('scope')); }
}
function band(s0, s1, hw, fill) {
  if (s1 <= s0 + 0.5) return;
  const L = [], R = [];
  for (let s = s0; ; s += 2) {
    const ss = Math.min(s, s1), p = PATH.at(ss), nx = -Math.sin(p.h), ny = Math.cos(p.h);
    L.push([p.x + nx * hw, p.y + ny * hw]); R.push([p.x - nx * hw, p.y - ny * hw]);
    if (ss >= s1) break;
  }
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (const q of L) ctx.lineTo(q[0], q[1]);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function pathLine(s0, s1, off) {
  ctx.beginPath();
  for (let s = s0, first = true; ; s += 2, first = false) {
    const ss = Math.min(s, s1), p = PATH.at(ss), x = p.x - Math.sin(p.h) * off, y = p.y + Math.cos(p.h) * off;
    first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    if (ss >= s1) break;
  }
}
function text(t, x, y, size, color, align = 'center', weight = 600) {
  ctx.font = `${weight} ${size * pxm}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y);
}
const STATE_COL = ['#43b97a', '#e3a23a', '#e5574b', '#ff3b6b'];
let terrain = null;
function drawTerrain() {
  // Couche statique mise en cache : terrain, pistes, ouvrages.
  if (terrain && terrain.w === cv.width && terrain.h === cv.height) { ctx.drawImage(terrain.c, 0, 0); return; }
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d'), save = ctx; g.setTransform(K, 0, 0, K, 0, 0);
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#3a332a'); grd.addColorStop(1, '#2a2520');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffffff0d'; g.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const y = 100 + i * 24; g.beginPath(); g.moveTo(90, y); for (let x = 90; x <= 550; x += 20) g.lineTo(x, y + Math.sin(x / 37 + i) * 4); g.stroke(); }
  // piste de service
  g.strokeStyle = '#5a5045'; g.lineWidth = 10; g.beginPath(); g.moveTo(330, -5); g.lineTo(330, H + 5); g.stroke();
  // boucle de roulage (30 m) + merlons
  const P2 = PATH.pts;
  g.lineJoin = 'round';
  const loop = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); P2.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke(); };
  loop(34, '#4a3f33'); loop(30, '#6e604f');
  // rampe ombrée
  for (const [x, dir, lbl] of [[570, 1, 'descente'], [70, -1, 'montée']]) {
    for (let y = 125; y <= 275; y += 30) { g.fillStyle = '#00000022'; g.beginPath(); g.moveTo(x - 9, y - 6 * dir); g.lineTo(x, y + 6 * dir); g.lineTo(x + 9, y - 6 * dir); g.lineTo(x, y); g.closePath(); g.fill(); }
  }
  g.strokeStyle = '#ffffff22'; g.setLineDash([6, 8]); g.lineWidth = 0.8; g.beginPath(); g.moveTo(330, -5); g.lineTo(330, H + 5); g.stroke(); g.setLineDash([]);
  // pelle
  g.fillStyle = '#c8952f'; g.fillRect(140, 20, 20, 16); g.strokeStyle = '#c8952f'; g.lineWidth = 3; g.beginPath(); g.moveTo(150, 34); g.lineTo(152, 48); g.stroke();
  g.fillStyle = '#8a6a2a'; g.fillRect(146, 47, 10, 5);
  // concasseur
  g.fillStyle = '#56606b'; g.fillRect(212, 350, 36, 22); g.fillStyle = '#3c444d'; g.fillRect(220, 355, 20, 12);
  terrain = { c, w: cv.width, h: cv.height };
  ctx.drawImage(c, 0, 0);
}
function drawTruck(T) {
  const p = T.pose, sel = sim.trucks[selected] === T;
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.h);
  const lv = LEVEL[T.state];
  ctx.lineWidth = sel ? 2.2 : 1.4; ctx.strokeStyle = STATE_COL[lv];
  ctx.strokeRect(-P.len / 2 - 1.5, -P.wid / 2 - 1.5, P.len + 3, P.wid + 3);
  ctx.fillStyle = '#111'; for (const x of [-5, 4.5]) for (const y of [-4.6, 3.4]) ctx.fillRect(x, y, 3, 1.2);
  ctx.fillStyle = T.color; ctx.fillRect(-P.len / 2, -P.wid / 2, P.len, P.wid);
  ctx.fillStyle = '#00000040'; ctx.fillRect(-P.len / 2 + 0.8, -P.wid / 2 + 0.8, 9.5, P.wid - 1.6);
  if (T.mass > P.mEmpty + 1) { const f = (T.mass - P.mEmpty) / (P.mLoaded - P.mEmpty); ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(-2.5, 0, 4.2 * f + 0.5, 3.4 * f + 0.4, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#20252b'; ctx.fillRect(4.5, -P.wid / 2 + 0.6, 2.6, 3);
  ctx.restore();
  if (sel) { ctx.strokeStyle = '#ffffffaa'; ctx.setLineDash([3, 3]); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  text(`${T.id} · ${fmt(T.v * 3.6, 0)} km/h`, p.x, p.y - 17, 11, '#f2efe8');
  if (lv > 0 || T.mismatchLogged) text(T.mismatchLogged ? t('map.notApplied') : T.state.replace('_', ' '), p.x, p.y + 17, 10, T.mismatchLogged ? '#ff3b6b' : STATE_COL[lv]);
}
function drawLV(L) {
  ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.h); ctx.scale(1.5, 1.5);
  ctx.fillStyle = L.color; ctx.fillRect(-2.75, -1.1, 5.5, 2.2); ctx.fillStyle = '#333'; ctx.fillRect(0.6, -0.9, 1.4, 1.8);
  ctx.restore();
  if (L.v2x) { const r = 6 + (sim.t * 6 % 6); ctx.strokeStyle = `rgba(184,140,245,${1 - (r - 6) / 6})`; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(L.x, L.y, r, 0, 7); ctx.stroke(); }
  if (L.user && document.activeElement === cv) { ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(L.x, L.y, 9, 0, 7); ctx.stroke(); }
  text(`${L.user ? t('map.you') : vid(L.id)} · ${L.v2x ? 'V2X' : t('map.noBeacon')}`, L.x, L.y - 9, 10, L.user ? '#ffffff' : '#f6b27e');
}
function cone(T, range, half, col) {
  const p = T.pose, fx = p.x + Math.cos(p.h) * P.len / 2, fy = p.y + Math.sin(p.h) * P.len / 2;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.arc(fx, fy, range, p.h - half, p.h + half); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawTerrain();
  ctx.setTransform(K, 0, 0, K, 0, 0);
  text(t('map.shovel'), 150, 12, 11, '#e9d3a0');
  text(t('map.crusher'), 230, 384, 11, '#c9d1da');
  text(t('map.rampDown', { p: Math.round(ENV.ramp * 100) }), 548, 200, 10.5, '#d8c7a8', 'right');
  text(t('map.rampUp', { p: Math.round(ENV.ramp * 100) }), 92, 200, 10.5, '#d8c7a8', 'left');
  text(t('map.service'), 338, 160, 10, '#a99c88', 'left', 500);
  text(t('map.upper'), 470, 112, 10, '#ffffff55'); text(t('map.lower'), 470, 300, 10, '#ffffff55');
  // intersections
  for (const I of INTER) {
    const hcol = I.holder ? (I.holder.kind === 'AHT' ? I.holder.color : '#b88cf5') : null;
    if (hcol) { ctx.fillStyle = hcol + '40'; ctx.fillRect(I.x - 16, I.y - 16, 32, 32); }
    ctx.strokeStyle = hcol || '#ffffff55'; ctx.lineWidth = 1; ctx.setLineDash(hcol ? [] : [3, 3]); ctx.strokeRect(I.x - 16, I.y - 16, 32, 32); ctx.setLineDash([]);
    text(`${I.id} · ${I.holder ? vid(I.holder.id) : t('map.free')}`, I.x + 19, I.y + (I.y < 200 ? 24 : -24), 10, hcol || '#cfc7b8', 'left');
  }
  if (ENV.dust) {
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + sim.t * 0.05, r = DUST.r * (0.35 + (i % 3) * 0.2); const x = DUST.x + Math.cos(a) * r * 0.6, y = DUST.y + Math.sin(a * 1.3) * r * 0.4; const gr = ctx.createRadialGradient(x, y, 0, x, y, 40); gr.addColorStop(0, 'rgba(190,160,120,.35)'); gr.addColorStop(1, 'rgba(190,160,120,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 40, 0, 7); ctx.fill(); }
    text(t('map.dust'), DUST.x, DUST.y - 48, 10.5, '#e8d6b8');
  }
  for (const T of sim.trucks) {
    const f = T.s + P.len / 2;
    if (layers.sensors) {
      if (T.m.lidarOk) cone(T, P.lidarRange, P.lidarHalf, 'rgba(95,211,141,.07)');
      if (T.m.radarOk) cone(T, P.radarRange, P.radarHalf, 'rgba(109,151,240,.10)');
    }
    if (layers.bubbles) { band(f, f + T.m.dCaution, 7, 'rgba(227,162,58,.28)'); band(f, f + T.m.dStop, 7, 'rgba(229,87,75,.55)'); }
    if (layers.auth) {
      const e = T.auth.sEnd + P.len / 2, stale = sim.t - T.auth.lastRx > P.fmsLease;
      ctx.strokeStyle = stale ? '#e5574b' : '#3cc3d6'; ctx.lineWidth = 1; ctx.setLineDash(stale ? [4, 3] : []);
      pathLine(f, Math.max(f, e), 11); ctx.stroke(); ctx.setLineDash([]);
      const p = PATH.at(e); ctx.beginPath(); ctx.moveTo(p.x - Math.sin(p.h) * 6, p.y + Math.cos(p.h) * 6); ctx.lineTo(p.x - Math.sin(p.h) * 14, p.y + Math.cos(p.h) * 14); ctx.lineWidth = 2; ctx.stroke();
    }
  }
  const S = sim.trucks[selected];
  if (layers.links) for (const { o, by } of S.perceived) {
    if (o.kind === 'AHT' && !by.includes('L') && !by.includes('R')) continue;
    const col = by.includes('L') ? '#5fd38d' : by.includes('R') ? '#6d97f0' : '#b88cf5';
    ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(S.pose.x, S.pose.y); ctx.lineTo(o.pose.x, o.pose.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeRect(o.pose.x - 5, o.pose.y - 5, 10, 10);
  }
  for (const L of sim.lvs) drawLV(L);
  for (const T of sim.trucks) drawTruck(T);
  sim.flashes = sim.flashes.filter(f => sim.t - f.t < 3);
  for (const f of sim.flashes) { const k = (sim.t - f.t) / 3; ctx.strokeStyle = `rgba(255,59,107,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + k * 30, 0, 7); ctx.stroke(); text(t('map.collision'), f.x, f.y - 12 - k * 20, 12, `rgba(255,59,107,${1 - k})`, 'center', 700); }
  if (ENV.paused) text(t('map.paused'), W / 2, 24, 16, '#d9a441', 'center', 700);
  if (!ENV.fms) text(t('map.netCut'), W / 2, 44, 12, '#e5574b', 'center', 700);
}

/* ---------- Oscilloscope ---------- */
function drawScope() {
  const c = $('scope'), g = c.getContext('2d'), w = c.width, h = c.height, dpr = window.devicePixelRatio || 1;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.scale(dpr, dpr);
  const W2 = w / dpr, H2 = h / dpr, T = sim.trucks[selected], hs = T.hist, t1 = sim.t, t0 = t1 - 15;
  const padL = 34, top1 = 4, h1 = H2 * 0.38, top2 = h1 + 22, h2 = H2 - top2 - 14;
  const X = t => padL + (t - t0) / 15 * (W2 - padL - 4);
  g.font = '10px "IBM Plex Mono", monospace'; g.fillStyle = '#9a9ea6'; g.textBaseline = 'middle';
  // panneau charge bus
  g.strokeStyle = '#2b2f35'; g.strokeRect(padL, top1, W2 - padL - 4, h1);
  const Y1 = v => top1 + h1 - v / 100 * h1;
  for (const [v, col] of [[40, '#e3a23a'], [85, '#e5574b']]) { g.strokeStyle = col; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(padL, Y1(v)); g.lineTo(W2 - 4, Y1(v)); g.stroke(); g.setLineDash([]); g.fillText(v + '%', 4, Y1(v)); }
  g.fillText('0%', 4, Y1(0) - 4);
  g.beginPath(); hs.forEach((p, i) => { const x = X(p.t), y = Y1(clamp(p.load, 0, 100)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.strokeStyle = '#d9a441'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#d9a441'; g.fillText(t('scope.load'), padL + 4, top1 + 8);
  // panneau latences (0–150 ms)
  g.strokeStyle = '#2b2f35'; g.lineWidth = 1; g.strokeRect(padL, top2, W2 - padL - 4, h2);
  const Y2 = v => top2 + h2 - clamp(v, 0, 150) / 150 * h2;
  g.fillStyle = '#9a9ea6'; g.fillText('150', 6, Y2(150) + 4); g.fillText('0 ms', 2, Y2(0) - 4);
  g.strokeStyle = '#e5574b'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(padL, Y2(40)); g.lineTo(W2 - 4, Y2(40)); g.stroke(); g.setLineDash([]); g.fillStyle = '#e5574b'; g.fillText('40', 12, Y2(40));
  const series = [['diag', '#8a8f98', t('scope.diag')], ['dds', '#b88cf5', t('scope.dds')], ['brake', '#5fd38d', t('scope.brake')]];
  let lx = padL + 4;
  series.forEach(([k, col, lbl]) => {
    g.beginPath(); hs.forEach((p, i) => { const x = X(p.t), y = Y2(isFinite(p[k]) ? p[k] : 999); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = col; g.lineWidth = k === 'brake' ? 2 : 1.2; g.stroke();
    g.fillStyle = col; g.fillText(lbl, lx, top2 + 8); lx += g.measureText(lbl).width + 14;
  });
  g.fillStyle = '#9a9ea6'; g.fillText(t('scope.foot', { id: T.id }), padL, H2 - 5);
}
AHT.inscrire('js/m4-render.js', '83e0b23d');
