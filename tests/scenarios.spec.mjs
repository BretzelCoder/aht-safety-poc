// T-10 à T-13 : les scénarios intégrés produisent l'issue pédagogique annoncée (S6),
// et l'autorisation de mouvement n'est jamais dépassée (S7, quatrième point).
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { executer, trajet, SEUIL_ARRET, verifierAutorisation, basculerEnPeriodique } from './helpers/scenario.mjs';

const decrire = erreurs => erreurs.map(e => e.message).join('\n');
const codesDe = (rec, id, code) => rec.log.filter(e => e.id === id && e.code === code);
const sansArretDeSecurite = rec => Object.entries(rec.etats).flatMap(([id, etats]) =>
  etats.filter(e => e === 'CONTROLLED_STOP' || e === 'EMERGENCY_BRAKE').map(e => `${id}:${e}`));

test.describe('T-10 scenario A: pickup with V2X (S6)', () => {
  for (const graine of [1, 2, 3]) {
    test(`the FMS revokes the I1 token and the truck makes a planned stop (seed ${graine})`, async ({ page }) => {
      await openPage(page, 'fr');
      await pauseAndSeed(page, graine);
      const rec = await executer(page, { scenario: 'A', apresLancement: 45, pasTrace: 0.1 });

      expect(rec.lancement, 'scenario A: the pickup should be launched within 120 s').not.toBeNull();
      const { cible, vl, t: tLancement } = rec.lancement;

      // Le FMS retire le jeton I1 au camion visé, au profit du pick-up équipé.
      const retraits = codesDe(rec, 'FMS', 'TOKEN_REVOKED');
      expect(retraits, 'scenario A: the FMS should revoke the I1 token once').toHaveLength(1);
      expect(retraits[0].msg.p.i, 'scenario A: the revoked token is I1').toBe('I1');
      expect(retraits[0].msg.p.t, 'scenario A: the token is taken from the targeted truck').toBe(cible);
      expect(retraits[0].msg.p.lv, 'scenario A: the token is taken because of the pickup').toBe(vl);
      expect(codesDe(rec, 'FMS', 'TOKEN_GRANTED').some(e => e.msg.p.lv === vl), 'scenario A: the pickup is granted I1').toBe(true);
      const tRetrait = retraits[0].t;
      expect(tRetrait, 'scenario A: revocation comes after the launch').toBeGreaterThan(tLancement);

      // Arrêt planifié : le camion attend le jeton aux portes de l'intersection, puis s'arrête.
      const marche = trajet(rec, cible).filter(p => p.t > tRetrait);
      const attente = marche.filter(p => p.plan === 'plan.tokenHeld' && p.planP.includes(vl));
      expect(attente.length, 'scenario A: the truck should be shown waiting for the token held by the pickup').toBeGreaterThan(0);
      expect(Math.min(...attente.map(p => p.sEnd - p.s)), 'scenario A: the truck should reach the end of its authority (under 5 m)').toBeLessThan(5);
      const vMin = Math.min(...marche.map(p => p.v));
      expect(vMin, `scenario A: the truck should stop (under ${SEUIL_ARRET} m/s), lowest speed seen ${vMin.toFixed(2)} m/s`).toBeLessThan(SEUIL_ARRET);

      // Une fois le pick-up passé, le jeton est libéré et le camion repart.
      const liberations = codesDe(rec, 'FMS', 'TOKEN_RELEASED');
      expect(liberations.length, 'scenario A: the pickup should release I1 once through').toBeGreaterThan(0);
      expect(marche[marche.length - 1].v, 'scenario A: the truck should be moving again at the end').toBeGreaterThan(5);

      // Pas de collision, pas d'arrêt de sécurité : c'est un arrêt planifié, pas une réaction d'urgence.
      expect(rec.collisions, 'scenario A: no collision').toBe(0);
      expect(sansArretDeSecurite(rec), 'scenario A: no controlled stop and no emergency brake, the stop is planned').toEqual([]);
      const erreurs = verifierAutorisation(rec, 'scenario A');
      expect(erreurs, decrire(erreurs)).toEqual([]);
    });
  }
});

// Six graines au total : la graine fixe (1) et cinq autres (risque 1 du plan).
const GRAINES = [1, 2, 3, 4, 5, 6];

