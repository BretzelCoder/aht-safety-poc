// Spec 002, volet 3 : profil de latence du noyau (T-01 : relations entre paramètres).
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { verifierRelationsProfil } from './helpers/latence.mjs';

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
