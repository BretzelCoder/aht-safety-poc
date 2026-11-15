// Spec 002, volet 1 : niveau 1 (autonomie) et niveau 2 (sûreté). T-04 : le flux de consignes.
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { conduiteNominale, paquets } from './helpers/niveaux.mjs';
import { scenarioFSurGraines, scenarioGSurGraines } from './helpers/niveaux-scenarios.mjs';

test.describe('T-04 level 1 → level 2 setpoint stream (S1, S2)', () => {
  test('each truck sends one complete setpoint per step, the sequence rises by one, the controller follows the accepted setpoint', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, dernier = S.sim.trucks.map(() => -1), erreurs = [];
      for (let i = 0; i < 500; i++) {                       // 10 s à 50 Hz
        S.step();
        S.sim.trucks.forEach((T, k) => {
          const e = T.l2.ex[T.l2.ex.length - 1];
          if (!e) { erreurs.push(`step ${i + 1}, ${T.id}: no exchange recorded`); return; }
          if (e.seq !== dernier[k] + 1) erreurs.push(`step ${i + 1}, ${T.id}: sequence ${e.seq} after ${dernier[k]}`);
          dernier[k] = e.seq;
          for (const champ of ['session', 'seq', 'ts', 'v', 'd']) if (typeof e[champ] !== 'number') erreurs.push(`step ${i + 1}, ${T.id}: field ${champ} missing`);
          if (!e.ok || !e.sumOk) erreurs.push(`step ${i + 1}, ${T.id}: a nominal setpoint was not accepted`);
          if (T.l2.vAccepted !== T.vPlan) erreurs.push(`step ${i + 1}, ${T.id}: accepted ${T.l2.vAccepted} but the planner asked ${T.vPlan}`);
          if (T.l2.ex.length > 5) erreurs.push(`${T.id}: more than 5 exchanges kept`);
        });
      }
      return { erreurs: erreurs.slice(0, 5), fin: dernier };
    });
    expect(r.erreurs, r.erreurs.join('\n')).toEqual([]);
    expect(r.fin, 'one setpoint per step for 500 steps').toEqual([499, 499, 499]);
  });

  test('a frozen level 1 sends nothing and the controller keeps the last accepted setpoint', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0];
      for (let i = 0; i < 100; i++) S.step();
      const avant = { seq: T.l2.seq, v: T.l2.vAccepted };
      T.l1.frozen = true;
      for (let i = 0; i < 25; i++) S.step();
      return { avant, apres: { seq: T.l2.seq, v: T.l2.vAccepted }, planner: T.vPlan };
    });
    expect(r.apres.seq, 'no new setpoint reaches level 2').toBe(r.avant.seq);
    expect(r.apres.v, 'the controller keeps the last accepted speed demand').toBe(r.avant.v);
  });
});

