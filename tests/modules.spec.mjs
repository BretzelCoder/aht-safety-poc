// Un contrôle par module, chargé tout seul (spec 003, S11 et AC-13) : sans navigateur, dans un contexte `node:vm` nu,
// avec les fichiers du module et des modules plus bas qu'il appelle, et des doublures pour ce qu'il appelle vers le haut.
import { test, expect } from '@playwright/test';
import { chargerModule } from './helpers/modules.mjs';
import { verifierPhysique } from './helpers/physique.mjs';

const decrire = erreurs => erreurs.map(e => e.message).join('\n');

test.describe('T-31 the harness and module 1, MineWorld & PhysicsEngine (spec 003, S11, AC-13)', () => {
  const FICHIERS = ['js/base.js', 'js/m1-world-physics.js'];

  test('the harness refuses a file that is not a page file, and files out of the order of the tags', () => {
    expect(() => chargerModule(['js/base.js', 'js/inexistant.js'])).toThrow('not one of the page');
    expect(() => chargerModule(['js/m1-world-physics.js', 'js/base.js'])).toThrow('out of order');
  });

  test('the harness gives the module no document and no window (nothing of the page, no drawing)', () => {
    const m = chargerModule(FICHIERS);
    expect(m.lire('typeof document'), 'no document').toBe('undefined');
    expect(m.lire('typeof window'), 'no window').toBe('undefined');
  });

  test('the braking envelope and the stopping distances are the pinned ones (20.2 m empty, 42.2 m loaded at 40 km/h)', () => {
    const m = chargerModule(FICHIERS);
    // t_lat de PREEMPT_RT : somme des durées du budget de réaction, mesurée sur le modèle complet (spec 002, T-05).
    const tLat = 0.4238445685279188;
    const d = (masse, pente, mu) => m.lire(`stopDistance(40 / 3.6, ${tLat}, Math.max(0.15, brakeEnvelope(${masse}, ${pente}, ${mu}).aEff), P.marginSIL)`);
    const env = (masse, pente, mu) => m.lire(`brakeEnvelope(${masse}, ${pente}, ${mu})`);
    const mesures = {
      tLat, videPlat: d(m.lire('P.mEmpty'), 0, 0.6), chargeDescente: d(m.lire('P.mLoaded'), -0.10, 0.6),
      limite160: env(160, 0, 0.6).limit, limite180: env(180, 0, 0.6).limit, limite400: env(400, 0, 0.6).limit,
      aEff160: env(160, 0, 0.6).aEff, aEff180: env(180, 0, 0.6).aEff,
      videSec: d(m.lire('P.mEmpty'), 0, 0.6), videArrose: d(m.lire('P.mEmpty'), 0, 0.35),
      chargeSec: d(m.lire('P.mLoaded'), 0, 0.6), chargeArrose: d(m.lire('P.mLoaded'), 0, 0.35),
    };
    const erreurs = verifierPhysique(mesures);
    expect(erreurs, decrire(erreurs)).toEqual([]);
    expect(mesures.videPlat).toBeCloseTo(20.2, 0);
    expect(mesures.chargeDescente).toBeCloseTo(42.2, 0);
  });

  test('the stopping distance is v·t_lat + v²/(2·a) + margin, and a is never taken below 0.15 m/s²', () => {
    const m = chargerModule(FICHIERS);
    expect(m.lire('stopDistance(10, 0.5, 4, 5)')).toBeCloseTo(22.5, 9);
    expect(m.lire('stopDistance(10, 0.5, 0, 5)'), 'a null deceleration is floored').toBeCloseTo(10 * 0.5 + 100 / (2 * 0.15) + 5, 9);
  });

  test('the haul road is the pinned loop, with the line speed everywhere on it', () => {
    const m = chargerModule(FICHIERS);
    expect(m.lire('PATH.N')).toBe(1451);
    expect(m.lire('PATH.L')).toBeCloseTo(1451.327, 2);
    expect(m.lire('vLimitAt(0)'), 'line speed 45 km/h on the straight').toBeCloseTo(12.5, 9);
    expect(m.lire('modL(-1) === PATH.L - 1'), 'distances wrap around the loop').toBe(true);
    expect(m.lire('gradeAt(0)')).toBe(0);
  });
});
