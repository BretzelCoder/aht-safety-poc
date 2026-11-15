// Scénarios F et G sur plusieurs graines (spec 002, T-12 : AC-3 et AC-6). Exécutions longues, pas à pas, sans rendu.
import { pauseAndSeed } from './page.mjs';

/**
 * Scénario F sur plusieurs graines (AC-3). Pour chaque graine, un tombereau (graine modulo 3) est figé à un instant
 * qui dépend de la graine (5 à 45 s), donc à des endroits et dans des états différents (rampe, virage, chargement).
 * Anomalies : détection hors de (échéance ; échéance + un pas] (0,32 s au plus avec PREEMPT_RT), pas de code, pas d'arrêt contrôlé au freinage maximal, pas d'arrêt
 * dans les 15 s, consigne reçue du niveau 1 figé, urgence, collision.
 */
export async function scenarioFSurGraines(page, graines, { profil = 'RT' } = {}) {
  const anomalies = [];
  for (const graine of graines) {
    await pauseAndSeed(page, graine);
    const r = await page.evaluate(({ g, profil }) => {
      const S = window.__sim, k = g % 3, T = S.sim.trucks[k], vues = [];
      S.ENV.kernel = profil;
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
      // Échéance plus un pas ; avec le noyau généraliste, plus le retard du profil (les consignes en vol arrivent encore).
      const delai = T.l1.ev.tDetect === null ? null : T.l1.ev.tDetect - T.l1.ev.tFreeze, retard = profil === 'GP' ? S.P.latCpuGP - S.P.latCpuRT : 0;
      if (delai === null || !(delai > S.P.l1Deadline + retard && delai <= S.P.l1Deadline + retard + 0.02 + 1e-6)) noter(`detection delay ${delai} (profile ${profil}, expected ${(S.P.l1Deadline + retard).toFixed(2)} s plus at most one step)`);
      if (!S.sim.log.some(l => l.id === T.id && l.code === 'L1_HEARTBEAT_LOST' && l.lvl === 2)) noter('no L1_HEARTBEAT_LOST at severity 2');
      if (!etats.has('CONTROLLED_STOP')) noter(`never CONTROLLED_STOP (states ${[...etats]}, before: ${etatAvant})`);
      if (!kinds.has('CONTROLLED_STOP/MAX')) noter(`maximum braking never applied (${[...kinds]})`);
      if (etats.has('EMERGENCY_BRAKE')) noter('emergency brake');
      if (!arret) noter('the truck did not stop within 15 s');
      // Les consignes déjà en vol arrivent encore (profil généraliste : retard / 0,02 s, plus une) ; plus rien de nouveau ensuite.
      const enVol = profil === 'GP' ? Math.round((S.P.latCpuGP - S.P.latCpuRT) / 0.02) + 1 : 0;
      if (T.l2.seq - seq0 > enVol) noter(`${T.l2.seq - seq0} setpoints reached level 2 after the freeze, at most ${enVol} were in flight`);
      if (S.sim.collisions) noter(`${S.sim.collisions} collision(s)`);
      return vues.map(v => `${T.id} frozen at ${tGel} s: ${v}`);
    }, { g: graine, profil });
    for (const v of r) anomalies.push(`seed ${graine} (${profil}): ${v}`);
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
export async function scenarioGSurGraines(page, graines, { poussiere = false, profil = 'RT', moments = ['cruise', 'authorityEnd', 'stop', 'stopStart'] } = {}) {
  const anomalies = [];
  await pauseAndSeed(page, 1);
  for (const graine of graines) {
    const r = await page.evaluate(({ g, poussiere, moments, attendu, profil }) => {
      const S = window.__sim, P = S.P, vues = [];
      const jouer = (moment, defaut) => {
        window.__reseed(g); S.resetSim(); S.setSel(0);
        S.ENV.dust = poussiere; S.ENV.kernel = profil;
        const k = g % 3, T = S.sim.trucks[k], pas = n => { for (let i = 0; i < n; i++) S.step(); };
        // Historique des demandes du planificateur : la consigne acceptée doit en être une des derniers pas (le retard du profil généraliste la décale).
        const hist = [], pasOrig = S.step; S.step = () => { pasOrig(); hist.push(T.vPlan); };
        const fenetre = Math.round((P.latCpuGP - P.latCpuRT) / 0.02 * (profil === 'GP' ? 1 : 0)) + 2;
        if (moment === 'cruise') pas(Math.round((8 + (g % 10)) / 0.02));
        else if (moment === 'authorityEnd') {
          pas(300); S.ENV.fms = false;                                  // réseau coupé : l'autorisation n'est plus renouvelée
          let n = 0; while (T.auth.sEnd - T.s > 30 && n++ < 3000) S.step();
        } else if (moment === 'stopStart') {
          pas(300); S.ENV.fms = false;                                  // réseau coupé : à l'échéance du bail, l'arrêt commence
          let n = 0; while (T.state !== 'CONTROLLED_STOP' && n++ < 3000) S.step();
        } else {
          T.task = 'LOADING'; T.taskT = 60; let n = 0; while (T.v > 0.3 && n++ < 3000) S.step();
        }
        if (defaut) T.l1.defect = defaut;
        const avant = T.l2.rej.length ? T.l2.rej[T.l2.rej.length - 1] : null, tInj = S.sim.t;
        let over = -Infinity, pos = -Infinity, code = null, appliquee = 0;
        for (let i = 0; i < 150; i++) {
          S.step();
          // La consigne acceptée est celle du planificateur de ce pas, ou celle du pas précédent si la nouvelle a été rejetée.
          if (!hist.slice(-fenetre).some(v => Math.abs(v - T.l2.vAccepted) < 1e-9)) appliquee++;
          over = Math.max(over, T.v - S.vLimitAt(T.s + P.len / 2));
          pos = Math.max(pos, T.s - T.auth.sEnd);
          const dernier = T.l2.rej[T.l2.rej.length - 1];
          if (code === null && dernier && dernier !== avant) code = dernier.code;
        }
        // Le journal d'événements nomme lui aussi le défaut (AC-6), à chacun des moments.
        const journal = code !== null && S.sim.log.some(l => l.id === T.id && l.code === code && l.t >= tInj);
        S.step = pasOrig;
        return { over, pos, code, v: T.v, appliquee, journal };
      };
      for (const moment of moments) {
        const temoin = jouer(moment, null);
        for (const [defaut, code] of Object.entries(attendu)) {
          const x = jouer(moment, defaut);
          if (x.code !== code) vues.push(`${moment}, ${defaut}: verdict ${x.code}, expected ${code}`);
          else if (!x.journal) vues.push(`${moment}, ${defaut}: the event log does not name ${code}`);
          if (x.appliquee > 0) vues.push(`${moment}, ${defaut}: the accepted setpoint differed from the planner's in ${x.appliquee} step(s): a rejected setpoint was applied`);
          if (x.over > temoin.over + 0.05) vues.push(`${moment}, ${defaut}: speed ${x.over.toFixed(2)} m/s above the section limit, control run ${temoin.over.toFixed(2)}`);
          if (x.pos > 0) vues.push(`${moment}, ${defaut}: ${x.pos.toFixed(1)} m beyond the movement authority`);
        }
        if (temoin.pos > 0) vues.push(`${moment}: control run ${temoin.pos.toFixed(1)} m beyond the movement authority`);
      }
      return vues;
    }, { g: graine, poussiere, moments, attendu: ATTENDU_DEFAUT, profil });
    for (const v of r) anomalies.push(`seed ${graine}${poussiere ? ' (dust)' : ''} (${profil}): ${v}`);
  }
  return anomalies;
}