// T-06 : contrôles de protocole du niveau 2 (S5, S11).
test.describe('T-06 level 2 protocol checks (S5)', () => {
  // Joue 2 s, arme un défaut sur le tombereau 0, joue un pas, et rend ce que le niveau 2 en a fait.
  async function defaut(page, nom) {
    await openPage(page);
    await pauseAndSeed(page, 1);
    return page.evaluate(nomDefaut => {
      const S = window.__sim, T = S.sim.trucks[0];
      for (let i = 0; i < 100; i++) S.step();
      const avant = { v: T.l2.vAccepted, seq: T.l2.seq, vPlan: T.vPlan };
      T.l1.defect = nomDefaut;
      S.step();
      const e = T.l2.ex[T.l2.ex.length - 1];
      const apres = { v: T.l2.vAccepted, seq: T.l2.seq };
      const code = S.sim.log.find(l => l.id === T.id && l.code.startsWith('SETPOINT_'));
      S.step();
      return { avant, apres, e: { ok: e.ok, code: e.code }, rej: T.l2.rej.map(r => r.code), journal: code ? { code: code.code, lvl: code.lvl } : null, defautApres: T.l1.defect, rejRun: T.l2.rejRun, suivante: T.l2.ex[T.l2.ex.length - 1].ok };
    }, nom);
  }

  for (const [nom, code] of [['INTEGRITY', 'SETPOINT_INTEGRITY'], ['STALE', 'SETPOINT_STALE'], ['REPLAY', 'SETPOINT_SEQUENCE']]) {
    test(`${nom}: the setpoint is rejected with ${code}, the accepted setpoint is unchanged, the next one is accepted`, async ({ page }) => {
      const r = await defaut(page, nom);
      expect(r.e.ok, 'the defective setpoint must not be accepted').toBe(false);
      expect(r.e.code).toBe(code);
      expect(r.apres.v, 'the accepted speed demand is unchanged by a rejected setpoint').toBe(r.avant.v);
      expect(r.apres.seq, 'the accepted sequence is unchanged').toBe(r.avant.seq);
      expect(r.rej).toContain(code);
      expect(r.journal, 'the rejection is written to the event log at severity 1').toEqual({ code, lvl: 1 });
      expect(r.defautApres, 'a defect lasts one setpoint unless repeated').toBeNull();
      expect(r.suivante, 'the next, normal setpoint is accepted').toBe(true);
      expect(r.rejRun, 'the run of rejections ends with the next accepted setpoint').toBe(0);
    });
  }

  test('a new session is accepted after a lower sequence; an old session or an old sequence is rejected', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0], A = T.l1;
      for (let i = 0; i < 100; i++) S.step();
      A.session = 1; A.seq = 0;                       // redémarrage du niveau 1 : nouvelle session, compteur à zéro
      S.step();
      const redemarre = { ok: T.l2.ex[T.l2.ex.length - 1].ok, session: T.l2.session, seq: T.l2.seq };
      S.l1Inject(0, { session: 0, seq: 5000 });       // une consigne de l'ancienne session, séquence très haute
      S.step();
      const ancienne = T.l2.rej[T.l2.rej.length - 1].code;
      S.l1Inject(0, { seq: T.l2.seq });               // même session, séquence déjà vue
      S.step();
      const vue = T.l2.rej[T.l2.rej.length - 1].code;
      return { redemarre, ancienne, vue };
    });
    expect(r.redemarre.ok, 'the restarted level 1 is not rejected as a replay').toBe(true);
    expect(r.redemarre.session).toBe(1);
    expect(r.ancienne, 'a setpoint of the old session is a replay').toBe('SETPOINT_SEQUENCE');
    expect(r.vue, 'a sequence already seen is a replay').toBe('SETPOINT_SEQUENCE');
  });
});

