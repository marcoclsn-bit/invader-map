/**
 * utils/coordonnees.js — un objet a-t-il une position exploitable ?
 *
 * `lat` et `lng` doivent être deux nombres finis. `null` ne suffit pas à
 * écarter : `NaN` et `undefined` passent aussi par là, et aucun des trois ne
 * doit atteindre un composant natif. Google Maps (Android) lève une exception
 * sur un marqueur à coordonnées nulles et l'application s'arrête ; MapKit (iOS)
 * l'ignore en silence, ce qui a masqué le défaut pendant des semaines.
 *
 * Les deux mosaïques de l'Espace (`data/invadersSpace.js`) sont le cas réel :
 * elles n'ont pas de position au sol, par construction.
 */
export function aUnePosition(o) {
  return !!o && Number.isFinite(o.lat) && Number.isFinite(o.lng);
}
