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
 * quartier de la Chasse comme du décompte du Palmarès — un Invader du 7e était
 * ainsi invisible, et l'écart se creusait à chaque rafraîchissement des données.
 *
 * Idempotent et incrémental : seuls les ids jamais examinés sont projetés sur
 * les polygones, donc un appel supplémentaire ne coûte qu'un parcours de liste.
 * On mémorise aussi les ÉCHECS (`_seen`) : un Invader hors de Paris ne tombe
 * dans aucun polygone, et sans cette trace on referait ses vingt tests à chaque
 * appel — or le Palmarès recalcule à chaque flash, sur la ville courante quelle
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