// T-07 : contrôles de contenu du niveau 2, avec ses propres mesures (S5, S6 ; AC-7).
test.describe('T-07 level 2 content checks and own measurements (S5, S6)', () => {
  for (const [nom, code] of [['OVERSPEED', 'SETPOINT_OVERSPEED'], ['BEYOND_MA', 'SETPOINT_BEYOND_MA']]) {
    test(`${nom}: rejected with ${code}, the accepted demand is unchanged, the heartbeat stays alive`, async ({ page }) => {
      await openPage(page);
      await pauseAndSeed(page, 1);
      const r = await page.evaluate(nomDefaut => {
        const S = window.__sim, T = S.sim.trucks[0];
        for (let i = 0; i < 100; i++) S.step();
        const avant = { v: T.l2.vAccepted, valid: T.l2.lastValid };
        T.l1.defect = nomDefaut;
        S.step();
        const e = T.l2.ex[T.l2.ex.length - 1];
        return { avant, v: T.l2.vAccepted, e: { ok: e.ok, code: e.code }, lastValid: T.l2.lastValid, t: S.sim.t,
                 journal: S.sim.log.some(l => l.id === T.id && l.code === code0(nomDefaut) && l.lvl === 1) };
        function code0(n) { return n === 'OVERSPEED' ? 'SETPOINT_OVERSPEED' : 'SETPOINT_BEYOND_MA'; }
      }, nom);
      expect(r.e.ok).toBe(false);
      expect(r.e.code).toBe(code);
      expect(r.v, 'a rejected setpoint never reaches the actuators').toBe(r.avant.v);
      expect(r.lastValid, 'level 1 is alive and wrong: the heartbeat is refreshed').toBe(r.t);
      expect(r.journal).toBe(true);
    });
  }

  test('the same setpoint is accepted far from the end of the authority and rejected near it (own position)', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0];
      for (let i = 0; i < 250; i++) S.step();
      S.ENV.fms = false;                                   // le réseau est coupé : l'autorisation n'est plus renouvelée
      const reste = () => T.auth.sEnd - T.s;
      const envoyer = () => { S.l1Inject(0, { vDemand: 2, dGoal: 100 }); S.step(); return T.l2.ex.filter(x => x.v === 2 && x.d === 100).pop(); };   // la consigne injectée, pas la régulière qui la suit
      const loin = reste(), e1 = envoyer();
      let n = 0;
      while (reste() > 60 && n++ < 3000) S.step();
      const pres = reste(), e2 = envoyer();
      return { loin, pres, e1: { ok: e1.ok, code: e1.code }, e2: { ok: e2.ok, code: e2.code } };
    });
    expect(r.loin, 'authority left at the first attempt (m)').toBeGreaterThan(100);
    expect(r.pres, 'authority left at the second attempt (m)').toBeLessThan(100);
    expect(r.e1, 'accepted while 100 m fit inside the authority').toEqual({ ok: true, code: null });
    expect(r.e2, 'the identical setpoint is rejected once the truck is nearer the end').toEqual({ ok: false, code: 'SETPOINT_BEYOND_MA' });
  });

  test('the position and speed claimed by level 1 never change a verdict', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0], dernier = () => T.l2.ex[T.l2.ex.length - 1];
      for (let i = 0; i < 100; i++) S.step();
      const ver = patch => { S.l1Inject(0, { vDemand: 2, ...patch }); S.step(); const e = T.l2.ex.filter(x => x.v === (patch.vDemand ?? 2) && x.d === (patch.dGoal ?? x.d)).pop(); return { ok: e.ok, code: e.code }; };
      return {
        saine: ver({}), saineMensonge: ver({ sClaim: 99999, vClaim: 99 }),
        survitesse: ver({ vDemand: 30 }), survitesseMensonge: ver({ vDemand: 30, sClaim: 0, vClaim: 0 }),
      };
    });
    expect(r.saineMensonge, 'wrong claims, valid fields: still accepted').toEqual(r.saine);
    expect(r.saine.ok).toBe(true);
    expect(r.survitesseMensonge, 'honest-looking claims, overspeed: still rejected').toEqual(r.survitesse);
    expect(r.survitesse).toEqual({ ok: false, code: 'SETPOINT_OVERSPEED' });
  });

  test('in the general-purpose profile, 20 s of nominal driving give no rejection (judged at the time of emission)', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim;
      S.ENV.kernel = 'GP';
      let rejets = 0, premier = null;
      for (let i = 0; i < 1000; i++) {
        S.step();
        for (const T of S.sim.trucks) if (T.l2.rejRun > 0) { rejets++; premier ??= `${T.id} at ${S.sim.t.toFixed(2)} s: ${T.l2.rej[T.l2.rej.length - 1].code}`; }
      }
      return { rejets, premier };
    });
    expect(r.rejets, r.premier ?? '').toBe(0);
  });
});