test.describe('T-11 scenario B: pickup without V2X (S6)', () => {
  for (const graine of GRAINES) {
    test(`only on-board perception protects: the truck slows and no collision (seed ${graine})`, async ({ page }) => {
      await openPage(page, 'fr');
      await pauseAndSeed(page, graine);
      const rec = await executer(page, { scenario: 'B', apresLancement: 45, pasTrace: 0.1 });

      expect(rec.lancement, 'scenario B: the pickup should be launched within 120 s').not.toBeNull();
      const { cible, vl } = rec.lancement;

      // Invisible du FMS : aucun jeton n'est retiré ni attribué au pick-up.
      expect(codesDe(rec, 'FMS', 'TOKEN_REVOKED'), 'scenario B: the FMS does not see the pickup, no token revoked').toEqual([]);
      expect(codesDe(rec, 'FMS', 'TOKEN_GRANTED').filter(e => e.msg.p.lv === vl), 'scenario B: no token granted to the pickup').toEqual([]);

      // La perception embarquée le voit : zone de précaution ou intrusion dans la bulle, citant le pick-up.
      const alertes = rec.log.filter(e => e.id === cible && (e.code === 'CAUTION_ZONE' || e.code === 'SIL_BUBBLE_INTRUSION') && e.msg.p && e.msg.p.id === vl);
      expect(alertes.length, 'scenario B: the targeted truck should report the pickup in its caution zone or stop bubble').toBeGreaterThan(0);

      // Le camion ralentit assez tôt : sa vitesse baisse d'au moins 5 km/h dans les 5 s qui suivent l'alerte.
      const tAlerte = alertes[0].t;
      const marche = trajet(rec, cible);
      const avant = [...marche].reverse().find(p => p.t <= tAlerte);
      const apres = marche.filter(p => p.t >= tAlerte && p.t <= tAlerte + 5);
      const baisse = avant.v - Math.min(...apres.map(p => p.v));
      expect(baisse * 3.6, `scenario B: the truck should slow by at least 5 km/h within 5 s of the alert, slowed by ${(baisse * 3.6).toFixed(1)} km/h`).toBeGreaterThan(5);

      expect(rec.etats[cible], 'scenario B: the supervisor reacts').toContain('DEGRADED_SPEED');
      expect(rec.collisions, 'scenario B: no collision').toBe(0);
      expect(Object.values(rec.etats).flat(), 'scenario B: no emergency brake').not.toContain('EMERGENCY_BRAKE');
      const erreurs = verifierAutorisation(rec, 'scenario B');
      expect(erreurs, decrire(erreurs)).toEqual([]);
    });
  }
});

test.describe('T-11 scenario C: pickup without V2X inside a dust cloud (S6)', () => {
  const VITESSE_DEGRADEE = 15 / 3.6; // 15 km/h : P.vDeg dans le modèle

  for (const graine of GRAINES) {
    test(`LiDAR blinded, radar fallback at 15 km/h or less, mission continues, no collision (seed ${graine})`, async ({ page }) => {
      await openPage(page, 'fr');
      await pauseAndSeed(page, graine);
      const rec = await executer(page, { scenario: 'C', apresLancement: 45, pasTrace: 0.1 });

      expect(rec.lancement, 'scenario C: the pickup should be launched within 120 s').not.toBeNull();
      const { cible } = rec.lancement;

      // Le LiDAR est aveuglé par la poussière : code défaut et message dédiés, côté camion visé.
      const poussiere = codesDe(rec, cible, 'DM1_LIDAR_DUST');
      expect(poussiere.length, 'scenario C: the LiDAR should be reported blinded by dust').toBeGreaterThan(0);
      expect(poussiere[0].msg.k, 'scenario C: the dust message').toBe('sup.lidarDust');
      // Repli radar : la perception n'est pas perdue et le radar n'est pas en panne.
      expect(codesDe(rec, cible, 'DM1_PERCEPTION_LOST'), 'scenario C: the radar takes over, perception is not lost').toEqual([]);
      expect(codesDe(rec, cible, 'DM1_RADAR_FAULT'), 'scenario C: the radar is working').toEqual([]);
      expect(rec.etats[cible], 'scenario C: degraded speed').toContain('DEGRADED_SPEED');

      // Vitesse réduite à 15 km/h au plus, une fois la décélération faite (8 s), et la mission continue (> 10 km/h).
      const tDebut = poussiere[0].t;
      const stabilises = trajet(rec, cible).filter(p => p.t >= tDebut + 8 && p.etat === 'DEGRADED_SPEED');
      expect(stabilises.length, 'scenario C: the truck should stay degraded long enough to be measured').toBeGreaterThan(20);
      const vmax = Math.max(...stabilises.map(p => p.v)), vmin = Math.min(...stabilises.map(p => p.v));
      expect(vmax * 3.6, `scenario C: speed should be at most 15 km/h while blinded, highest ${(vmax * 3.6).toFixed(1)} km/h`).toBeLessThanOrEqual(VITESSE_DEGRADEE * 3.6 + 0.2);
      expect(vmin * 3.6, `scenario C: the mission continues, lowest speed ${(vmin * 3.6).toFixed(1)} km/h`).toBeGreaterThan(10);

      expect(rec.collisions, 'scenario C: no collision').toBe(0);
      expect(Object.values(rec.etats).flat(), 'scenario C: no emergency brake').not.toContain('EMERGENCY_BRAKE');
      const erreurs = verifierAutorisation(rec, 'scenario C');
      expect(erreurs, decrire(erreurs)).toEqual([]);
    });
  }
});

