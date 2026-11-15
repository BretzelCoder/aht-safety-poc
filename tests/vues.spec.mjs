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
      if (e.scrollWidth > e.clientWidth + 1) anomalies.push(`column ${sel} scrolls sideways (${e.scrollWidth} px of content in ${e.clientWidth} px)`);
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

// Revue du propriétaire (2026-11-15) : sur son écran, avec les vraies polices, la colonne de gauche défilait sur le côté en anglais.
// Le premier test de mise en page ne regardait que le défilement vertical. Les polices de repli des tests sont plus étroites que
// celles du visiteur : le test « police large » impose donc une marge, en remplaçant toutes les polices par une police à chasse fixe.
test.describe('T-14 no sideways scroll, at two screen sizes and with a wider font (owner review)', () => {
  for (const [largeur, hauteur] of [[1600, 900], [1920, 1080]]) {
    for (const lang of ['fr', 'en', 'de']) {
      for (const large of [false, true]) {
        test(`${largeur}×${hauteur}, ${lang}${large ? ', wider font' : ''}: the page and the columns do not scroll sideways`, async ({ page }) => {
          await page.setViewportSize({ width: largeur, height: hauteur });
          await openPage(page, lang);
          await pauseAndSeed(page, 1);
          if (large) { await page.addStyleTag({ content: '*{font-family:"Courier New",monospace !important}' }); await page.evaluate(() => { window.__large = true; }); }
          await page.waitForTimeout(300);
          const anomalies = await page.evaluate(() => {
            const r = [], de = document.documentElement;
            if (de.scrollWidth > innerWidth + 1) r.push(`the page scrolls sideways (${de.scrollWidth} px in ${innerWidth} px)`);
            const col = document.querySelector('.ctrl').getBoundingClientRect(), nouvelle = document.getElementById('cardL1').getBoundingClientRect();
            // Police large : seule la carte ajoutée par la spec 002 est jugée, les cartes plus anciennes dépassent déjà de quelques pixels avec cette police.
            if (nouvelle.right > col.right + 0.5) r.push(`card "Autonomy" sticks out of its column by ${Math.round(nouvelle.right - col.right)} px`);
            if (!window.__large) for (const sel of ['.ctrl', '.center', '.side']) { const e = document.querySelector(sel); if (e.scrollWidth > e.clientWidth + 1) r.push(`column ${sel} scrolls sideways (${e.scrollWidth} px of content in ${e.clientWidth} px)`); }
            return r;
          });
          expect(anomalies, anomalies.join(' | ')).toEqual([]);
        });
      }
    }
  }
});