// T-08 : conduite nominale, PREEMPT_RT (AC-2). 40 graines de 60 s, trois tombereaux, découpées en quatre paquets.
test.describe('T-08 nominal operation, PREEMPT_RT (AC-2)', () => {
  for (const graines of paquets(40, 4)) {
    test(`seeds ${graines[0]} to ${graines[graines.length - 1]}: no rejection, no heartbeat loss, sequence +1 per setpoint, no truck beyond its authority`, async ({ page }) => {
      await openPage(page);
      const anomalies = await conduiteNominale(page, { graines, secondes: 60, profil: 'RT' });
      expect(anomalies, anomalies.join('\n')).toEqual([]);
    });
  }
});

// T-09 : perte du battement de cœur et redémarrage (S3, S4 ; AC-3 sur une graine, AC-4, AC-5).
test.describe('T-09 heartbeat loss and restart (S3, S4)', () => {
  test('a frozen level 1 is detected by level 2 alone, which stops the truck at maximum braking; the model measures the delay and the distance', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0];
      for (let i = 0; i < 500; i++) S.step();                      // 10 s de conduite normale
      const v0 = T.v;
      S.l1Freeze(0);
      const gel = { ...T.l1.ev };
      let arret = null, etats = new Set(), kinds = new Set(), seq0 = T.l2.seq, detecte = false;
      for (let i = 0; i < 2000 && arret === null; i++) {
        S.step();
        etats.add(T.state); kinds.add(T.stopKind + '/' + T.mc.appliedKind);
        if (T.l1.ev.tDetect !== null) detecte = true;
        if (detecte && T.v < 0.3) arret = { t: S.sim.t, s: T.s };
      }
      S.step();                                                    // le modèle note l'arrêt au début du pas suivant
      const code = S.sim.log.find(l => l.id === T.id && l.code === 'L1_HEARTBEAT_LOST');
      return { v0, gel, ev: { ...T.l1.ev }, arret, etats: [...etats], kinds: [...kinds], code: code ? { lvl: code.lvl } : null,
               seq: T.l2.seq - seq0, collisions: S.sim.collisions, final: T.state, latched: T.latched, urgence: S.sim.log.some(l => l.id === T.id && l.code === 'STATE' && /EMERGENCY/.test(JSON.stringify(l.msg))) };
    });
    expect(r.v0, 'the truck was moving').toBeGreaterThan(3);
    const delai = r.ev.tDetect - r.gel.tFreeze;
    expect(delai, 'detection delay = the 0.30 s deadline plus at most one supervisor step').toBeGreaterThan(0.30);
    expect(delai).toBeLessThanOrEqual(0.34);
    expect(r.code, 'level 2 reports the loss at severity 2').toEqual({ lvl: 2 });
    expect(r.etats, 'controlled stop, never the emergency brake').toContain('CONTROLLED_STOP');
    expect(r.etats).not.toContain('EMERGENCY_BRAKE');
    expect(r.kinds.some(k => k.endsWith('/MAX')), 'maximum braking applied by the motion controller').toBe(true);
    expect(r.arret, 'the truck comes to a stop').not.toBeNull();
    expect(r.ev.sStill, 'the model recorded the standstill').not.toBeNull();
    expect(Math.abs((r.ev.sStill - r.ev.sFreeze) - (r.arret.s - r.gel.sFreeze)), 'distance freeze → standstill: model against step-by-step measure (m)').toBeLessThanOrEqual(0.3);
    expect(r.ev.sStill - r.ev.sFreeze, 'the truck travelled before it stopped (m)').toBeGreaterThan(5);
    expect(r.seq, 'no setpoint arrived from the frozen level 1').toBe(0);
    expect(r.latched, 'not an emergency latch').toBe(false);
    expect(r.collisions).toBe(0);
  });

  test('restart: the stop is released about 2 s later (1 s stable heartbeat plus the usual 1 s hold), the truck moves again; a new freeze inside that time keeps it stopped', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0], pas = n => { for (let i = 0; i < n; i++) S.step(); };
      pas(500); S.l1Freeze(0); pas(300);                           // figé 6 s : arrêté
      const arrete = T.v < 0.3, etatArret = T.state;
      // 1) redémarrage puis nouveau gel 0,5 s plus tard : l'arrêt doit rester tenu
      S.l1Restart(0); pas(25); S.l1Freeze(0);
      let relache = false; for (let i = 0; i < 300; i++) { S.step(); if (LEVELS[T.state] < 2) relache = true; }
      const reste = T.state;
      // 2) vrai redémarrage
      S.l1Restart(0); const t0 = S.sim.t; let tLibre = null, vMax = 0;
      for (let i = 0; i < 1000; i++) { S.step(); vMax = Math.max(vMax, T.v); if (tLibre === null && (T.state === 'NOMINAL' || T.state === 'DEGRADED_SPEED')) tLibre = S.sim.t - t0; }
      return { arrete, etatArret, relache, reste, tLibre, vMax, session: T.l1.session, seq: T.l2.seq, latched: T.latched };
      function LEVELS(s) { return ['NOMINAL', 'DEGRADED_SPEED', 'CONTROLLED_STOP', 'EMERGENCY_BRAKE'].indexOf(s); }
    });
    expect(r.arrete).toBe(true);
    expect(r.etatArret).toBe('CONTROLLED_STOP');
    expect(r.relache, 'a freeze 0.5 s after the restart: the stop is never released').toBe(false);
    expect(r.reste).toBe('CONTROLLED_STOP');
    expect(r.tLibre, 'release delay after the real restart (s)').toBeGreaterThan(1.9);
    expect(r.tLibre).toBeLessThan(2.5);
    expect(r.vMax, 'the truck moves again').toBeGreaterThan(2);
    expect(r.session, 'two restarts, two new sessions').toBe(2);
    expect(r.latched).toBe(false);
  });

  test('level 1 freezing on a truck that is already stopped (loading) is still detected', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0];
      T.task = 'LOADING'; T.taskT = 60;
      let n = 0; while (T.v > 0.2 && n++ < 3000) S.step();
      S.l1Freeze(0);
      for (let i = 0; i < 40; i++) S.step();                       // 0,8 s
      return { v: T.v, state: T.state, task: T.task, detecte: T.reasons.some(x => x.code === 'L1_HEARTBEAT_LOST'), ev: { ...T.l1.ev } };
    });
    expect(r.task).toBe('LOADING');
    expect(r.detecte, 'the loss is reported although the truck was already stopped').toBe(true);
    expect(r.state).toBe('CONTROLLED_STOP');
    expect(r.ev.sStill - r.ev.sFreeze, 'no distance travelled').toBeLessThanOrEqual(0.3);
  });

  test('a latched emergency is neither lowered by the freeze nor released by the restart', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0], pas = n => { for (let i = 0; i < n; i++) S.step(); };
      pas(250); T.faults.estop = true; pas(100);
      const urgence = T.state, verrou = T.latched;
      T.faults.estop = false;                                      // la cause d'urgence disparaît ; le verrou reste
      S.l1Freeze(0); pas(100); const gele = T.state;
      S.l1Restart(0); pas(300);                                    // 6 s : bien plus que la reprise du battement
      return { urgence, verrou, gele, apres: T.state, latched: T.latched };
    });
    expect(r.urgence).toBe('EMERGENCY_BRAKE');
    expect(r.verrou).toBe(true);
    expect(r.gele, 'the heartbeat cause never lowers a more severe state').toBe('EMERGENCY_BRAKE');
    expect(r.apres, 'recovery of level 1 does not release a latched emergency').toBe('EMERGENCY_BRAKE');
    expect(r.latched).toBe(true);
  });
});

