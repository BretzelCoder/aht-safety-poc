// Spec 002, volet 3 : profil de latence du noyau (T-01 : relations entre paramètres).
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { verifierRelationsProfil } from './helpers/latence.mjs';
import { mesurerProfil, ATTENDU, ATTENDU_GP } from './helpers/physique.mjs';

test.describe('T-01 kernel profile parameters (S15)', () => {
  test('the profile delay stays inside the heartbeat deadline and the staleness limit', async ({ page }) => {
    await openPage(page);
    const P = await page.evaluate(() => ({ ...window.__sim.P }));
    expect(verifierRelationsProfil(P), 'parameter relations of the real page').toEqual([]);
  });

  test('a general-purpose latency of 0.6 s breaks both relations and the report names them', async ({ page }) => {
    await openPage(page);
    const P = await page.evaluate(() => ({ ...window.__sim.P }));
    const messages = verifierRelationsProfil({ ...P, latCpuGP: 0.6 }).map(e => e.message);
    expect(messages.some(m => m.includes('heartbeat deadline')), messages.join(' | ')).toBe(true);
    expect(messages.some(m => m.includes('staleness limit')), messages.join(' | ')).toBe(true);
  });

  test('the default profile is PREEMPT_RT and a reset brings it back', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, avant = S.ENV.kernel;
      S.ENV.kernel = 'GP'; S.resetSim();
      return { avant, apres: S.ENV.kernel, l1: Object.keys(S.sim.trucks[0].l1), l2: Object.keys(S.sim.trucks[0].l2) };
    });
    expect(r.avant).toBe('RT');
    expect(r.apres, 'resetSim() returns the profile to PREEMPT_RT').toBe('RT');
    expect(r.l1).toContain('frozen');
    expect(r.l2).toContain('vAccepted');
  });
});

// T-05 : le profil de noyau dans le modèle (S12, S13, S15 ; AC-11, AC-12).
test.describe('T-05 kernel profile in the model (S12, S13)', () => {
  test('with PREEMPT_RT the stopping distances are exactly today\'s (AC-11)', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const rt = await mesurerProfil(page, 'RT');
    expect(rt.videPlat, 'empty, flat').toBeCloseTo(ATTENDU.videPlat, 0);
    expect(Math.abs(rt.videPlat - ATTENDU.videPlat)).toBeLessThanOrEqual(ATTENDU.tolerance);
    expect(Math.abs(rt.chargeDescente - ATTENDU.chargeDescente)).toBeLessThanOrEqual(ATTENDU.tolerance);
  });

  test('the general-purpose kernel adds exactly the latency difference to t_lat and v times it to d_stop (AC-12)', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const rt = await mesurerProfil(page, 'RT');
    const gp = await mesurerProfil(page, 'GP');
    const ecart = (await page.evaluate(() => window.__sim.P.latCpuGP - window.__sim.P.latCpuRT));
    expect(ecart).toBeCloseTo(ATTENDU_GP.ecartLatence, 9);
    expect(gp.tLat - rt.tLat, 't_lat grows by the difference of the two computing latencies').toBeCloseTo(ecart, 9);
    for (const cas of ['videPlat', 'chargeDescente']) {
      expect(gp[cas] - rt[cas], `d_stop (${cas}) grows by speed × latency difference`).toBeCloseTo(rt.v * ecart, 6);
    }
    expect(Math.abs(gp.videPlat - ATTENDU_GP.videPlat), `empty flat ${gp.videPlat.toFixed(2)} m`).toBeLessThanOrEqual(ATTENDU_GP.tolerance);
    expect(Math.abs(gp.chargeDescente - ATTENDU_GP.chargeDescente), `loaded downhill ${gp.chargeDescente.toFixed(2)} m`).toBeLessThanOrEqual(ATTENDU_GP.tolerance);
  });

  test('switching profile in the middle of a run never delivers a setpoint out of order', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim, T = S.sim.trucks[0], vus = [];
      let desordre = -1;
      const pas = (n, kernel) => {
        S.ENV.kernel = kernel;
        for (let i = 0; i < n; i++) {
          S.step(); vus.push(T.l2.seq);
          const q = T.l2.ex.map(e => e.seq);               // les 5 derniers jugements, dans l'ordre de livraison
          if (desordre < 0 && q.some((x, k) => k > 0 && x <= q[k - 1])) desordre = vus.length;
        }
      };
      pas(100, 'RT'); pas(150, 'GP'); pas(150, 'RT'); pas(150, 'GP');
      let recul = -1;
      for (let i = 1; i < vus.length; i++) if (vus[i] < vus[i - 1]) { recul = i; break; }
      return { recul, desordre, derniers: vus.slice(-3), n: vus.length };
    });
    expect(r.recul, 'level 2\'s last sequence number never goes back').toBe(-1);
    expect(r.desordre, 'setpoints are judged in the order they were sent (step of the first disorder, or -1)').toBe(-1);
    expect(r.derniers[2], 'setpoints keep arriving').toBeGreaterThan(400);
  });
});
