// Spec 002, volet 3 : profil de latence du noyau (T-01 : relations entre paramètres).
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { verifierRelationsProfil } from './helpers/latence.mjs';
import { conduiteNominale, paquets } from './helpers/niveaux.mjs';
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

// T-08 : conduite nominale dans les deux profils, et avec des bascules en cours de route (AC-14), autorisation de mouvement tenue.
test.describe('T-08 nominal operation in both profiles (AC-14)', () => {
  for (const profil of ['GP', 'bascule']) {
    for (const graines of paquets(40, 4)) {
      test(`${profil === 'GP' ? 'general-purpose kernel' : 'profile switched at 20 s and 40 s'}, seeds ${graines[0]} to ${graines[graines.length - 1]}: no rejection, no heartbeat loss, no truck beyond its authority`, async ({ page }) => {
        await openPage(page);
        const anomalies = await conduiteNominale(page, { graines, secondes: 60, profil });
        expect(anomalies, anomalies.join('\n')).toEqual([]);
      });
    }
  }
});

// T-11 : les scénarios A à E et la réinitialisation remettent PREEMPT_RT ; F et G gardent le choix du visiteur (S12b, AC-22).
test.describe('T-11 kernel profile at scenario launch (S12b, AC-22)', () => {
  for (const code of ['A', 'B', 'C', 'D', 'E']) {
    test(`scenario ${code} brings the profile back to PREEMPT_RT and says so`, async ({ page }) => {
      await openPage(page);
      await pauseAndSeed(page, 1);
      const r = await page.evaluate(c => {
        const S = window.__sim;
        for (let i = 0; i < 250; i++) S.step();
        S.ENV.kernel = 'GP';
        S.scenario(c);
        return {
          kernel: S.ENV.kernel,
          journal: S.sim.log.some(l => l.code === 'ENV' && l.msg.k === 'log.kernelReset'),
          avis: document.getElementById('toast').textContent,
        };
      }, code);
      expect(r.kernel, 'profile after launch').toBe('RT');
      expect(r.journal, 'a line in the event log').toBe(true);
      expect(r.avis, 'a message on screen').toContain('PREEMPT_RT');
    });
  }

  test('with PREEMPT_RT already selected, launching a scenario says nothing about the profile', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    const r = await page.evaluate(() => {
      const S = window.__sim; S.scenario('B');
      return { journal: S.sim.log.some(l => l.msg && l.msg.k === 'log.kernelReset'), avis: document.getElementById('toast').textContent };
    });
    expect(r.journal).toBe(false);
    expect(r.avis).not.toContain('PREEMPT_RT');
  });

  test('the reset button brings the profile back to PREEMPT_RT and says so', async ({ page }) => {
    await openPage(page);
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { window.__sim.ENV.kernel = 'GP'; });
    await page.click('#bReset');
    const r = await page.evaluate(() => ({ kernel: window.__sim.ENV.kernel, avis: document.getElementById('toast').textContent, journal: window.__sim.sim.log.some(l => l.msg && l.msg.k === 'log.kernelReset') }));
    expect(r.kernel).toBe('RT');
    expect(r.avis).toContain('PREEMPT_RT');
    expect(r.journal).toBe(true);
  });

  for (const code of ['F', 'G']) {
    test(`scenario ${code} keeps the profile the visitor chose`, async ({ page }) => {
      await openPage(page);
      await pauseAndSeed(page, 1);
      const r = await page.evaluate(c => {
        const S = window.__sim;
        for (let i = 0; i < 250; i++) S.step();
        S.ENV.kernel = 'GP';
        S.scenario(c);
        return { kernel: S.ENV.kernel, journal: S.sim.log.some(l => l.msg && l.msg.k === 'log.kernelReset') };
      }, code);
      expect(r.kernel).toBe('GP');
      expect(r.journal).toBe(false);
    });
  }
});
