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

test.describe('T-32 module 2, EmbeddedCommsBus (spec 003, S11, AC-13)', () => {
  // Module 2 appelle vers le haut `sim` (l'horloge) et `logEv` (le journal) : deux doublures. Vers le bas : base, traduction, module 1.
  const FICHIERS = ['js/base.js', 'js/i18n-engine.js', 'js/m1-world-physics.js', 'js/m2-comms-bus.js'];
  const charger = () => {
    const appels = [];
    const m = chargerModule(FICHIERS, { doubles: { sim: { t: 1 }, logEv: (...a) => appels.push(a) } });
    return { m, appels };
  };
  const camion = (charge, extra = {}) => ({ id: 'AHT-01', can: { load: charge, babbling: false, misprio: true, ...extra }, m: {}, ecuEmergency: false });

  test('the CAN brake deadline is missed from 67 % load and the brake watchdog trips from 84 %, never below', () => {
    const { m, appels } = charger();
    // Un essai par charge : le contrôleur voit la latence du frein et, si le chien de garde se déclenche, le journal le dit.
    const essai = charge => {
      m.executer(`globalThis.__T = ${JSON.stringify(camion(charge))}; canUpdate(globalThis.__T)`);
      return { frein: m.lire('__T.m.brakeLat'), urgence: m.lire('__T.ecuEmergency') };
    };
    const deadline = m.lire('P.canDeadline'), watchdog = m.lire('P.canWatchdog');
    const e66 = essai(66), e67 = essai(67), e83 = essai(83), e84 = essai(84);
    expect(e66.frein, 'at 66 % load the deadline is still met').toBeLessThanOrEqual(deadline);
    expect(e67.frein, 'from 67 % load the deadline is missed').toBeGreaterThan(deadline);
    expect(e83.frein, 'at 83 % load the watchdog does not trip').toBeLessThanOrEqual(watchdog);
    expect(e84.frein, 'from 84 % load the watchdog trips').toBeGreaterThan(watchdog);
    expect([e66.urgence, e67.urgence, e83.urgence, e84.urgence]).toEqual([false, false, false, true]);
    const codes = appels.map(a => a[2]);
    expect(codes, 'DM1_BRAKE_CMD_TIMEOUT is logged once per tripped watchdog (84 % only, 83 % and below never)').toEqual(['DM1_BRAKE_CMD_TIMEOUT']);
  });

  test('without the misprioritised message load the brake latency stays low even at 100 % load, and a babbling node blocks the bus', () => {
    const { m } = charger();
    const T1 = camion(100, { misprio: false }); m.executer(`globalThis.__T = ${JSON.stringify(T1)}; canUpdate(globalThis.__T)`);
    expect(m.lire('globalThis.__T.m.brakeLat'), 'a safety message on its own priority').toBeLessThan(m.lire('P.canDeadline'));
    const T2 = camion(0, { babbling: true }); m.executer(`globalThis.__T = ${JSON.stringify(T2)}; canUpdate(globalThis.__T)`);
    expect(m.lire('globalThis.__T.m.brakeLat')).toBe(Infinity);
    expect(m.lire('globalThis.__T.ecuEmergency')).toBe(true);
    expect(m.lire('globalThis.__T.m.busLoad')).toBe(100);
  });

  test('k95 and the DDS latency budget of each mode are the closed forms of the model', () => {
    const { m } = charger();
    expect(m.lire('k95(0)')).toBe(0);
    expect(m.lire('k95(0.1)')).toBe(1);
    expect(m.lire('k95(0.5)')).toBe(4);
    const budget = (mode, loss = 0) => m.lire(`ddsBudget({ dds: { mode: '${mode}', loss: ${loss} } })`);
    expect(budget('PERIODIC')).toBeCloseTo(0.02 + 0.003, 9);
    expect(budget('EVENT_BE')).toBeCloseTo(0.003, 9);
    expect(budget('EVENT_REL', 0.5), 'reliable: base plus k95 retransmissions').toBeCloseTo(0.003 + 0.03 * 4, 9);
  });

  test('the link from level 1 to level 2 keeps the order, never delivers a message before an older one, and delays by the kernel profile', () => {
    const { m } = charger();
    m.executer('globalThis.__T = { l2: { link: [], lastAt: 0 } }');
    m.executer("sim.t = 1; l1Send(__T, 'sp', { n: 1 }); l1Send(__T, 'sp', { n: 2 })");
    expect(m.lire('__T.l2.link.map(x => x.at)'), 'PREEMPT_RT: no delay').toEqual([1, 1]);
    m.executer("ENV.kernel = 'GP'; sim.t = 1.02; l1Send(__T, 'sp', { n: 3 })");
    expect(m.lire('__T.l2.link[2].at'), 'general-purpose kernel: delayed by 0.25 - 0.05 s').toBeCloseTo(1.22, 9);
    m.executer("ENV.kernel = 'RT'; sim.t = 1.04; l1Send(__T, 'sp', { n: 4 })");
    expect(m.lire('__T.l2.link[3].at'), 'back to PREEMPT_RT: not before the older delayed message').toBeCloseTo(1.22, 9);
    expect(m.lire('__T.l2.link.map(x => x.p.n)')).toEqual([1, 2, 3, 4]);
    const ats = m.lire('__T.l2.link.map(x => x.at)');
    expect(ats, 'arrival times never decrease').toEqual([...ats].sort((a, b) => a - b));
  });

  test('the checksum is the pinned closed form and changes with the demanded speed', () => {
    const { m } = charger();
    expect(m.lire('sumOf({ session: 0, seq: 1, ts: 1, vDemand: 10, dGoal: 50 })')).toBe((17 + 1000 * 13 + 10000 * 7 + 5000 * 3) % 65521);
    expect(m.lire('sumOf({ session: 0, seq: 1, ts: 1, vDemand: 10.001, dGoal: 50 })')).not.toBe(m.lire('sumOf({ session: 0, seq: 1, ts: 1, vDemand: 10, dGoal: 50 })'));
  });
});