test.describe('T-12 scenario D: stop order sent once in BEST_EFFORT with losses (S6)', () => {
  const NIVEAU = { NOMINAL: 0, DEGRADED_SPEED: 1, CONTROLLED_STOP: 2, EMERGENCY_BRAKE: 3 };
  // Le code des crochets pilote le camion visé : le scénario D ne fixe que le mode et le taux de perte de départ.
  const regler = (mode, perte) => `const T = S.sim.trucks.find(x => x.id === L.cible); T.dds.mode = '${mode}'; T.dds.loss = ${perte};`;

  test('the scenario arms the targeted truck in BEST_EFFORT with 50 % packet loss', async ({ page }) => {
    await openPage(page, 'fr');
    await pauseAndSeed(page, 1);
    const rec = await executer(page, {
      scenario: 'D', apresLancement: 1,
      sondeLancement: 'const T = S.sim.trucks.find(x => x.id === L.cible); return { mode: T.dds.mode, perte: T.dds.loss };',
    });
    expect(rec.sonde, 'scenario D: BEST_EFFORT with 50 % loss').toEqual({ mode: 'EVENT_BE', perte: 0.5 });
  });

  for (const graine of [1, 2]) {
    test(`outcome 1, order lost (BEST_EFFORT, losses forced to 100 %): ORDER_NOT_APPLIED is reported (seed ${graine})`, async ({ page }) => {
      await openPage(page, 'fr');
      await pauseAndSeed(page, graine);
      const rec = await executer(page, { scenario: 'D', apresLancement: 45, pasTrace: 0.1, auLancement: regler('EVENT_BE', 1) });
      const { cible } = rec.lancement;

      expect(codesDe(rec, cible, 'DDS_SAMPLE_LOST').length, 'scenario D: a lost BEST_EFFORT sample is logged').toBeGreaterThan(0);
      const ecarts = codesDe(rec, cible, 'ORDER_NOT_APPLIED');
      expect(ecarts.length, 'scenario D: the log should report ORDER_NOT_APPLIED when the order is lost').toBeGreaterThan(0);
      expect(ecarts[0].msg.k, 'scenario D: the mismatch message').toBe('log.mismatch');
      expect(NIVEAU[ecarts[0].msg.p.sup], 'scenario D: the supervisor is ahead of the controller').toBeGreaterThan(NIVEAU[ecarts[0].msg.p.mc]);

      const marche = trajet(rec, cible);
      expect(marche.filter(p => NIVEAU[p.etat] > NIVEAU[p.applique]).length, 'scenario D: the order stays unapplied for at least 1 s').toBeGreaterThan(10);
      expect(rec.etats[cible], 'scenario D: the supervisor did order a stop').toContain('CONTROLLED_STOP');
      expect(marche.filter(p => p.applique === 'CONTROLLED_STOP' || p.applique === 'EMERGENCY_BRAKE'), 'scenario D: the stop never reaches the controller').toEqual([]);
      const erreurs = verifierAutorisation(rec, 'scenario D');
      expect(erreurs, decrire(erreurs)).toEqual([]);
    });
  }

  // Revue de la spec 001, écart 2 : le sélecteur « Motif de publication » remet à zéro l'émission et la réception de
  // l'ordre (T.mc.lastSent, T.mc.rxTime). En BEST_EFFORT rien n'est reçu tant que l'état ne change pas : sans cette
  // remise à zéro, passer en périodique après un long silence lèverait aussitôt une fausse alarme Liveliness.
  test('switching to periodic publishing with the selector after a long quiet spell raises no false alarm', async ({ page }) => {
    await openPage(page, 'fr');
    await pauseAndSeed(page, 1);
    const choisir = mode => `const sel = document.getElementById('selDds'); sel.value = '${mode}'; sel.dispatchEvent(new Event('change'));`;
    const rec = await executer(page, {
      duree: 20, pasTrace: 0.1,
      evenements: [{ t: 1, js: choisir('EVENT_BE') }, { t: 12, js: choisir('PERIODIC') }],
    });
    // Le camion sélectionné au départ est AHT-01. Entre 1 s et 12 s, BEST_EFFORT ne lui livre plus rien : son dernier ordre a plus de 10 s.
    const t0 = rec.evenementsJoues.find(e => e.js.includes('PERIODIC')).t;
    const alarmes = rec.log.filter(e => e.id === 'AHT-01' && e.t >= t0 && (e.code === 'DDS_LIVELINESS_LOST' || e.code === 'DDS_DEADLINE_MISSED'));
    expect(alarmes.map(e => `${e.t.toFixed(2)} ${e.code}`), 'switching to periodic with nothing lost must not report a silence').toEqual([]);
  });

  // Les deux taux : celui du scénario (50 %, tirage au sort, plusieurs graines) et la perte totale.
  for (const [perte, graines] of [[0.5, [1, 2, 3]], [1, [1]]]) {
    for (const graine of graines) {
      test(`outcome 2, periodic publishing with ${perte * 100} % loss: the controller reaches the stop state with no silent loss (seed ${graine})`, async ({ page }) => {
        await openPage(page, 'fr');
        await pauseAndSeed(page, graine);
        const rec = await executer(page, { scenario: 'D', apresLancement: 45, pasTrace: 0.1, auLancement: basculerEnPeriodique(perte) });
        const { cible } = rec.lancement;

        expect(codesDe(rec, cible, 'ORDER_NOT_APPLIED'), 'scenario D: no silent loss in periodic mode').toEqual([]);
        const silence = codesDe(rec, cible, 'DDS_LIVELINESS_LOST').length + codesDe(rec, cible, 'DDS_DEADLINE_MISSED').length;
        expect(silence, 'scenario D: the controller detects the silence (Deadline or Liveliness)').toBeGreaterThan(0);

        const marche = trajet(rec, cible);
        expect(marche.filter(p => p.applique === 'CONTROLLED_STOP').length, 'scenario D: the controller applies the stop state').toBeGreaterThan(5);
        const apres = marche.filter(p => p.t > rec.lancement.t + 20);
        expect(Math.min(...apres.map(p => p.v)), 'scenario D: the truck comes to a stop').toBeLessThan(SEUIL_ARRET);
        expect(rec.collisions, 'scenario D: no collision').toBe(0);
        const erreurs = verifierAutorisation(rec, 'scenario D');
        expect(erreurs, decrire(erreurs)).toEqual([]);
      });
    }
  }
});