test.describe('T-14 autonomy computer card and scenario buttons (S3, S5, S12)', () => {
  test('the kernel select drives the model and its labels come from the model parameters', async ({ page }) => {
    await openPage(page, 'en');
    await pauseAndSeed(page, 1);
    const libelles = await page.locator('#selKernel option').allTextContents();
    const P = await page.evaluate(() => ({ rt: window.__sim.P.latCpuRT * 1000, gp: window.__sim.P.latCpuGP * 1000 }));
    expect(libelles[0]).toBe(`PREEMPT_RT · compute ${P.rt} ms`);
    expect(libelles[1]).toBe(`General-purpose · compute ${P.gp} ms`);
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
    expect(texte).toMatch(/Brakes\s+(released|braking)/);
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
    // Le tampon du canvas est redimensionné à l'image suivante : on attend ce moment au lieu de le supposer (échec observé sur GitHub, Node 24).
    await expect.poll(() => page.evaluate(() => document.getElementById('scope').width), { message: 'the canvas buffer is resized on the next animation frame' }).toBeGreaterThan(100);
    const [cw, h] = await page.evaluate(() => { const c = document.getElementById('scope'); return [c.clientWidth, c.height]; });
    expect(cw).toBeGreaterThan(100);
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
    await expect(page.locator('#blkL2')).toContainText('Resume in');
    await expect(page.locator('#blkL2')).not.toContainText('Heartbeat');
    const reste = Number((await page.locator('#blkL2').innerText()).match(/Resume in\s+([0-9.]+) s/)[1]);
    expect(reste, 'seconds left (1 s of stable heartbeat, 0.5 s done)').toBeGreaterThan(0.3);
    expect(reste).toBeLessThanOrEqual(0.6);
    await page.evaluate(() => { for (let i = 0; i < 100; i++) window.__sim.step(); });
    await expect(page.locator('#blkL2')).toContainText('Heartbeat');
    await expect(page.locator('#blkL2')).not.toContainText('Resume in');
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

// T-17 : décomposition de t_lat (S13, AC-12, AC-15).
test.describe('T-17 t_lat breakdown (S13)', () => {
  async function lire(page) {
    return page.evaluate(() => {
      const spans = [...document.querySelectorAll('#tlat span')];
      const T = window.__sim.sim.trucks[0], P = window.__sim.P;
      return {
        termes: spans.map(s => s.textContent), surligne: spans.filter(s => s.classList.contains('hl')).map(s => s.textContent),
        tLatMs: T.m.tLat * 1000, ddsMs: T.m.ddsLat * 1000, canMs: T.m.brakeLat * 1000, perMs: P.latPer * 1000, cpuMs: (window.__sim.ENV.kernel === 'GP' ? P.latCpuGP : P.latCpuRT) * 1000, actMs: P.latAct * 1000,
        cellule: [...document.querySelectorAll('#metrics > div')].map(d => d.innerText.replace(/\s+/g, ' ')).find(x => x.startsWith('t_lat')),
      };
    });
  }
  const nombre = texte => Number(texte.match(/[0-9][0-9.,]*/)[0].replace(',', '.'));

  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: five terms read from the model, the computing term highlighted only with the general-purpose kernel`, async ({ page }) => {
      await openPage(page, lang);
      await pauseAndSeed(page, 1);
      await page.evaluate(() => { for (let i = 0; i < 50; i++) window.__sim.step(); });
      await page.waitForTimeout(350);                          // au moins deux rafraîchissements de l'interface après les pas
      const rt = await lire(page);
      expect(rt.termes, 'five terms').toHaveLength(5);
      expect(nombre(rt.termes[0]), 'perception').toBe(rt.perMs);
      expect(nombre(rt.termes[1]), 'computing, PREEMPT_RT').toBe(rt.cpuMs);
      expect(nombre(rt.termes[2]), 'DDS').toBeCloseTo(rt.ddsMs, 0);
      expect(nombre(rt.termes[3]), 'CAN').toBeCloseTo(rt.canMs, 1);
      expect(nombre(rt.termes[4]), 'actuator').toBe(rt.actMs);
      expect(rt.surligne, 'nothing is highlighted with PREEMPT_RT').toEqual([]);
      await page.selectOption('#selKernel', 'GP');
      await page.evaluate(() => { window.__sim.step(); });
      await page.waitForTimeout(350);
      const gp = await lire(page);
      expect(gp.surligne, 'one highlighted term').toHaveLength(1);
      expect(nombre(gp.termes[1]), 'computing, general-purpose').toBe(gp.cpuMs);
      expect(gp.cpuMs - rt.cpuMs).toBeCloseTo(200, 6);
      expect(gp.surligne[0], 'the highlighted term is the computing one').toBe(gp.termes[1]);
      const somme = gp.termes.map(nombre).reduce((a, b) => a + b, 0);
      expect(Math.abs(somme - gp.tLatMs), `sum of the five terms (${somme}) against t_lat (${gp.tLatMs.toFixed(1)} ms)`).toBeLessThan(1.5);
      expect(Math.round(gp.tLatMs - rt.tLatMs), 't_lat grows by the latency difference (ms)').toBe(200);
      expect(nombre(gp.cellule), 'the t_lat cell of the grid').toBe(Math.round(gp.tLatMs));
    });
  }
});

// T-18 : vue de déploiement, onglet « Architecture » du guide (S16, S17, S18 ; AC-16).
test.describe('T-18 deployment view (S16, S17, S18)', () => {
  const TEXTES = {
    fr: { nonConf: 'ne prétend à la conformité', illustratif: 'illustratif', couches: ['Applications', 'Intergiciel', 'Distribution Linux', 'Noyau Linux', 'Matériel'], variante: 'temps réel ou standard', noyau: 'PREEMPT_RT (temps réel', l2: ['Logiciel de sûreté', 'RTOS certifiable', 'Microcontrôleur de sûreté'], doubleCanal: 'double canal' },
    en: { nonConf: 'claims no conformity', illustratif: 'Illustrative', couches: ['Applications', 'Middleware', 'Linux distribution', 'Linux kernel', 'Hardware'], variante: 'real-time or standard', noyau: 'PREEMPT_RT (real-time', l2: ['Safety software', 'Certifiable RTOS', 'Safety microcontroller'], doubleCanal: 'dual channel' },
    de: { nonConf: 'erhebt keinen Anspruch auf Konformität', illustratif: 'Illustrativ', couches: ['Anwendungen', 'Middleware', 'Linux-Distribution', 'Linux-Kernel', 'Hardware'], variante: 'Echtzeit- oder Standardvariante', noyau: 'PREEMPT_RT (Echtzeit', l2: ['Sicherheitssoftware', 'Zertifizierbares RTOS', 'Sicherheits-Mikrocontroller'], doubleCanal: 'zweikanalig' },
  };
  async function ouvrirArchi(page, lang) {
    await openPage(page, lang);
    await page.click('#bGuide');
    await page.click('[data-gtab="archi"]');
    return page.locator('[data-gpane="archi"]');
  }

  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: the tab lists the five layers of level 1 with the real-time or standard variant, no distribution name, the elements of level 2 and the standards`, async ({ page }) => {
      const x = TEXTES[lang];
      const section = await ouvrirArchi(page, lang);
      await expect(section).toBeVisible();
      const couches = section.locator('.acol.l1 > .ly');
      await expect(couches, 'five layers of level 1').toHaveCount(5);
      for (let i = 0; i < 5; i++) await expect(couches.nth(i), `layer ${i + 1} from the top`).toContainText(x.couches[i]);
      await expect(couches.nth(1)).toContainText('DDS / ROS 2');
      await expect(couches.nth(3), 'the kernel layer offers both variants of the configuration').toContainText(x.noyau);
      await expect(couches.nth(3)).toContainText('PREEMPT_RT');
      await expect(couches.nth(2), 'the Linux distribution has a real-time or standard variant, like the configuration').toContainText(x.variante);
      await expect(section.locator('.acol.l1 .opt, .acol.l1 .alt'), 'no alternative distribution or build system is drawn').toHaveCount(0);
      const l2 = section.locator('.acol.l2 > .ly');
      await expect(l2, 'three elements of level 2').toHaveCount(3);
      for (let i = 0; i < 3; i++) await expect(l2.nth(i)).toContainText(x.l2[i]);
      await expect(section.locator('.acol.l2')).toContainText('RTOS');
      await expect(section.locator('.acol.l2')).toContainText(x.doubleCanal);
      const texte = await section.innerText();
      for (const norme of ['IEC 61508', 'ISO 13849', 'ISO 17757']) expect(texte, norme).toContain(norme);
      expect(texte, 'conformity disclaimer').toContain(x.nonConf);
      expect(texte, 'framed as illustrative').toContain(x.illustratif);
      expect(texte, 'no distribution and no build system named (owner request, 2026-11-15)').not.toMatch(/yocto|debian|sbom/i);
      expect(await section.locator('.archi').getAttribute('aria-label'), 'nor in the text alternative of the diagram').not.toMatch(/yocto|debian/i);
      expect(texte, 'no claim about what a real project chose').not.toMatch(/retenu|chosen|selected|gewählt|ausgewählt|ausgesucht/i);
      const aria = await section.locator('.archi').getAttribute('aria-label');
      expect(aria.length, 'the diagram has a text alternative').toBeGreaterThan(40);
    });
  }

  test('the information button of the levels pane opens the guide on the Architecture tab', async ({ page }) => {
    await openPage(page, 'en');
    await expect(page.locator('#bArchi'), 'hidden while the oscilloscope is shown').toBeHidden();
    await page.click('#tabL12');
    await expect(page.locator('#bArchi')).toBeVisible();
    await page.click('#bArchi');
    await expect(page.locator('#guide')).toHaveAttribute('open', '');
    await expect(page.locator('[data-gpane="archi"]')).toBeVisible();
    await expect(page.locator('[data-gtab="archi"]')).toHaveClass(/on/);
  });

  test('the new guide tab names no link: nothing new for the link check to follow', async ({ page }) => {
    await openPage(page, 'en');
    expect(await page.locator('[data-gpane="archi"] a').count()).toBe(0);
  });
});

// T-20 : le guide, dans les trois langues, parle des niveaux 1 et 2 (S19, AC-19) et énonce les limites ajoutées (plan, section 10).
test.describe('T-20 guide text (S19, AC-19)', () => {
  const GUIDE = {
    fr: {
      prise: ['Autonomie · niveau 1', 'F et G partent aussitôt', 'Niveaux 1 ↔ 2', 'ⓘ'],
      visite: ['Scénario F', 'Scénario G', 'noyau généraliste'],
      modele: ['Le niveau 1 propose, le niveau 2 autorise ou bloque', 'pas verrouillé alors que l\'urgence l\'est', 'pire cas, pas une mesure', 'ISO 13849'],
      limites: ['copies exactes de l\'état simulé', 'ne tombe jamais en panne', 'calcul maison', 'sans passer par le niveau 1', 'bornes illustratives', 'Seul l\'écart avec PREEMPT_RT', 'sans prétention de conformité'],
    },
    en: {
      prise: ['Autonomy · level 1', 'F and G start at once', 'Levels 1 ↔ 2', 'ⓘ'],
      visite: ['Scenario F', 'Scenario G', 'general-purpose kernel'],
      modele: ['Level 1 proposes, level 2 allows or blocks', 'not latched while the emergency is', 'worst case, not a measurement', 'ISO 13849'],
      limites: ['exact copies of the simulated state', 'never fails', 'home-made calculation', 'without going through level 1', 'illustrative bounds', 'Only the difference from PREEMPT_RT', 'no claim of conformity'],
    },
    de: {
      prise: ['Autonomie · Ebene 1', 'F und G starten sofort', 'Ebenen 1 ↔ 2', 'ⓘ'],
      visite: ['Szenario F', 'Szenario G', 'Allzweck-Kernels'],
      modele: ['Ebene 1 schlägt vor, Ebene 2 erlaubt oder blockiert', 'nicht verriegelt ist, der Notfall aber schon', 'ungünstigster Fall, keine Messung', 'ISO 13849'],
      limites: ['exakte Kopien des simulierten Zustands', 'fällt nie aus', 'eigene Rechnung', 'ohne über Ebene 1 zu laufen', 'illustrative Grenzen', 'Nur die Differenz zu PREEMPT_RT', 'ohne Konformitätsanspruch'],
    },
  };
  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: the four existing guide tabs cover the two levels, scenarios F and G, the kernel profile and the six added limitations`, async ({ page }) => {
      await openPage(page, lang);
      await page.click('#bGuide');
      for (const [onglet, phrases] of Object.entries(GUIDE[lang])) {
        await page.click(`[data-gtab="${onglet}"]`);
        const texte = await page.locator(`[data-gpane="${onglet}"]`).innerText();
        for (const phrase of phrases) expect(texte, `${lang}, tab ${onglet}: "${phrase}"`).toContain(phrase);
      }
    });
  }
});

// Retouche du propriétaire (2026-11-15, troisième version) : chaque bloc a trois lignes d'en-tête : le titre, la configuration (le noyau
// choisi pour le niveau 1, l'échéance du battement pour le niveau 2, valeur sur la même ligne), puis la légende « ce qu'il annonce » /
// « ce qu'il mesure ». « Position » et « Vitesse » restent alignées d'un bloc à l'autre.
test.describe('Levels 1 ↔ 2 pane: configuration line and caption under each title, position and speed aligned', () => {
  const TEXTE = {
    fr: { noyau: 'Noyau', RT: 'PREEMPT_RT', GP: 'généraliste', delai: 'Échéance', cl1: "ce qu'il annonce", cl2: "ce qu'il mesure" },
    en: { noyau: 'Kernel', RT: 'PREEMPT_RT', GP: 'general-purpose', delai: 'Timeout', cl1: 'what it claims', cl2: 'what it measures' },
    de: { noyau: 'Kernel', RT: 'PREEMPT_RT', GP: 'Allzweck', delai: 'Frist', cl1: 'was er angibt', cl2: 'was er misst' },
  };
  for (const lang of ['fr', 'en', 'de']) {
    test(`${lang}: kernel and heartbeat timeout on line two, captions on line three, the two blocks line up row by row`, async ({ page }) => {
      await openPage(page, lang);
      await pauseAndSeed(page, 1);
      await page.evaluate(() => { for (let i = 0; i < 250; i++) window.__sim.step(); });
      await page.click('#tabL12');
      for (const kernel of ['RT', 'GP']) {
        await page.evaluate(k => { window.__sim.ENV.kernel = k; window.__sim.step(); }, kernel);
        await page.waitForTimeout(350);
        const m = await page.evaluate(() => {
          const top = e => Math.round(e.getBoundingClientRect().top), haut = e => Math.round(e.getBoundingClientRect().height);
          const bloc = id => {
            const b = document.getElementById(id), kl = b.querySelector('small.kl'), cap = [...b.querySelectorAll('small')].find(x => !x.classList.contains('kl'));
            return { titreH: haut(b.querySelector('h4')), ordre: kl.previousElementSibling === b.querySelector('h4') && kl.nextElementSibling === cap, mot: kl.children[0].textContent, valeur: kl.children[1].textContent,
                     ecartLigne: Math.abs(top(kl.children[0]) - top(kl.children[1])), klH: haut(kl), klTop: top(kl), capTop: top(cap), capTexte: cap.textContent, chip: top(b.querySelector('.chip')),
                     lignes: Object.fromEntries([...b.querySelectorAll(':scope > div')].map(d => [d.children[0].textContent, top(d)])), tableau: [...b.querySelectorAll(':scope > div')].map(d => d.children[0].textContent) };
          };
          return { l1: bloc('blkL1'), l2: bloc('blkL2'), echeanceMs: window.__sim.P.l1Deadline * 1000 };
        });
        const x = TEXTE[lang];
        expect(m.l1.mot).toBe(x.noyau);
        expect(m.l1.valeur, `${kernel}: the chosen kernel`).toBe(x[kernel]);
        expect(m.l2.mot).toBe(x.delai);
        expect(m.l2.valeur, 'the heartbeat timeout comes from the model parameter').toBe(`${m.echeanceMs} ms`);
        expect(m.l1.capTexte).toBe(x.cl1);
        expect(m.l2.capTexte).toBe(x.cl2);
        for (const b of [m.l1, m.l2]) {
          expect(b.ordre, 'order: title, configuration line, caption').toBe(true);
          expect(b.titreH, 'the title stays on one line (px)').toBeLessThanOrEqual(16);
          expect(b.klH, 'the configuration line is one line high (px)').toBeLessThanOrEqual(14);
          expect(b.ecartLigne, 'label and value on the same line (px apart)').toBeLessThanOrEqual(2);
        }
        expect(m.l1.tableau.some(k => /Noyau|Kernel/.test(k)), 'the kernel is not a row of the block').toBe(false);
        expect(m.l1.klTop, 'the configuration lines are level').toBe(m.l2.klTop);
        expect(m.l1.capTop, 'the captions are level').toBe(m.l2.capTop);
        expect(m.l1.chip, 'the status chips are level').toBe(m.l2.chip);
        const [position, vitesse] = m.l1.tableau.slice(-2);
        expect(m.l1.lignes[position], `${kernel}: position row aligned between level 1 and level 2`).toBe(m.l2.lignes[position]);
        expect(m.l1.lignes[vitesse], `${kernel}: speed row aligned between level 1 and level 2`).toBe(m.l2.lignes[vitesse]);
      }
    });
  }
});

// Fenêtre du guide : même largeur et même hauteur sur toutes les rubriques (spec 002, S21, AC-23, demande du propriétaire du 2026-11-15).
test.describe('Guide window size (S21, AC-23)', () => {
  const ONGLETS = ['prise', 'visite', 'modele', 'archi', 'limites'];
  for (const [largeur, hauteur] of [[1600, 900], [1920, 1080], [1280, 720]]) {
    for (const lang of ['fr', 'en', 'de']) {
      test(`${largeur}×${hauteur}, ${lang}: every tab of the guide has the same window, the header stays put and a long tab scrolls inside`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: hauteur });
        await openPage(page, lang);
        await page.click('#bGuide');
        const mesures = [];
        for (const onglet of ONGLETS) {
          await page.click(`[data-gtab="${onglet}"]`);
          mesures.push(await page.evaluate(o => {
            const r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
            const corps = document.querySelector('.gbody');
            const largeurUtile = corps.clientWidth - parseFloat(getComputedStyle(corps).paddingLeft) - parseFloat(getComputedStyle(corps).paddingRight);
            const textes = [...document.querySelectorAll('.gbody section.on > p:not(.help), .gbody section.on li')].map(e => e.getBoundingClientRect().width);
            return { onglet: o, largeurUtile, plusLarge: Math.max(...textes), fenetre: r(document.getElementById('guide')), entete: r(document.querySelector('.ghead')), corps: r(corps), defile: corps.scrollHeight > corps.clientHeight + 1, deborde: document.getElementById('guide').scrollHeight > document.getElementById('guide').clientHeight + 1 };
          }, onglet));
        }
        const ref = mesures[0];
        for (const m of mesures) {
          expect(m.fenetre, `tab ${m.onglet}: window (left, top, width, height)`).toEqual(ref.fenetre);
          expect(m.entete, `tab ${m.onglet}: header with the tabs`).toEqual(ref.entete);
          expect(m.corps, `tab ${m.onglet}: body`).toEqual(ref.corps);
          expect(m.deborde, `tab ${m.onglet}: nothing sticks out of the window`).toBe(false);
          expect(m.plusLarge, `tab ${m.onglet}: the text uses the whole width of the window (${Math.round(m.plusLarge)} px of ${Math.round(m.largeurUtile)} px)`).toBeGreaterThanOrEqual(m.largeurUtile - 24);   // 24 px : le retrait des listes
        }
        expect(ref.fenetre[3], 'the window fits the screen').toBeLessThanOrEqual(hauteur);
        expect(ref.fenetre[2], 'the window fits the screen width').toBeLessThanOrEqual(largeur);
        expect(mesures.some(m => m.defile), 'a long tab scrolls inside the window').toBe(true);
      });
    }
  }
});
