// Spec 002, volets 2 et 4 et condition de validation du plan : tout reste à l'écran à 1600×900.
// T-14 : carte « Calculateur d'autonomie », boutons F et G, mise en page.
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';

/**
 * Mesure la mise en page : la page ne défile pas, aucune carte ne sort de l'écran, aucune colonne ne cache de contenu
 * derrière un défilement interne. Rend la liste des anomalies (vide quand tout tient à l'écran).
 */
async function verifierMiseEnPage(page) {
  return page.evaluate(() => {
    const anomalies = [], W = innerWidth, H = innerHeight, de = document.documentElement;
    if (de.scrollHeight > H + 1) anomalies.push(`the page scrolls vertically (${de.scrollHeight} px for a ${H} px window)`);
    if (de.scrollWidth > W + 1) anomalies.push(`the page scrolls horizontally (${de.scrollWidth} px for a ${W} px window)`);
    for (const c of document.querySelectorAll('.card')) {
      const r = c.getBoundingClientRect(), nom = (c.querySelector('h3')?.textContent || c.className).trim().slice(0, 30);
      if (r.width === 0 || r.height === 0) anomalies.push(`card "${nom}" is not displayed`);
      if (r.top < -0.5 || r.left < -0.5 || r.bottom > H + 0.5 || r.right > W + 0.5) anomalies.push(`card "${nom}" leaves the screen (${Math.round(r.top)}–${Math.round(r.bottom)} px of ${H})`);
      if (c.scrollHeight > c.clientHeight + 1 && !c.classList.contains('logcard')) anomalies.push(`card "${nom}" is squeezed: its content needs ${c.scrollHeight} px and it has ${c.clientHeight} px`);
    }
    for (const sel of ['.ctrl', '.center', '.side']) {
      const e = document.querySelector(sel);
      if (e.scrollHeight > e.clientHeight + 1) anomalies.push(`column ${sel} hides content behind an inner scroll (${e.scrollHeight} px in ${e.clientHeight} px)`);
    }
    return anomalies;
  });
}

