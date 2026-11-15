// Aides pour les vérifications des niveaux 1 et 2 (spec 002) : exécutions longues, pas à pas, sans rendu.
import { pauseAndSeed } from './page.mjs';

/**
 * Joue, pour chaque graine, `secondes` secondes de conduite nominale (aucune panne, aucun scénario) et rend
 * la liste des anomalies vues pour l'AC-2 (profil PREEMPT_RT) et l'AC-14 (les deux profils) :
 *  - une consigne rejetée, ou un code SETPOINT_* / L1_* au journal ;
 *  - un battement plus vieux que l'échéance (après le premier dixième de seconde) ;
 *  - un tombereau au-delà de son autorisation de mouvement ;
 *  - hors profil généraliste (retard de livraison), une séquence qui n'avance pas d'exactement un par pas.
 *
 * profil : 'RT' (PREEMPT_RT), 'GP' (généraliste) ou 'bascule' (RT, GP à 20 s, RT à 40 s).
 */
export async function conduiteNominale(page, { graines, secondes = 60, profil = 'RT' }) {
  const anomalies = [];
  for (const graine of graines) {
    await pauseAndSeed(page, graine);
    const r = await page.evaluate(({ secondes, profil }) => {
      const S = window.__sim, P = S.P, trucks = S.sim.trucks, vues = [];
      const noter = (m) => { if (vues.length < 3) vues.push(`t = ${S.sim.t.toFixed(2)} s: ${m}`); };
      const n = Math.round(secondes / 0.02), prec = trucks.map(() => -1);
      let dernierChangement = -1;
      for (let i = 0; i < n; i++) {
        const t = i * 0.02;
        const kernel = profil === 'bascule' ? (t >= 40 ? 'RT' : t >= 20 ? 'GP' : 'RT') : profil;
        if (S.ENV.kernel !== kernel) { S.ENV.kernel = kernel; dernierChangement = t; }
        S.step();
        trucks.forEach((T, k) => {
          if (T.l2.rejRun > 0) noter(`${T.id} setpoint rejected (${T.l2.rej[T.l2.rej.length - 1]?.code})`);
          if (S.sim.t > 0.3 && S.sim.t - T.l2.lastValid > P.l1Deadline) noter(`${T.id} heartbeat ${(S.sim.t - T.l2.lastValid).toFixed(2)} s old`);
          if (T.s - T.auth.sEnd > 0) noter(`${T.id} ${(T.s - T.auth.sEnd).toFixed(1)} m beyond its movement authority`);
          // Profil sans retard, hors des 0,3 s qui suivent une bascule : une consigne acceptée par pas, séquence +1.
          const sansRetard = S.ENV.kernel === 'RT' && (dernierChangement < 0 || S.sim.t - dernierChangement > 0.3);
          if (sansRetard && prec[k] >= 0 && T.l2.seq !== prec[k] + 1) noter(`${T.id} sequence ${T.l2.seq} after ${prec[k]}`);
          prec[k] = sansRetard ? T.l2.seq : -1;
        });
      }
      const codes = S.sim.log.filter(e => /^(SETPOINT_|L1_)/.test(e.code)).map(e => `${e.id}:${e.code}`);
      return { vues, codes: [...new Set(codes)] };
    }, { secondes, profil });
    for (const v of r.vues) anomalies.push(`seed ${graine}, ${profil}: ${v}`);
    for (const c of r.codes) anomalies.push(`seed ${graine}, ${profil}: unexpected log code ${c}`);
  }
  return anomalies;
}

/** Graines de 1 à n, découpées en `parts` paquets égaux : un test par paquet, pour répartir la durée sur les processus. */
export function paquets(n, parts) {
  const par = Math.ceil(n / parts), liste = [];
  for (let p = 0; p < parts; p++) liste.push(Array.from({ length: par }, (_, i) => p * par + i + 1).filter(g => g <= n));
  return liste;
}
