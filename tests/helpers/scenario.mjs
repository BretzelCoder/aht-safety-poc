// Exécuteur de scénarios (spec 001, T-10) : rejoue un scénario dans la page, pas à pas, et rend
// tout ce qu'il faut pour vérifier l'issue sans dépendre du hasard ni de l'animation.
import { PAS } from './page.mjs';

/**
 * Joue un scénario dans la page déjà mise en pause et réinitialisée (pauseAndSeed).
 *
 * options :
 *  - scenario : code du scénario (« A » à « E ») ; absent = rien n'est lancé.
 *  - apresLancement : secondes simulées à jouer après le lancement du véhicule (scénarios A à D).
 *  - duree : secondes simulées à jouer depuis le début (scénario E, ou toute séquence sans lancement).
 *  - limiteLancement : attente maximale du lancement, en secondes simulées.
 *  - auLancement : code JavaScript exécuté dès que le véhicule est lancé (S = window.__sim, L = infos de lancement).
 *  - sondeLancement : code JavaScript qui lit l'état de la page au lancement, avant `auLancement` ; sa valeur
 *    de retour (`return …`) est rendue dans `rec.sonde`.
 *  - evenements : [{ t, js }] code exécuté à t secondes simulées après le début de l'exécution (mêmes variables S et L).
 *  - rendre : redessine l'interface toutes les `rendre` secondes simulées, pour que les textes traduits à
 *    l'affichage soient réellement produits (vérification des traductions à l'exécution).
 *  - pasTrace : intervalle d'échantillonnage de la trace, en secondes simulées (0,5 par défaut). Un arrêt peut durer
 *    moins d'une seconde : pour le voir, échantillonner plus fin (0,1).
 *
 * Rend : lancement { t, cible, vl } ou null, journal complet, collisions, plus grand dépassement
 * de l'autorisation de mouvement, états vus par tombereau, et une trace échantillonnée toutes les 0,5 s.
 */
export async function executer(page, options) {
  return page.evaluate(({ o, dt }) => {
    const S = window.__sim;
    // Le code des crochets voit S (window.__sim) et L (infos de lancement : { t, cible, vl } ou null).
    const aller = (js, L) => new Function('S', 'L', js)(S, L);
    const rec = { lancement: null, depassement: -Infinity, depassementPar: null, etats: {}, trace: [], evenementsJoues: [] };
    const t0 = S.sim.t;
    const restants = [...(o.evenements ?? [])].sort((a, b) => a.t - b.t);
    if (o.scenario) S.scenario(o.scenario);

    const limite = o.duree ?? (o.limiteLancement ?? 120) + (o.apresLancement ?? 0);
    let n = 0, prochainRendu = 0;
    for (;;) {
      const s = S.sim;
      const ecoule = s.t - t0;
      // Rendu de l'interface (journal, alertes, puces) : les messages ne sont traduits qu'à l'affichage.
      // setLang avec la langue courante redessine tout sans rien changer à la simulation.
      if (o.rendre && ecoule >= prochainRendu) { S.setLang(document.documentElement.lang); prochainRendu += o.rendre; }
      while (restants.length && ecoule >= restants[0].t) { const e = restants.shift(); aller(e.js, rec.lancement); rec.evenementsJoues.push({ t: s.t, js: e.js }); }
      if (!rec.lancement) {
        const l = s.log.find(e => e.code === 'SCENARIO' && e.t >= t0);
        if (l) {
          rec.lancement = { t: l.t, cible: l.msg.p.t, vl: l.msg.p.lv };
          if (o.sondeLancement) rec.sonde = aller(o.sondeLancement, rec.lancement);
          if (o.auLancement) aller(o.auLancement, rec.lancement);
        }
      }
      const fini = o.duree !== undefined
        ? ecoule >= o.duree
        : rec.lancement ? s.t - rec.lancement.t >= o.apresLancement : ecoule >= (o.limiteLancement ?? 120);
      if (fini || ecoule > limite + 1) break;

      S.step(); n++;
      const apres = S.sim;
      for (const T of apres.trucks) {
        const d = T.s - T.auth.sEnd;
        if (d > rec.depassement) { rec.depassement = d; rec.depassementPar = T.id; }
        (rec.etats[T.id] ??= new Set()).add(T.state);
      }
      if (n % Math.round((o.pasTrace ?? 0.5) / dt) === 0) {
        rec.trace.push({
          t: apres.t,
          camions: apres.trucks.map(T => ({ id: T.id, s: T.s, sEnd: T.auth.sEnd, v: T.v, etat: T.state, applique: T.mc.applied, plan: T.planTag && T.planTag.k, planP: T.planTag && T.planTag.p ? JSON.stringify(T.planTag.p) : null })),
        });
      }
    }
    const fin = S.sim;
    rec.collisions = fin.collisions;
    rec.fin = fin.t;
    rec.log = fin.log.map(e => ({ t: e.t, id: e.id, lvl: e.lvl, code: e.code, msg: e.msg }));
    rec.etats = Object.fromEntries(Object.entries(rec.etats).map(([k, v]) => [k, [...v]]));
    return rec;
  }, { o: options, dt: PAS });
}

/** Codes du journal, dans l'ordre, sans doublons consécutifs : lecture rapide d'une exécution. */
export function codes(rec) {
  return rec.log.map(e => `${e.id}:${e.code}`);
}

/** Trace d'un camion : [{ t, id, s, sEnd, v, etat, applique, plan, planP }], dans l'ordre du temps. */
export function trajet(rec, id) {
  return rec.trace.map(p => ({ t: p.t, ...p.camions.find(c => c.id === id) }));
}

/** Seuil de vitesse (m/s) sous lequel le modèle lui-même considère un camion « à l'arrêt ». */
export const SEUIL_ARRET = 0.3;

/**
 * Invariant d'autorisation de mouvement (S7, quatrième point) : à aucun pas de l'exécution
 * un camion n'a dépassé la fin de son autorisation. Rend la liste des violations.
 */
export function verifierAutorisation(rec, nom) {
  return rec.depassement > 0
    ? [{ message: `${nom}: ${rec.depassementPar} went ${rec.depassement.toFixed(1)} m beyond its movement authority` }]
    : [];
}