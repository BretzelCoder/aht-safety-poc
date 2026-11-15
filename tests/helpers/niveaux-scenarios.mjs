// Scénarios F et G sur plusieurs graines (spec 002, T-12 : AC-3 et AC-6). Exécutions longues, pas à pas, sans rendu.
import { pauseAndSeed } from './page.mjs';

/**
 * Scénario F sur plusieurs graines (AC-3). Pour chaque graine, un tombereau (graine modulo 3) est figé à un instant
 * qui dépend de la graine (5 à 45 s), donc à des endroits et dans des états différents (rampe, virage, chargement).
 * Anomalies : détection hors de (0,30 s ; 0,34 s], pas de code, pas d'arrêt contrôlé au freinage maximal, pas d'arrêt
 * dans les 15 s, consigne reçue du niveau 1 figé, urgence, collision.
 */
export async function scenarioFSurGraines(page, graines) {
  const anomalies = [];
  for (const graine of graines) {
    await pauseAndSeed(page, graine);
    const r = await page.evaluate(g => {
      const S = window.__sim, k = g % 3, T = S.sim.trucks[k], vues = [];
      const noter = m => vues.push(m);
      const tGel = 5 + (g * 7) % 41;
      for (let i = 0; i < Math.round(tGel / 0.02); i++) S.step();
      const seq0 = T.l2.seq, etatAvant = T.state;
      S.l1Freeze(k);
      const etats = new Set(), kinds = new Set(); let arret = false;
      for (let i = 0; i < 750; i++) {                                // 15 s
        S.step(); etats.add(T.state); kinds.add(T.mc.applied + '/' + T.mc.appliedKind);
        if (T.l1.ev.tDetect !== null && T.v < 0.3) arret = true;
      }
      const delai = T.l1.ev.tDetect === null ? null : T.l1.ev.tDetect - T.l1.ev.tFreeze;
      if (delai === null || !(delai > 0.30 && delai <= 0.34)) noter(`detection delay ${delai}`);
      if (!S.sim.log.some(l => l.id === T.id && l.code === 'L1_HEARTBEAT_LOST' && l.lvl === 2)) noter('no L1_HEARTBEAT_LOST at severity 2');
      if (!etats.has('CONTROLLED_STOP')) noter(`never CONTROLLED_STOP (states ${[...etats]}, before: ${etatAvant})`);
      if (!kinds.has('CONTROLLED_STOP/MAX')) noter(`maximum braking never applied (${[...kinds]})`);
      if (etats.has('EMERGENCY_BRAKE')) noter('emergency brake');
      if (!arret) noter('the truck did not stop within 15 s');
      if (T.l2.seq !== seq0) noter('a setpoint reached level 2 from the frozen level 1');
      if (S.sim.collisions) noter(`${S.sim.collisions} collision(s)`);
      return vues.map(v => `${T.id} frozen at ${tGel} s: ${v}`);
    }, graine);
    for (const v of r) anomalies.push(`seed ${graine}: ${v}`);
  }
  return anomalies;
}

/**
 * Scénario G sur plusieurs graines (AC-6) : les cinq défauts à trois moments (en route, près de la fin de l'autorisation
 * après coupure du réseau, à l'arrêt pendant un chargement), avec ou sans nuage de poussière. Chaque cas est joué deux
 * fois depuis la même préparation : sans défaut (témoin), puis avec. Anomalies : mauvais code de rejet, consigne
 * appliquée (la vitesse dépasse la limite du tronçon de plus que le témoin), dépassement de l'autorisation.
 */
const ATTENDU_DEFAUT = { OVERSPEED: 'SETPOINT_OVERSPEED', BEYOND_MA: 'SETPOINT_BEYOND_MA', STALE: 'SETPOINT_STALE', REPLAY: 'SETPOINT_SEQUENCE', INTEGRITY: 'SETPOINT_INTEGRITY' };
export async function scenarioGSurGraines(page, graines, { poussiere = false, moments = ['cruise', 'authorityEnd', 'stop'] } = {}) {
  const anomalies = [];
  await pauseAndSeed(page, 1);
  for (const graine of graines) {
    const r = await page.evaluate(({ g, poussiere, moments, attendu }) => {
      const S = window.__sim, P = S.P, vues = [];
      const jouer = (moment, defaut) => {
        window.__reseed(g); S.resetSim(); S.setSel(0);
        S.ENV.dust = poussiere;
        const k = g % 3, T = S.sim.trucks[k], pas = n => { for (let i = 0; i < n; i++) S.step(); };
        if (moment === 'cruise') pas(Math.round((8 + (g % 10)) / 0.02));
        else if (moment === 'authorityEnd') {
          pas(300); S.ENV.fms = false;                                  // réseau coupé : l'autorisation n'est plus renouvelée
          let n = 0; while (T.auth.sEnd - T.s > 30 && n++ < 3000) S.step();
        } else {
          T.task = 'LOADING'; T.taskT = 60; let n = 0; while (T.v > 0.3 && n++ < 3000) S.step();
        }
        if (defaut) T.l1.defect = defaut;
        const avant = T.l2.rej.length ? T.l2.rej[T.l2.rej.length - 1] : null;
        let over = -Infinity, pos = -Infinity, code = null, appliquee = 0, plan0 = T.vPlan;
        for (let i = 0; i < 150; i++) {
          S.step();
          // La consigne acceptée est celle du planificateur de ce pas, ou celle du pas précédent si la nouvelle a été rejetée.
          if (Math.abs(T.l2.vAccepted - T.vPlan) > 1e-9 && Math.abs(T.l2.vAccepted - plan0) > 1e-9) appliquee++;
          plan0 = T.vPlan;
          over = Math.max(over, T.v - S.vLimitAt(T.s + P.len / 2));
          pos = Math.max(pos, T.s - T.auth.sEnd);
          const dernier = T.l2.rej[T.l2.rej.length - 1];
          if (code === null && dernier && dernier !== avant) code = dernier.code;
        }
        return { over, pos, code, v: T.v, appliquee };
      };
      for (const moment of moments) {
        const temoin = jouer(moment, null);
        for (const [defaut, code] of Object.entries(attendu)) {
          const x = jouer(moment, defaut);
          if (x.code !== code) vues.push(`${moment}, ${defaut}: verdict ${x.code}, expected ${code}`);
          if (x.appliquee > 0) vues.push(`${moment}, ${defaut}: the accepted setpoint differed from the planner's in ${x.appliquee} step(s): a rejected setpoint was applied`);
          if (x.over > temoin.over + 0.05) vues.push(`${moment}, ${defaut}: speed ${x.over.toFixed(2)} m/s above the section limit, control run ${temoin.over.toFixed(2)}`);
          if (x.pos > 0) vues.push(`${moment}, ${defaut}: ${x.pos.toFixed(1)} m beyond the movement authority`);
        }
        if (temoin.pos > 0) vues.push(`${moment}: control run ${temoin.pos.toFixed(1)} m beyond the movement authority`);
      }
      return vues;
    }, { g: graine, poussiere, moments, attendu: ATTENDU_DEFAUT });
    for (const v of r) anomalies.push(`seed ${graine}${poussiere ? ' (dust)' : ''}: ${v}`);
  }
  return anomalies;
}
