/**
 * utils/tourGeometry.js — Mesure les demi-tours d'une boucle de chasse.
 *
 * Le planificateur minimise le TEMPS, et un aller-retour est très souvent la
 * solution optimale en temps : c'est précisément pour cela qu'il en produit.
 * Mesuré sur 160 chasses parisiennes réelles, une sur deux contient un demi-tour
 * franc. Repasser par la rue qu'on vient de descendre est ennuyeux à marcher, et,
 * en mode explorateur, ça désigne l'Invader qu'on est allé chercher au fond de
 * l'impasse.
 *
 * D'où ce terme de coût, à ajouter au temps. Il vit ici plutôt que dans l'écran
 * pour être testable : c'est le seul morceau du planificateur dont la justesse
 * ne se lit pas à l'œil.
 */

/**
 * Seuil de déclenchement, en cosinus de l'angle de renversement.
 *
 * Un virage de rue ordinaire (90°, cosinus 0) ne coûte rien, et un virage même
 * serré non plus : la pénalité ne démarre qu'au-delà de 120°. On vise
 * l'aller-retour, pas le coin de rue — sans ce seuil, on déformerait tous les
 * parcours au lieu de corriger ceux qui posent problème.
 */
export const BACKTRACK_DOT_MIN = -0.5; // cos(120°)

/**
 * Score de demi-tour d'une boucle, exprimé en « nombre de demi-tours complets ».
 *
 * Pour chaque étape, on compare la direction d'arrivée et la direction de
 * départ. Si l'on repart d'où l'on vient, le produit scalaire des deux vecteurs
 * unitaires vaut -1 et l'étape coûte 1. À 120° elle coûte 0, et en deçà rien.
 * L'unité est lisible, ce qui permet d'exprimer la pondération en minutes par
 * demi-tour plutôt qu'en constante arbitraire.
 *
 * @param order    étapes dans l'ordre de visite ({ lat, lng })
 * @param startLat départ ET arrivée : la chasse est une boucle
 * @param startLon
 */
export function backtrackScore(order, startLat, startLon) {
  if (!order || order.length < 2) return 0;
  const pts = [[startLat, startLon], ...order.map(o => [o.lat, o.lng]), [startLat, startLon]];
  // Projection plane locale : à l'échelle d'une chasse l'erreur est négligeable,
  // et seule la DIRECTION nous intéresse, pas la distance.
  const kx = Math.cos((startLat * Math.PI) / 180);
  let s = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const ux = (pts[i][1] - pts[i - 1][1]) * kx, uy = pts[i][0] - pts[i - 1][0];
    const vx = (pts[i + 1][1] - pts[i][1]) * kx, vy = pts[i + 1][0] - pts[i][0];
    const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
    if (nu < 1e-12 || nv < 1e-12) continue; // deux étapes confondues : pas d'angle
    const dot = (ux * vx + uy * vy) / (nu * nv);
    if (dot < BACKTRACK_DOT_MIN) s += (BACKTRACK_DOT_MIN - dot) / (1 + BACKTRACK_DOT_MIN);
  }
  return s;
}
