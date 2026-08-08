import * as turf from '@turf/turf';
import { INVADERS } from '../data/invaders';
import GJ from '../data/paris-arrondissements.json';

// Invader → numéro d'arrondissement (1-20)
export const INVADER_DISTRICT = new Map();

// Arrondissement → centroïde { lon, lat } (source : geom_x_y du GeoJSON officiel)
export const ARRONDISSEMENT_CENTERS = new Map();

for (const f of GJ.features) {
  const { c_ar, geom_x_y } = f.properties;
  ARRONDISSEMENT_CENTERS.set(c_ar, { lon: geom_x_y.lon, lat: geom_x_y.lat });
}

// Amorce depuis le fichier embarqué. Il ne contient PLUS tous les Invaders servis
// (voir ensureDistricts), mais il est disponible dès le premier rendu, avant même
// que les données à jour ne soient chargées.
for (const inv of INVADERS) {
  const ar = districtOfPoint(inv.lng, inv.lat);
  if (ar !== undefined) INVADER_DISTRICT.set(inv.id, ar);
}

/**
 * Arrondissements limitrophes, pour le débordement de la Chasse.
 *
 * Table figée plutôt que calculée : la mitoyenneté demanderait de comparer
 * 190 paires de contours de ~250 points chacun, soit près de 12 millions de
 * distances au démarrage, pour un résultat qui n'a pas bougé depuis 1860.
 *
 * Dérivée des mêmes polygones que ce fichier, au seuil de 25 m entre contours.
 * Résultat stable de 2 m à 60 m (50 puis 51 paires) : ce n'est donc pas un
 * réglage sensible. Les voisinages de part et d'autre de la Seine sont
 * conservés, la limite administrative passe dans l'axe du fleuve, et les
 * ponts rendent le passage réel à pied comme à vélo.
 */
export const ARRONDISSEMENT_NEIGHBORS = new Map([
  [1, [2, 3, 4, 5, 6, 7, 8, 9]],
  [2, [1, 3, 9, 10]],
  [3, [1, 2, 4, 10, 11]],
  [4, [1, 3, 5, 6, 11, 12]],
  [5, [1, 4, 6, 12, 13, 14]],
  [6, [1, 4, 5, 7, 14, 15]],
  [7, [1, 6, 8, 15, 16]],
  [8, [1, 7, 9, 16, 17, 18]],
  [9, [1, 2, 8, 10, 17, 18]],
  [10, [2, 3, 9, 11, 18, 19, 20]],
  [11, [3, 4, 10, 12, 19, 20]],
  [12, [4, 5, 11, 13, 20]],
  [13, [5, 12, 14]],
  [14, [5, 6, 13, 15]],
  [15, [6, 7, 14, 16]],
  [16, [7, 8, 15, 17]],
  [17, [8, 9, 16, 18]],
  [18, [8, 9, 10, 17, 19]],
  [19, [10, 11, 18, 20]],
  [20, [10, 11, 12, 19]],
]);

/** Voisins des arrondissements donnés, sans les arrondissements eux-mêmes. */
export function neighborsOf(ars) {
  const base = new Set(ars);
  const out = new Set();
  for (const ar of base) {
    for (const n of ARRONDISSEMENT_NEIGHBORS.get(ar) ?? []) {
      if (!base.has(n)) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Arrondissement contenant un point, ou `undefined` s'il est hors de Paris. */
export function districtOfPoint(lng, lat) {
  const pt = turf.point([lng, lat]);
  for (const f of GJ.features) {
    if (turf.booleanPointInPolygon(pt, f.geometry)) return f.properties.c_ar;
  }
  return undefined;
}

/**
 * Complète INVADER_DISTRICT avec les Invaders absents du fichier embarqué.
 *
 * `data/invaders.js` n'est plus qu'un filet de sécurité hors ligne : le runtime
 * sert `data/invaders_PA.json`, qui compte davantage d'Invaders et en gagne à
 * chaque mise à jour du dépôt. Les nouveaux venus n'avaient donc aucun
 * arrondissement, et `Set.has(undefined)` les excluait EN SILENCE du mode
 * quartier de la Chasse comme du décompte du Palmarès, un Invader du 7e était
 * ainsi invisible, et l'écart se creusait à chaque rafraîchissement des données.
 *
 * Idempotent et incrémental : seuls les ids jamais examinés sont projetés sur
 * les polygones, donc un appel supplémentaire ne coûte qu'un parcours de liste.
 * On mémorise aussi les ÉCHECS (`_seen`) : un Invader hors de Paris ne tombe
 * dans aucun polygone, et sans cette trace on referait ses vingt tests à chaque
 * appel, or le Palmarès recalcule à chaque flash, sur la ville courante quelle
 * qu'elle soit.
 */
const _seen = new Set();

export function ensureDistricts(invaders) {
  if (!invaders?.length) return INVADER_DISTRICT;
  for (const inv of invaders) {
    if (_seen.has(inv.id) || INVADER_DISTRICT.has(inv.id)) continue;
    _seen.add(inv.id);
    const ar = districtOfPoint(inv.lng, inv.lat);
    if (ar !== undefined) INVADER_DISTRICT.set(inv.id, ar);
  }
  return INVADER_DISTRICT;
}

/**
 * Contour d'un arrondissement, prêt pour `<Polygon>` de react-native-maps.
 * Les 20 features sont des Polygon à un seul anneau (vérifié sur le fichier) :
 * pas de trou à gérer, pas de MultiPolygon.
 */
export function districtRing(ar) {
  const f = GJ.features.find(x => x.properties.c_ar === ar);
  if (!f) return null;
  return f.geometry.coordinates[0].map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

export function arLabel(n) {
  return n === 1 ? '1er arr.' : `${n}e arr.`;
}
