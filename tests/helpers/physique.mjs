// Invariants physiques du modèle (spec 001, S7 : trois premiers points).
// `mesurerPhysique` interroge la page ; `verifierPhysique` est une fonction pure sur les mesures.

/**
 * Mesure, dans la page, les distances d'arrêt à 40 km/h avec les fonctions du modèle,
 * exactement comme le tableau du panneau « Bulle d'arrêt » (latence du tombereau sélectionné).
 */
export async function mesurerPhysique(page) {
  return page.evaluate(() => {
    const { brakeEnvelope, stopDistance, P, sim } = window.__sim;
    const tLat = sim.trucks[0].m.tLat;
    const v = 40 / 3.6;
    const d = (masse, pente, mu) => stopDistance(v, tLat, Math.max(0.15, brakeEnvelope(masse, pente, mu).aEff), P.marginSIL);
    const env = (masse, pente, mu) => brakeEnvelope(masse, pente, mu);
    return {
      tLat,
      videPlat: d(P.mEmpty, 0, 0.6),
      chargeDescente: d(P.mLoaded, -0.10, 0.6),
      limite160: env(160, 0, 0.6).limit, limite180: env(180, 0, 0.6).limit, limite400: env(400, 0, 0.6).limit,
      aEff160: env(160, 0, 0.6).aEff, aEff180: env(180, 0, 0.6).aEff,
      videSec: d(P.mEmpty, 0, 0.6), videArrose: d(P.mEmpty, 0, 0.35),
      chargeSec: d(P.mLoaded, 0, 0.6), chargeArrose: d(P.mLoaded, 0, 0.35),
    };
  });
}

// Valeurs mesurées le 2026-11-15 (plan 001, section 2) : un changement voulu du modèle
// doit mettre ces valeurs à jour dans la même spec.
export const ATTENDU = { videPlat: 20.2, chargeDescente: 42.2, tolerance: 0.5, arrosageVide: 0.30, arrosageCharge: 0.01 };

/** Rend la liste des invariants rompus ; vide quand le modèle les respecte. */
export function verifierPhysique(m) {
  const erreurs = [];
  const err = message => erreurs.push({ fichier: 'index.html', ligne: null, message });
  const f = x => x.toFixed(1);

  if (!(m.chargeDescente > m.videPlat)) {
    err(`loaded downhill stopping distance (${f(m.chargeDescente)} m) should exceed empty on the flat (${f(m.videPlat)} m)`);
  }
  if (Math.abs(m.videPlat - ATTENDU.videPlat) > ATTENDU.tolerance) {
    err(`empty flat stopping distance is ${f(m.videPlat)} m, pinned at ${ATTENDU.videPlat} m ± ${ATTENDU.tolerance}`);
  }
  if (Math.abs(m.chargeDescente - ATTENDU.chargeDescente) > ATTENDU.tolerance) {
    err(`loaded downhill stopping distance is ${f(m.chargeDescente)} m, pinned at ${ATTENDU.chargeDescente} m ± ${ATTENDU.tolerance}`);
  }

  if (m.limite160 !== 'lim.adh') err(`empty (160 t) should be limited by adhesion, found ${m.limite160}`);
  if (m.limite180 !== 'lim.adh') err(`180 t should still be limited by adhesion, found ${m.limite180}`);
  if (Math.abs(m.aEff160 - m.aEff180) > 1e-9) err(`adhesion-limited deceleration should not depend on mass: ${m.aEff160} at 160 t, ${m.aEff180} at 180 t`);
  if (m.limite400 !== 'lim.cap') err(`loaded (400 t) should be limited by brake capacity, found ${m.limite400}`);

  const hausseVide = m.videArrose / m.videSec - 1;
  const hausseCharge = m.chargeArrose / m.chargeSec - 1;
  if (!(hausseVide > ATTENDU.arrosageVide)) err(`watered road should lengthen the empty stopping distance by more than 30 %, found ${(hausseVide * 100).toFixed(0)} %`);
  if (!(Math.abs(hausseCharge) < ATTENDU.arrosageCharge)) err(`watered road should barely change the loaded stopping distance (under 1 %), found ${(hausseCharge * 100).toFixed(1)} %`);
  return erreurs;
}
