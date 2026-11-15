// T-10 à T-13 : les scénarios intégrés produisent l'issue pédagogique annoncée (S6),
// et l'autorisation de mouvement n'est jamais dépassée (S7, quatrième point).
import { test, expect } from '@playwright/test';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { executer, trajet, SEUIL_ARRET, verifierAutorisation } from './helpers/scenario.mjs';

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