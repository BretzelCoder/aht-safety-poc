// T-14 : invariants de la simulation (S7, deux derniers points) : coupure du réseau mine, verrouillage de l'urgence.
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed, stepSeconds } from './helpers/page.mjs';
import { executer, trajet, SEUIL_ARRET, verifierAutorisation } from './helpers/scenario.mjs';

const decrire = erreurs => erreurs.map(e => e.message).join('\n');
const etatDuCamion0 = page => page.evaluate(() => {
  const T = window.__sim.sim.trucks[0];
  return { etat: T.state, applique: T.mc.applied, v: T.v, verrou: T.latched, panne: T.faults.estop };
});

test.describe('T-14 network cut (S7)', () => {
  test('after the mine network is cut, every truck stops within its authority, without emergency braking', async ({ page }) => {
    await openPage(page, 'fr');
    await pauseAndSeed(page, 1);
    // Le réseau est coupé à t = 5 s (camions en marche) ; on observe 60 s de plus. ENV.fms est ce que fait le bouton « Couper le réseau mine ».
    const rec = await executer(page, { duree: 65, pasTrace: 0.1, evenements: [{ t: 5, js: 'S.ENV.fms = false; window.__autorisationALaCoupure = Object.fromEntries(S.sim.trucks.map(T => [T.id, T.auth.sEnd]));' }] });

    const grantedAtCut = await page.evaluate(() => window.__autorisationALaCoupure);
    for (const id of ['AHT-01', 'AHT-02', 'AHT-03']) {
      const liens = rec.log.filter(e => e.id === id && e.code === 'FMS_LINK_LOST');
      expect(liens.length, `${id}: the loss of the FMS link is reported`).toBeGreaterThan(0);
      expect(liens[0].t, `${id}: reported only after the lease expired (2 s after the cut)`).toBeGreaterThan(5 + 2);
      expect(rec.etats[id], `${id}: never emergency braking, the stop is planned`).not.toContain('EMERGENCY_BRAKE');
      expect(trajet(rec, id).some(p => p.applique === 'EMERGENCY_BRAKE'), `${id}: emergency braking is never applied`).toBe(false);

      const fin = trajet(rec, id).at(-1);
      expect(fin.v, `${id}: the truck has stopped, speed ${fin.v.toFixed(2)} m/s`).toBeLessThan(SEUIL_ARRET);
      // L'autorisation « déjà accordée » est celle relevée à l'instant même de la coupure, pas celle de la fin : sinon une
      // autorisation qui continuerait de s'étendre sans le FMS rendrait la phrase toujours vraie (revue de la spec 001, écart 3).
      const accordee = grantedAtCut[id];
      expect(fin.sEnd, `${id}: no new authority is granted once the network is cut`).toBeLessThanOrEqual(accordee + 0.01);
      expect(accordee - fin.s, `${id}: the truck stopped inside the authority it had been granted at the cut`).toBeGreaterThanOrEqual(0);
    }
    expect(rec.collisions, 'no collision').toBe(0);
    const erreurs = verifierAutorisation(rec, 'network cut');
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });
});

test.describe('T-14 emergency latch (S7)', () => {
  test('the emergency state stays latched when the fault is removed, until "Re-arm" is clicked', async ({ page }) => {
    await openPage(page, 'fr');
    await pauseAndSeed(page, 1);
    await stepSeconds(page, 5);
    expect((await etatDuCamion0(page)).v, 'the truck is moving before the emergency stop').toBeGreaterThan(5);

    // Arrêt d'urgence distant : bouton de la page (bascule), le camion sélectionné est AHT-01.
    await page.click('[data-fault="estop"]');
    await stepSeconds(page, 1);
    let s = await etatDuCamion0(page);
    expect(s.etat, 'the remote emergency stop puts the truck in EMERGENCY_BRAKE').toBe('EMERGENCY_BRAKE');
    expect(s.panne).toBe(true);
    await stepSeconds(page, 12);
    expect((await etatDuCamion0(page)).v, 'the truck comes to a stop').toBeLessThan(SEUIL_ARRET);

    // On retire la cause (même bouton) : l'état d'urgence reste verrouillé, le camion ne repart pas.
    await page.click('[data-fault="estop"]');
    await stepSeconds(page, 5);
    s = await etatDuCamion0(page);
    expect(s.panne, 'the fault itself is removed').toBe(false);
    expect(s.etat, 'the emergency state stays latched after the fault is removed').toBe('EMERGENCY_BRAKE');
    expect(s.applique, 'and it stays applied by the controller').toBe('EMERGENCY_BRAKE');
    expect(s.verrou, 'the latch flag is set').toBe(true);
    expect(s.v, 'the truck does not move off by itself').toBeLessThan(SEUIL_ARRET);

    // Réarmement explicite : le verrou est levé, l'état d'urgence est quitté et le camion repart.
    await page.click('#bAck');
    await stepSeconds(page, 3);
    s = await etatDuCamion0(page);
    expect(s.etat, 'after "Re-arm" the truck leaves the emergency state').not.toBe('EMERGENCY_BRAKE');
    expect(s.verrou, 'the latch flag is cleared').toBe(false);
    await stepSeconds(page, 10);
    expect((await etatDuCamion0(page)).v, 'the truck moves off again after the acknowledgement').toBeGreaterThan(1);
  });
});

// Revue de la spec 001, écart 3 : « un camion ne dépasse jamais son autorisation » (S7) n'avait aucune preuve qu'elle
// pouvait échouer. Le contrôle (verifierAutorisation) et l'enregistreur de l'exécuteur sont mis à l'épreuve ici.
test.describe('T-22 movement authority check can fail (S7)', () => {
  test('a record that went beyond the authority is reported with the truck and the distance', () => {
    const erreurs = verifierAutorisation({ depassement: 3.2, depassementPar: 'AHT-02' }, 'test');
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('AHT-02');
    expect(erreurs[0].message).toContain('3.2 m beyond its movement authority');
  });

  test('a record that stayed inside, or exactly at the end of, the authority is not reported', () => {
    expect(verifierAutorisation({ depassement: -1.9, depassementPar: 'AHT-01' }, 'test')).toEqual([]);
    expect(verifierAutorisation({ depassement: 0, depassementPar: 'AHT-01' }, 'test')).toEqual([]);
    expect(verifierAutorisation({ depassement: -Infinity, depassementPar: null }, 'test')).toEqual([]);
  });

  test('the recorder of the scenario runner sees a truck pushed past its authority', async ({ page }) => {
    await openPage(page, 'fr');
    await pauseAndSeed(page, 1);
    // Le camion 0 est replacé 5 m au-delà de la fin de son autorisation, à t = 3 s : l'enregistreur doit le voir.
    const rec = await executer(page, { duree: 6, evenements: [{ t: 3, js: 'const T = S.sim.trucks[0]; T.auth.sEnd = T.s - 5;' }] });
    const erreurs = verifierAutorisation(rec, 'injected overrun');
    expect(erreurs.length, 'the injected overrun must be reported').toBeGreaterThan(0);
    expect(erreurs[0].message).toContain('AHT-01');
  });
});