// T-10 : rejets persistants (S7, AC-8).
test.describe('T-10 persistent rejection (S7)', () => {
  test('one isolated defective setpoint, of any of the five kinds, does not stop the truck', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0], res = {};
      for (let i = 0; i < 500; i++) S.step();
      for (const d of ['OVERSPEED', 'BEYOND_MA', 'STALE', 'REPLAY', 'INTEGRITY']) {
        T.l1.defect = d; S.step();
        const rejete = !T.l2.ex[T.l2.ex.length - 1].ok;
        for (let i = 0; i < 150; i++) S.step();              // 3 s : le camion roule toujours
        res[d] = { rejete, etat: T.state, v: T.v };
      }
      return { res, codes: [...new Set(S.sim.log.filter(l => l.code.startsWith('L1_')).map(l => l.code))] };
    });
    for (const [d, x] of Object.entries(r.res)) {
      expect(x.rejete, `${d}: the defective setpoint was rejected`).toBe(true);
      expect(x.etat, `${d}: the truck keeps going`).not.toBe('CONTROLLED_STOP');
      expect(x.v, `${d}: the truck is moving (m/s)`).toBeGreaterThan(1);
    }
    expect(r.codes, 'no level 1 cause raised by isolated defects').toEqual([]);
  });

  test('a continuous overspeed defect stops the truck through L1_SETPOINTS_REJECTED (the heartbeat stays alive); the stop is released once setpoints are valid again', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0], pas = n => { for (let i = 0; i < n; i++) S.step(); };
      pas(500); const t0 = S.sim.t;
      T.l1.defect = 'OVERSPEED'; T.l1.repeat = true;
      let tCause = null;
      for (let i = 0; i < 400; i++) { S.step(); if (tCause === null && T.reasons.some(x => x.code === 'L1_SETPOINTS_REJECTED')) tCause = S.sim.t - t0; }
      const arrete = T.v < 0.3, etat = T.state;
      const aMonte = S.sim.log.some(l => l.id === T.id && l.code === 'L1_HEARTBEAT_LOST');
      T.l1.repeat = false; T.l1.defect = null; const t1 = S.sim.t; let tLibre = null, vMax = 0;
      for (let i = 0; i < 1000; i++) { S.step(); vMax = Math.max(vMax, T.v); if (tLibre === null && T.state === 'NOMINAL') tLibre = S.sim.t - t1; }
      return { tCause, arrete, etat, heartbeat: aMonte, tLibre, vMax, latched: T.latched };
    });
    expect(r.tCause, 'cause raised after the 10th consecutive rejection (0.2 s)').toBeGreaterThanOrEqual(0.18);
    expect(r.tCause).toBeLessThanOrEqual(0.26);
    expect(r.etat).toBe('CONTROLLED_STOP');
    expect(r.arrete, 'the truck is stopped').toBe(true);
    expect(r.heartbeat, 'level 1 is alive and wrong: no heartbeat loss').toBe(false);
    expect(r.tLibre, 'released about 2 s after setpoints are valid again').toBeGreaterThan(1.9);
    expect(r.tLibre).toBeLessThan(2.5);
    expect(r.vMax).toBeGreaterThan(2);
    expect(r.latched).toBe(false);
  });

  test('a continuous integrity defect raises the rejection cause first, then the heartbeat loss; both are logged', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0];
      for (let i = 0; i < 500; i++) S.step();
      T.l1.defect = 'INTEGRITY'; T.l1.repeat = true;
      for (let i = 0; i < 400; i++) S.step();
      const l = code => S.sim.log.find(x => x.id === T.id && x.code === code);
      return { rej: l('L1_SETPOINTS_REJECTED')?.t ?? null, hb: l('L1_HEARTBEAT_LOST')?.t ?? null, etat: T.state, v: T.v };
    });
    expect(r.rej, 'rejection cause logged').not.toBeNull();
    expect(r.hb, 'malformed messages are no heartbeat: loss logged too').not.toBeNull();
    expect(r.rej, 'the rejection run (0.2 s) comes before the heartbeat deadline (0.3 s)').toBeLessThan(r.hb);
    expect(r.etat).toBe('CONTROLLED_STOP');
    expect(r.v).toBeLessThan(0.3);
  });
});

