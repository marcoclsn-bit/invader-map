/**
 * utils/huntSpill.js : faut-il proposer d'étendre la chasse aux arrondissements
 * voisins ?
 *
 * Le réglage n'est PAS offert en amont : l'utilisateur ne peut pas savoir avant
 * de générer qu'il ne lui reste que 28 Invaders dans le 7e. L'information
 * n'existe qu'une fois la chasse calculée. Un interrupteur dans le panneau
 * aurait donc été affiché dans tous les cas pour servir dans une minorité, au
 * milieu de six réglages déjà présents.
 *
 * La détection est gratuite : le planificateur travaille hors ligne, seul le
 * calcul d'itinéraire coûte un appel réseau. On ne dépense donc rien pour savoir
 * s'il y a lieu de proposer, seul l'utilisateur qui accepte paie une relance.
 * C'est ce qui rend la proposition après coup préférable au réglage en amont.
 *
 * La condition est LITTÉRALE, pas heuristique. Un parcours court n'est pas
 * toujours un arrondissement vide : il peut buter sur le plafond d'étapes de
 * l'API d'itinéraires, ou avoir perdu des éperons au nettoyage final. Déborder
 * n'y changerait rien, et proposer serait un mensonge. On exige donc que TOUS
 * les Invaders éligibles de l'arrondissement soient déjà dans le parcours.
 */

import { neighborsOf } from './arrondissement';

// En deçà, l'extension ne vaut pas le détour…
export const SPILL_MIN_LEFTOVER_MIN = 20;
// …et il faut en plus que ce soit une part franche du budget, pour ne pas
// proposer d'étendre une sortie de 3 h à laquelle il ne manque que 25 minutes.
export const SPILL_MIN_LEFTOVER_FRAC = 0.2;

/**
 * @param arSet       Set des arrondissements choisis, ou null (mode « autour de moi »)
 * @param spillArs    Set des voisins déjà ouverts, ou null si on n'a pas encore débordé
 * @param candidates  Invaders éligibles de l'arrondissement (avant planification)
 * @param steps       étapes retenues, Invaders ET lieux mêlés
 * @param durationMin durée réelle du parcours, itinéraire compris
 * @param budgetMin   budget demandé
 * @returns {{ar: number, leftoverMin: number, count: number}|null}
 */
export function spillOffer(arSet, spillArs, candidates, steps, durationMin, budgetMin) {
  // Un seul arrondissement à la fois : la multi-sélection est désactivée en
  // amont, et « les voisins de plusieurs zones » n'aurait pas de sens lisible.
  if (!arSet || arSet.size !== 1) return null;
  // Déjà débordé : ne pas reproposer indéfiniment.
  if (spillArs) return null;

  const pris = steps.filter(s => !s.isPoi).length;
  if (pris < candidates.length) return null;   // il en reste à prendre sur place

  const leftover = budgetMin - durationMin;
  if (leftover < Math.max(SPILL_MIN_LEFTOVER_MIN, budgetMin * SPILL_MIN_LEFTOVER_FRAC)) return null;

  const ar = [...arSet][0];
  if (!neighborsOf([ar]).length) return null;  // par sûreté : aucun voisin connu

  return { ar, leftoverMin: Math.round(leftover), count: pris };
}
