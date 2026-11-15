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

// T-15 : onglet « Niveaux 1 ↔ 2 », les deux blocs (S8, S9, S10).
test.describe('T-15 levels 1 ↔ 2 pane, blocks (S8, S9, S10)', () => {
  async function ouvrir(page, lang = 'en') {
    await openPage(page, lang);
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
    await page.click('#tabL12');
  }

  test('the pane shows two distinct blocks, level 1 and level 2, each with a status', async ({ page }) => {
    await ouvrir(page);
    await expect(page.locator('#paneL12')).toBeVisible();
    await expect(page.locator('#scope')).toBeHidden();
    await expect(page.locator('#blkL1 h4')).toContainText('Level 1 · autonomy');
    await expect(page.locator('#blkL2 h4')).toContainText('Level 2 · safety');
    await expect(page.locator('#blkL1')).toHaveAttribute('data-status', 'running');
    await expect(page.locator('#blkL1 .chip')).toContainText('running');
    await expect(page.locator('#blkL2 .chip')).toContainText('NOMINAL');
    const [b1, b2] = await Promise.all([page.locator('#blkL1').boundingBox(), page.locator('#blkL2').boundingBox()]);
    expect(b1.x + b1.width, 'the blocks sit side by side').toBeLessThan(b2.x);
    expect(await page.locator('#blkL1').evaluate(e => getComputedStyle(e).borderStyle), 'level 1 is drawn dashed').toBe('dashed');
    expect(await page.locator('#blkL2').evaluate(e => getComputedStyle(e).borderStyle), 'level 2 is drawn solid').toBe('solid');
  });

  test('level 2 shows its own measurements, which follow the model', async ({ page }) => {
    await ouvrir(page);
    const m = await page.evaluate(() => { const T = window.__sim.sim.trucks[0]; return { s: Math.round(T.s), kmh: (T.v * 3.6).toFixed(1) }; });
    const texte = await page.locator('#blkL2').innerText();
    expect(texte).toContain(`${m.s} m`);
    expect(texte).toContain(`${m.kmh} km/h`);
    expect(texte).toMatch(/Brakes\s+released|Brakes\s+service braking/);
    expect(await page.locator('#blkL2').getAttribute('data-brake')).toMatch(/released|service/);
  });

  test('a frozen level 1 shows as silent and level 2 shows full braking during the stop', async ({ page }) => {
    await ouvrir(page);
    await page.evaluate(() => { const S = window.__sim; S.l1Freeze(0); for (let i = 0; i < 60; i++) S.step(); });
    await expect(page.locator('#blkL1')).toHaveAttribute('data-status', 'silent');
    await expect(page.locator('#blkL1 .chip')).toContainText('silent');
    await expect(page.locator('#blkL2')).toHaveAttribute('data-brake', 'full');
    await expect(page.locator('#blkL2')).toContainText('full braking');
    await expect(page.locator('#blkL2 .chip')).toContainText('CONTROLLED_STOP');
  });

  test('a level 1 sending defective setpoints shows as in fault', async ({ page }) => {
    await ouvrir(page);
    await page.evaluate(() => { const S = window.__sim, T = S.sim.trucks[0]; T.l1.defect = 'OVERSPEED'; T.l1.repeat = true; for (let i = 0; i < 5; i++) S.step(); });
    await expect(page.locator('#blkL1')).toHaveAttribute('data-status', 'faulty');
    await expect(page.locator('#blkL1 .chip')).toContainText('in fault');
  });

  test('selecting another truck changes the content of the blocks', async ({ page }) => {
    await ouvrir(page);
    await page.waitForSelector('#tabs button');
    const avant = await page.locator('#blkL2').innerText();
    await page.click('#tabs button[data-sel="1"]');
    const s1 = await page.evaluate(() => Math.round(window.__sim.sim.trucks[1].s));
    await expect(page.locator('#blkL2')).toContainText(`${s1} m`);
    expect(await page.locator('#blkL2').innerText()).not.toBe(avant);
    await page.evaluate(() => window.__sim.l1Freeze(1));
    await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__sim.step(); });
    await expect(page.locator('#blkL1')).toHaveAttribute('data-status', 'silent');
    await page.click('#tabs button[data-sel="0"]');
    await expect(page.locator('#blkL1')).toHaveAttribute('data-status', 'running');
  });

  test('switching back to the oscilloscope gives its canvas a non-zero size again', async ({ page }) => {
    await ouvrir(page);
    await page.click('#tabScope');
    await expect(page.locator('#scope')).toBeVisible();
    await expect(page.locator('#paneL12')).toBeHidden();
    await expect.poll(() => page.evaluate(() => { const c = document.getElementById('scope'); return [c.clientWidth, c.width, c.height]; })).toEqual(expect.arrayContaining([expect.any(Number)]));
    const [cw, w, h] = await page.evaluate(() => { const c = document.getElementById('scope'); return [c.clientWidth, c.width, c.height]; });
    expect(cw).toBeGreaterThan(100);
    expect(w).toBeGreaterThan(100);
    expect(h).toBeGreaterThan(50);
  });

  test('scenarios F and G open the pane', async ({ page }) => {
    await openPage(page, 'en');
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
    await expect(page.locator('#scope')).toBeVisible();
    await page.click('[data-scen="F"]');
    await expect(page.locator('#paneL12')).toBeVisible();
    await page.click('#tabScope');
    await page.click('[data-scen="G"]');
    await expect(page.locator('#paneL12')).toBeVisible();
  });

  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: with the pane open, nothing leaves the screen at 1600×900`, async ({ page }) => {
      await ouvrir(page, lang);
      await page.evaluate(() => { window.__sim.l1Freeze(0); for (let i = 0; i < 60; i++) window.__sim.step(); });
      await page.waitForTimeout(300);
      const anomalies = await verifierMiseEnPage(page);
      expect(anomalies, anomalies.join('\n')).toEqual([]);
    });
  }
});

// T-16 : onglet « Niveaux 1 ↔ 2 », la liste des échanges (S8, S11 ; AC-9, AC-10).
test.describe('T-16 levels 1 ↔ 2 pane, exchanges (S8, S11)', () => {
  async function ouvrir(page, lang = 'en') {
    const journal = await openPage(page, lang);
    await pauseAndSeed(page, 1);
    await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
    await page.click('#tabL12');
    return journal;
  }
  const lignes = page => page.locator('#exL12 .xr:not(.hd)');

  test('five rows with sequence, timestamp, speed, goal distance, checksum mark and verdict, read from the model', async ({ page }) => {
    await ouvrir(page);
    await expect(lignes(page)).toHaveCount(5);
    const modele = await page.evaluate(() => window.__sim.sim.trucks[0].l2.ex.map(e => ({ seq: e.seq, ts: e.ts.toFixed(2), v: (e.v * 3.6).toFixed(1), d: Math.round(e.d) })));
    const rows = await lignes(page).evaluateAll(els => els.map(e => [...e.children].map(c => c.textContent)));
    rows.forEach((r, i) => {
      expect(r[0], `row ${i} sequence`).toBe(`#${modele[i].seq}`);
      expect(r[1], `row ${i} timestamp`).toBe(modele[i].ts);
      expect(r[2], `row ${i} speed demand`).toBe(modele[i].v);
      expect(r[3], `row ${i} goal distance`).toBe(String(modele[i].d));
      expect(r[4], `row ${i} checksum mark`).toBe('✓');
      expect(r[5], `row ${i} verdict`).toBe('accepted');
    });
    expect(Number(rows[4][0].slice(1)) - Number(rows[0][0].slice(1)), 'consecutive sequence numbers').toBe(4);
  });

  test('a rejection stays listed, and readable, while accepted setpoints scroll past it', async ({ page }) => {
    await ouvrir(page);
    await page.evaluate(() => { const S = window.__sim, T = S.sim.trucks[0]; T.l1.defect = 'STALE'; S.step(); for (let i = 0; i < 30; i++) S.step(); });
    await expect(lignes(page)).toHaveCount(6);                    // 5 acceptés + le rejet sorti de la fenêtre
    const rejet = page.locator('#exL12 .xr.bad');
    await expect(rejet).toHaveCount(1);
    await expect(rejet).toContainText('SETPOINT_STALE');
    await expect(rejet.locator('span').nth(4), 'a stale setpoint has a valid checksum').toHaveText('✓');
    await expect(page.locator('#exL12 .why')).toContainText('rejected: too old');
    await page.evaluate(() => { const S = window.__sim, T = S.sim.trucks[0]; for (const d of ['INTEGRITY', 'BEYOND_MA', 'OVERSPEED']) { T.l1.defect = d; S.step(); for (let i = 0; i < 10; i++) S.step(); } });
    await expect(page.locator('#exL12 .xr.bad'), 'the three latest rejections are kept').toHaveCount(3);
    await expect(page.locator('#exL12 .xr.bad').first()).toContainText('SETPOINT_INTEGRITY');
    await expect(page.locator('#exL12 .xr.bad').first().locator('span').nth(4), 'an altered setpoint fails its checksum').toHaveText('✗');
  });

  test('a language switch retranslates the exchanges already listed', async ({ page }) => {
    await ouvrir(page);
    await page.evaluate(() => { const S = window.__sim, T = S.sim.trucks[0]; T.l1.defect = 'STALE'; S.step(); for (let i = 0; i < 30; i++) S.step(); });
    await expect(page.locator('#exL12 .why')).toContainText('rejected: too old');
    await page.click('[data-lang="fr"]');
    await expect(page.locator('#exL12 .why')).toContainText('rejetée : trop ancienne');
    await expect(lignes(page).last().locator('span').nth(5)).toHaveText('accepté');
    await expect(page.locator('#blkL2')).toContainText('Battement');
    await page.click('[data-lang="de"]');
    await expect(page.locator('#exL12 .why')).toContainText('abgelehnt: zu alt');
    await expect(lignes(page).last().locator('span').nth(5)).toHaveText('akzeptiert');
    await expect(page.locator('#exL12 .xr.bad')).toContainText('SETPOINT_STALE');          // le code ne se traduit jamais
    await expect(page.locator('#blkL2')).toContainText('Herzschlag');
  });

  test('during a recovery the pane shows the time left before the stop is released', async ({ page }) => {
    await ouvrir(page);
    await page.evaluate(() => { const S = window.__sim; S.l1Freeze(0); for (let i = 0; i < 100; i++) S.step(); S.l1Restart(0); for (let i = 0; i < 25; i++) S.step(); });
    await expect(page.locator('#exL12 .rel')).toContainText('Resume possible in');
    const reste = Number((await page.locator('#exL12 .rel').innerText()).match(/in ([\d.]+) s/)[1]);
    expect(reste, 'seconds left (1 s of stable heartbeat, 0.5 s done)').toBeGreaterThan(0.3);
    expect(reste).toBeLessThanOrEqual(0.6);
    await page.evaluate(() => { for (let i = 0; i < 100; i++) window.__sim.step(); });
    await expect(page.locator('#exL12 .rel')).toHaveCount(0);
  });

  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: the pane opens with no console error and no key missing`, async ({ page }) => {
      const journal = await ouvrir(page, lang);
      await page.evaluate(() => { const S = window.__sim, T = S.sim.trucks[0]; T.l1.defect = 'REPLAY'; S.step(); S.l1Freeze(1); for (let i = 0; i < 80; i++) S.step(); });
      await page.waitForTimeout(250);
      const autres = journal.erreursConsole.filter(e => !journal.bloquees.includes(e.url));
      expect(autres, `console errors in ${lang}`).toEqual([]);
      expect(journal.erreursPage).toEqual([]);
      expect(await page.evaluate(() => [...window.__sim.i18nMissing])).toEqual([]);
    });
  }

  test('worst case for the layout: three isolated rejections still listed, a recovery under way, in every language', async ({ page }) => {
    for (const lang of ['fr', 'en', 'de']) {
      await ouvrir(page, lang);
      await page.evaluate(() => {
        const S = window.__sim, T = S.sim.trucks[0];
        for (const d of ['STALE', 'BEYOND_MA', 'INTEGRITY']) { T.l1.defect = d; S.step(); for (let i = 0; i < 12; i++) S.step(); }
        S.l1Freeze(0); for (let i = 0; i < 40; i++) S.step(); S.l1Restart(0); for (let i = 0; i < 12; i++) S.step();
      });
      await page.waitForTimeout(300);
      const anomalies = await verifierMiseEnPage(page);
      expect(anomalies, `${lang}: ${anomalies.join(' | ')}`).toEqual([]);
    }
  });
});
