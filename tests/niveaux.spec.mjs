// Spec 002, volet 1 : niveau 1 (autonomie) et niveau 2 (sûreté). T-04 : le flux de consignes.
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';

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
