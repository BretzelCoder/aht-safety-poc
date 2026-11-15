// Spec 002, volet 1 : niveau 1 (autonomie) et niveau 2 (sûreté). T-04 : le flux de consignes.
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { conduiteNominale, paquets } from './helpers/niveaux.mjs';

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
