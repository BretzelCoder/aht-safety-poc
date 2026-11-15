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
