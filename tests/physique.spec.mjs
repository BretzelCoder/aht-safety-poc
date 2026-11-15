// T-09 : invariants physiques du modèle (S7, trois premiers points).
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed, stepSeconds } from './helpers/page.mjs';
import { mesurerPhysique, verifierPhysique } from './helpers/physique.mjs';

const decrire = erreurs => erreurs.map(e => e.message).join('\n');

async function preparer(page) {
  await openPage(page, 'fr');
  await pauseAndSeed(page, 1);
  await stepSeconds(page, 1); // la latence du tombereau est calculée au premier pas
}

test.describe('T-09 physics invariants (S7)', () => {
  test('the model respects the three mass and road invariants', async ({ page }) => {
    await preparer(page);
    const m = await mesurerPhysique(page);
    console.log(`stopping distances at 40 km/h (tLat ${m.tLat.toFixed(3)} s): empty flat ${m.videPlat.toFixed(1)} m, loaded downhill ${m.chargeDescente.toFixed(1)} m; watered: empty ${m.videSec.toFixed(1)} -> ${m.videArrose.toFixed(1)} m, loaded ${m.chargeSec.toFixed(1)} -> ${m.chargeArrose.toFixed(1)} m`);
    const erreurs = verifierPhysique(m);
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('breaking the brake force on purpose (much stronger) is detected: loaded is no longer limited by capacity', async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { window.__sim.P.Fbrake = 5e6; });
    const erreurs = verifierPhysique(await mesurerPhysique(page));
    expect(erreurs.length).toBeGreaterThan(0);
    expect(decrire(erreurs)).toContain('loaded (400 t) should be limited by brake capacity');
  });

  test('breaking the brake force on purpose (much weaker) is detected: empty is no longer limited by adhesion', async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { window.__sim.P.Fbrake = 2e5; });
    const erreurs = verifierPhysique(await mesurerPhysique(page));
    expect(decrire(erreurs)).toContain('empty (160 t) should be limited by adhesion');
  });

  test('breaking the adhesion effect on purpose is detected: a watered road no longer lengthens the empty distance', async ({ page }) => {
    await preparer(page);
    // Les deux limites deviennent insensibles à l'adhérence : la fonction du modèle est remplacée par une version sans μ.
    await page.evaluate(() => {
      const origine = window.__sim.brakeEnvelope;
      window.__sim.brakeEnvelope = (m, g, mu) => origine(m, g, 0.6);
    });
    const erreurs = verifierPhysique(await mesurerPhysique(page));
    expect(decrire(erreurs)).toContain('watered road should lengthen the empty stopping distance');
  });
});