test.describe('T-14 layout at 1600×900 (plan approval, condition 3)', () => {
  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: nothing leaves the screen and the new card is displayed`, async ({ page }) => {
      await openPage(page, lang);
      await pauseAndSeed(page, 1);
      await page.waitForTimeout(300);                       // le temps d'une mise en page complète
      const anomalies = await verifierMiseEnPage(page);
      expect(anomalies, anomalies.join('\n')).toEqual([]);
      await expect(page.locator('#cardL1')).toBeVisible();
    });
  }
});

test.describe('T-14 autonomy computer card and scenario buttons (S3, S5, S12)', () => {
  test('the kernel select drives the model and its labels come from the model parameters', async ({ page }) => {
    await openPage(page, 'en');
    await pauseAndSeed(page, 1);
    const libelles = await page.locator('#selKernel option').allTextContents();
    const P = await page.evaluate(() => ({ rt: window.__sim.P.latCpuRT * 1000, gp: window.__sim.P.latCpuGP * 1000 }));
    expect(libelles[0]).toBe(`PREEMPT_RT kernel · compute ${P.rt} ms`);
    expect(libelles[1]).toBe(`General-purpose kernel · compute ${P.gp} ms`);
    await page.selectOption('#selKernel', 'GP');
    expect(await page.evaluate(() => window.__sim.ENV.kernel)).toBe('GP');
    await page.selectOption('#selKernel', 'RT');
    expect(await page.evaluate(() => window.__sim.ENV.kernel)).toBe('RT');
  });

  test('the freeze button freezes and restarts level 1 of the selected truck', async ({ page }) => {
    await openPage(page, 'en');
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
    await expect(page.locator('#bFreeze')).toHaveText('Freeze level 1');
    await page.click('#bFreeze');
    await expect(page.locator('#bFreeze')).toHaveText('Restart level 1');
    const gele = await page.evaluate(() => { const S = window.__sim; for (let i = 0; i < 40; i++) S.step(); const T = S.sim.trucks[0]; return { frozen: T.l1.frozen, etat: T.state, autres: S.sim.trucks.slice(1).map(x => x.l1.frozen) }; });
    expect(gele).toEqual({ frozen: true, etat: 'CONTROLLED_STOP', autres: [false, false] });
    await page.click('#bFreeze');
    await expect(page.locator('#bFreeze')).toHaveText('Freeze level 1');
    expect(await page.evaluate(() => ({ f: window.__sim.sim.trucks[0].l1.frozen, s: window.__sim.sim.trucks[0].l1.session }))).toEqual({ f: false, s: 1 });
  });

  test('the freeze button acts on the truck selected in the tabs', async ({ page }) => {
    await openPage(page, 'en');
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { window.__sim.step(); window.__sim.step(); });
    await page.waitForSelector('#tabs button');
    await page.click('#tabs button[data-sel="2"]');
    await page.click('#bFreeze');
    expect(await page.evaluate(() => window.__sim.sim.trucks.map(T => T.l1.frozen))).toEqual([false, false, true]);
  });

  test('the defect select and the send button make level 2 reject one setpoint with the right code', async ({ page }) => {
    await openPage(page, 'en');
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
    const attendu = { OVERSPEED: 'SETPOINT_OVERSPEED', BEYOND_MA: 'SETPOINT_BEYOND_MA', STALE: 'SETPOINT_STALE', REPLAY: 'SETPOINT_SEQUENCE', INTEGRITY: 'SETPOINT_INTEGRITY' };
    for (const [defaut, code] of Object.entries(attendu)) {
      await page.selectOption('#selDefect', defaut);
      await page.click('#bSendDef');
      const r = await page.evaluate(() => { const S = window.__sim, T = S.sim.trucks[0]; S.step(); return { code: T.l2.rej[T.l2.rej.length - 1]?.code, defaut: T.l1.defect }; });
      expect(r.code, defaut).toBe(code);
      expect(r.defaut, `${defaut}: a single setpoint`).toBeNull();
      await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__sim.step(); });
    }
  });

  test('the continuous box keeps sending the defect until it is unticked', async ({ page }) => {
    await openPage(page, 'en');
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
    await page.selectOption('#selDefect', 'OVERSPEED');
    await page.check('#cDefRepeat');
    await page.click('#bSendDef');
    const r1 = await page.evaluate(() => { const S = window.__sim, T = S.sim.trucks[0]; for (let i = 0; i < 25; i++) S.step(); return { etat: T.state, cause: T.reasons.some(x => x.code === 'L1_SETPOINTS_REJECTED'), repeat: T.l1.repeat }; });
    expect(r1).toEqual({ etat: 'CONTROLLED_STOP', cause: true, repeat: true });
    await page.uncheck('#cDefRepeat');
    const r2 = await page.evaluate(() => { const T = window.__sim.sim.trucks[0]; return { repeat: T.l1.repeat, defaut: T.l1.defect }; });
    expect(r2).toEqual({ repeat: false, defaut: null });
  });

  for (const code of ['F', 'G']) {
    test(`the scenario button ${code} launches scenario ${code}`, async ({ page }) => {
      await openPage(page, 'en');
      await pauseAndSeed(page, 1);
      await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
      await page.click(`[data-scen="${code}"]`);
      const r = await page.evaluate(() => { const S = window.__sim; return { gele: S.sim.trucks.some(T => T.l1.frozen), arme: S.sim.trucks.some(T => T.l1.defect), ligne: S.sim.log.some(l => l.code === 'SCENARIO' && l.msg.k && l.msg.k.startsWith('log.scen')) }; });
      expect(r.ligne).toBe(true);
      expect(code === 'F' ? r.gele : r.arme).toBe(true);
    });
  }
});