// T-11 : scénarios F et G (S3, S5).
test.describe('T-11 scenarios F and G', () => {
  test('scenario F freezes the level 1 of the fastest truck and level 2 stops it', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim;
      for (let i = 0; i < 500; i++) S.step();
      const vitesses = S.sim.trucks.map(T => T.v), plusRapide = vitesses.indexOf(Math.max(...vitesses));
      S.scenario('F');
      const T = S.sim.trucks[plusRapide];
      const sel = S.sim.trucks.findIndex(x => x.l1.frozen);
      for (let i = 0; i < 50; i++) S.step();
      return { plusRapide, gele: sel, autres: S.sim.trucks.filter(x => x !== T).map(x => x.l1.frozen), etat: T.state, code: S.sim.log.some(l => l.id === T.id && l.code === 'L1_HEARTBEAT_LOST'),
               ligne: S.sim.log.find(l => l.code === 'SCENARIO' && l.msg.k === 'log.scenF')?.msg.p.t };
    });
    expect(r.gele, 'the fastest truck is the one frozen').toBe(r.plusRapide);
    expect(r.autres, 'the other trucks keep their level 1').toEqual([false, false]);
    expect(r.etat).toBe('CONTROLLED_STOP');
    expect(r.code).toBe(true);
    expect(r.ligne, 'the scenario line names the truck').toBe(`AHT-0${r.plusRapide + 1}`);
  });

  test('scenario G sends one defective setpoint of the chosen kind; level 2 rejects it and the truck carries on', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, res = {};
      for (let i = 0; i < 500; i++) S.step();
      for (const d of ['OVERSPEED', 'BEYOND_MA', 'STALE', 'REPLAY', 'INTEGRITY']) {
        S.ENV.l1Defect = d; S.scenario('G');
        const T = S.sim.trucks.find(x => x.l1.defect === d);
        S.step();
        const code = T.l2.rej[T.l2.rej.length - 1]?.code;
        for (let i = 0; i < 100; i++) S.step();
        res[d] = { code, etat: T.state, v: T.v, defaut: T.l1.defect };
      }
      return res;
    });
    const attendu = { OVERSPEED: 'SETPOINT_OVERSPEED', BEYOND_MA: 'SETPOINT_BEYOND_MA', STALE: 'SETPOINT_STALE', REPLAY: 'SETPOINT_SEQUENCE', INTEGRITY: 'SETPOINT_INTEGRITY' };
    for (const [d, c] of Object.entries(attendu)) {
      expect(r[d].code, `${d}: the verdict names the defect`).toBe(c);
      expect(r[d].defaut, `${d}: one setpoint only`).toBeNull();
      expect(r[d].etat, `${d}: the truck carries on`).not.toBe('CONTROLLED_STOP');
    }
  });
});

// T-12 : scénarios F et G sur 40 graines (AC-3, AC-6).
test.describe('T-12 scenarios F and G over 40 seeds (AC-3, AC-6)', () => {
  for (const graines of paquets(40, 4)) {
    test(`F, seeds ${graines[0]} to ${graines[graines.length - 1]}: detected in 0.30 to 0.34 s, controlled stop at maximum braking, truck stopped, no collision`, async ({ page }) => {
      await openPage(page);
      const anomalies = await scenarioFSurGraines(page, graines);
      expect(anomalies, anomalies.join('\n')).toEqual([]);
    });
    test(`G, seeds ${graines[0]} to ${graines[graines.length - 1]}: five defects at three moments are rejected, never applied, never beyond the authority`, async ({ page }) => {
      await openPage(page);
      const anomalies = await scenarioGSurGraines(page, graines);
      expect(anomalies, anomalies.join('\n')).toEqual([]);
    });
  }
  test('G in a dust cloud, seeds 1 to 10', async ({ page }) => {
    await openPage(page);
    const anomalies = await scenarioGSurGraines(page, paquets(10, 1)[0], { poussiere: true, moments: ['cruise'] });
    expect(anomalies, anomalies.join('\n')).toEqual([]);
  });
});
