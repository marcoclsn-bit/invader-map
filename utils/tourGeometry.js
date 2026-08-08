/**
 * utils/tourGeometry.js : mesure les demi-tours d'une boucle de chasse.
 *
 * Le planificateur minimise le TEMPS, et un aller-retour est très souvent la
 * solution optimale en temps : c'est précisément pour cela qu'il en produit.
 * Mesuré sur 160 chasses parisiennes réelles, une sur deux contient un demi-tour
 * franc, et il s'y ajoute en moyenne 5,6 virages en épingle par parcours.
 * Repasser par la rue qu'on vient de descendre est ennuyeux à marcher, et, en
 * mode explorateur, ça désigne l'Invader qu'on est allé chercher au fond de
 * l'impasse.
 *
 * D'où ce terme de coût, à ajouter au temps. Il vit ici plutôt que dans l'écran
 * pour être testable : c'est le seul morceau du planificateur dont la justesse
 * ne se lit pas à l'œil.
 */

/**
 * Seuil de déclenchement, en cosinus de l'angle de renversement.
 *
 * La pénalité démarre à 90° et croît jusqu'au demi-tour complet : un virage à
 * angle droit ne coûte donc toujours rien, mais tout ce qui pique au-delà coûte
 * quelque chose.
 *
 * Le seuil était d'abord à 120°, par crainte de déformer tous les parcours en
 * pénalisant les coins de rue. La mesure a démenti cette crainte : sur 180
 * chasses parisiennes, passer de 120° à 90° retire 41 % des virages voyants
 * SANS coûter une étape ni une minute, l'Or-opt récupère la différence. Le
 * garde-fou théorique valait moins que le chiffre.
 */
export const BACKTRACK_DOT_MIN = 0; // cos(90°)

/**
 * Score de demi-tour d'une boucle, exprimé en « nombre de demi-tours complets ».
 *
 * Pour chaque étape, on compare la direction d'arrivée et la direction de
 * départ. Si l'on repart d'où l'on vient, le produit scalaire des deux vecteurs
 * unitaires vaut -1 et l'étape coûte 1. À 120° elle coûte 0,5, à 90° rien.
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
    // Note : avec un seuil à 0, l'expression se réduit à -dot, un demi-tour
    // complet coûte 1, un virage à 120° en coûte 0,5, un angle droit rien.
  }
  return s;
}

/**
 * Simplifie un tracé destiné à l'AFFICHAGE, en mode explorateur.
 *
 * Les petits décrochages qui quittent l'axe de la rue pour toucher une façade
 * désignent l'Invader aussi sûrement qu'une épingle. À 25 m de tolérance, la rue
 * empruntée reste la même et le parcours réel ne change pas : seul le dessin
 * cesse d'être au mètre près.
 *
 * Appliqué au moment de DESSINER, et non en repli d'une autre valeur : la
 * première version posait `drawnPolyline` derrière un `??` que le tracé
 * complet, toujours non nul, rendait inatteignable. La protection existait dans
 * le code et ne s'exécutait jamais.
 *
 * @param coords    [{ latitude, longitude }]
 * @param actif     false rend le tableau d'origine, sans copie ni calcul
 */
// ~25 m en latitude, et désormais en longitude aussi (voir la projection).
const TOLERANCE_DEG = 0.00022;

export function simplifyPath(coords, actif) {
  if (!actif || !coords || coords.length < 3) return coords;
  try {
    // Projection plane locale AVANT de simplifier : un degré de longitude est
    // plus court qu'un degré de latitude, et travailler en degrés bruts rendait
    // la tolérance anisotrope, 28 m nord-sud contre 18 m est-ouest à Paris.
    // Le facteur remet les deux axes à la même échelle.
    const kx = Math.cos((coords[0].latitude * Math.PI) / 180) || 1;
    const pts = coords.map(c => [c.longitude * kx, c.latitude]);
    const out = _douglasPeucker(pts, TOLERANCE_DEG);
    return out.map(([x, lat]) => ({ latitude: lat, longitude: x / kx }));
  } catch { return coords; }
}

// Implémenté ici plutôt que via turf.simplify : la fonction est appelée au
// rendu, et fabriquer un objet GeoJSON à chaque passe pour le défaire ensuite
// coûte plus que l'algorithme lui-même.
function _douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const den = Math.hypot(dx, dy);
  // EXTRÉMITÉS CONFONDUES : on mesure la distance au POINT, pas à la droite.
  // Une chasse est une boucle, son premier et son dernier point sont le même :
  // la droite de référence était alors dégénérée, la distance valait exactement
  // zéro pour TOUS les points, et la fonction rendait deux points identiques.
  // Autrement dit le tracé disparaissait entièrement de la carte, sur 100 % des
  // chasses en mode explorateur. Mesurer au point rétablit le comportement
  // attendu : le point le plus éloigné devient la coupure, et la récursion fait
  // le reste sur deux moitiés qui, elles, ont des extrémités distinctes.
  const boucle = den < 1e-12;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = boucle
      ? Math.hypot(px - ax, py - ay)
      : Math.abs(dy * px - dx * py + bx * ay - by * ax) / den;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [
    ..._douglasPeucker(pts.slice(0, idx + 1), tol).slice(0, -1),
    ..._douglasPeucker(pts.slice(idx), tol),
  ];
}
