// Relations entre les paramètres du profil de noyau et ceux du battement de cœur (spec 002, S15).
// Fonction pure : elle lit des paramètres (le `P` de la page) et rend la liste des relations rompues.

// Pas de la consigne du niveau 1, identique au pas de la physique (50 Hz).
const PERIODE = 0.02;

/**
 * Le profil seul ne doit jamais provoquer de perte de battement ni de rejet : la borne de latence du profil
 * généraliste doit rester sous l'échéance du battement et sous la péremption d'une consigne.
 */
export function verifierRelationsProfil(P) {
  const erreurs = [];
  const err = message => erreurs.push({ fichier: 'index.html', ligne: null, message });
  const delta = P.latCpuGP - P.latCpuRT;
  if (!(delta >= 0)) err(`the general-purpose latency (${P.latCpuGP} s) should not be below the PREEMPT_RT one (${P.latCpuRT} s)`);
  if (!(P.l1Deadline > PERIODE + delta)) {
    err(`heartbeat deadline ${P.l1Deadline} s should exceed the setpoint period ${PERIODE} s plus the profile delay ${delta.toFixed(3)} s`);
  }
  // Une consigne rejouée est la précédente : elle a déjà un pas d'âge à l'émission, et le retard du profil s'y ajoute.
  if (!(P.l1Stale > PERIODE + delta)) {
    err(`setpoint staleness limit ${P.l1Stale} s should exceed the profile delay ${delta.toFixed(3)} s plus the age of a replayed setpoint (${PERIODE} s)`);
  }
  return erreurs;
}
