/* aht-safety-poc : module 4, FaultInjector et TelemetryHUD : boucle à pas fixe de 50 Hz et démarrage de la page (demarrer).
   @concern module-4
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
/* ---------- Boucle : physique à pas fixe 50 Hz, rendu découplé ---------- */
let last = 0, acc = 0, lastHud = 0;
function frame(now) {
  const dtR = Math.min(0.1, (now - last) / 1000); last = now;
  if (!ENV.paused) { acc += dtR * ENV.scale; let n = 0; while (acc >= DT && n < 50) { step(); acc -= DT; n++; } if (n >= 50) acc = 0; }
  render();
  if (now - lastHud > 120) { hud(); lastHud = now; }
  requestAnimationFrame(frame);
}
function demarrer() {
  demarrerMesure(); brancherRendu(); brancherCommandes();
  applyStatic(); resetSim(); resize();
  track('aht-safety-poc/lang-start/' + LANG, 'aht-safety-poc · langue à l\'ouverture : ' + LANG.toUpperCase());
  last = performance.now();
  requestAnimationFrame(frame);
}
AHT.inscrire('js/m4-start.js', 'bb173a1b');