test.describe('T-13 scenario E: saturated CAN bus, brake command mis-prioritised (S6)', () => {
  const CAMION = 'AHT-01'; // le scénario E s'applique au tombereau sélectionné : le premier après pauseAndSeed
  const regler = charge => ({ t: 0, js: `S.sim.trucks[0].can.load = ${charge};` });

  test('at 75 % load the brake deadline is missed and the truck makes a controlled stop, without watchdog', async ({ page }) => {
    await openPage(page, 'fr');
    await pauseAndSeed(page, 1);
    const rec = await executer(page, { scenario: 'E', duree: 20, pasTrace: 0.1 });

    const retards = codesDe(rec, CAMION, 'CAN_BRAKE_DEADLINE');
    expect(retards.length, 'scenario E: the brake deadline is missed at 75 % load').toBeGreaterThan(0);
    expect(retards[0].msg.k, 'scenario E: the deadline message').toBe('sup.canDeadline');
    expect(retards[0].msg.p.ms.n, 'scenario E: the brake command latency exceeds the 40 ms deadline').toBeGreaterThan(40);
    const etats = codesDe(rec, CAMION, 'STATE').map(e => e.msg.raw);
    expect(etats.some(s => s.includes('CONTROLLED_STOP') && s.includes('CAN_BRAKE_DEADLINE')), 'scenario E: the supervisor goes to CONTROLLED_STOP because of the deadline').toBe(true);
    expect(rec.etats[CAMION], 'scenario E: controlled stop').toContain('CONTROLLED_STOP');

    expect(codesDe(rec, CAMION, 'DM1_BRAKE_CMD_TIMEOUT'), 'scenario E: no watchdog trip at 75 %').toEqual([]);
    expect(rec.etats[CAMION], 'scenario E: no emergency brake at 75 %').not.toContain('EMERGENCY_BRAKE');
    expect(Math.min(...trajet(rec, CAMION).map(p => p.v)), 'scenario E: the truck comes to a stop').toBeLessThan(SEUIL_ARRET);
    expect(rec.collisions, 'scenario E: no collision').toBe(0);
    const erreurs = verifierAutorisation(rec, 'scenario E');
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('pushing the load to 90 % trips the brake ECU watchdog and the truck goes to emergency braking', async ({ page }) => {
    await openPage(page, 'fr');
    await pauseAndSeed(page, 1);
    const rec = await executer(page, { scenario: 'E', duree: 20, pasTrace: 0.1, evenements: [{ t: 10, js: 'S.sim.trucks[0].can.load = 90;' }] });

    const retard = codesDe(rec, CAMION, 'CAN_BRAKE_DEADLINE');
    const watchdog = codesDe(rec, CAMION, 'DM1_BRAKE_CMD_TIMEOUT');
    expect(watchdog.length, 'scenario E: the brake ECU watchdog trips at 90 %').toBeGreaterThan(0);
    expect(watchdog[0].msg.k, 'scenario E: the watchdog message').toBe('log.watchdog');
    expect(retard[0].t, 'scenario E: the deadline is missed before the watchdog trips').toBeLessThan(watchdog[0].t);
    expect(watchdog[0].t, 'scenario E: the watchdog trips only once the load is raised').toBeGreaterThanOrEqual(10);
    expect(rec.etats[CAMION], 'scenario E: emergency braking').toContain('EMERGENCY_BRAKE');
    const apres = trajet(rec, CAMION).filter(p => p.t > watchdog[0].t + 1);
    expect(apres.every(p => p.etat === 'EMERGENCY_BRAKE' && p.applique === 'EMERGENCY_BRAKE'), 'scenario E: emergency braking is latched and applied').toBe(true);
    expect(rec.collisions, 'scenario E: no collision').toBe(0);
  });

  // Bornes mesurées le 2026-11-15 (plan 001) : le délai de la consigne frein mal priorisée dépasse
  // 40 ms à partir de 67 % de charge, et 100 ms (watchdog) à partir de 84 %. Dès que le watchdog se déclenche,
  // le superviseur ne journalise plus que son code (DM1_BRAKE_CMD_TIMEOUT) et plus celui de l'échéance :
  // à 84 %, "deadline code" vaut donc faux alors que l'échéance est évidemment dépassée.
  for (const [charge, codeEcheance, watchdog] of [[66, false, false], [67, true, false], [83, true, false], [84, false, true]]) {
    test(`pinned boundary: at ${charge} % load the deadline code is ${codeEcheance ? 'logged' : 'absent'} and the watchdog ${watchdog ? 'trips' : 'holds'}`, async ({ page }) => {
      await openPage(page, 'fr');
      await pauseAndSeed(page, 1);
      const rec = await executer(page, { scenario: 'E', duree: 3, evenements: [regler(charge)] });

      expect(codesDe(rec, CAMION, 'CAN_BRAKE_DEADLINE').length > 0, `scenario E: deadline code logged at ${charge} % load`).toBe(codeEcheance);
      expect(codesDe(rec, CAMION, 'DM1_BRAKE_CMD_TIMEOUT').length > 0, `scenario E: watchdog tripped at ${charge} % load`).toBe(watchdog);
      expect(rec.etats[CAMION].includes('EMERGENCY_BRAKE'), `scenario E: emergency brake at ${charge} % load`).toBe(watchdog);
    });
  }
});