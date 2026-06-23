/**
 * cities/subdivisions.js
 *
 * Calcule les subdivisions (arrondissements, boroughs…) pour une ville donnée.
 * Retourne null si la ville n'a pas de GeoJSON de subdivisions.
 *
 * Appelé par AppContext quand la ville courante change (pas au chargement global).
 * utils/arrondissement.js garde ses exports pour la compatibilité ascendante.
 */

import * as turf from '@turf/turf';
import ParisGJ from '../data/paris-arrondissements.json';

export function loadSubdivisions(cityCode, invaders) {
  if (cityCode === 'PA') return _computePA(invaders);
  return null;
}

function _computePA(invaders) {
  const districtMap = new Map();
  const centers = new Map();

  for (const f of ParisGJ.features) {
    const { c_ar, geom_x_y } = f.properties;
    if (geom_x_y) centers.set(c_ar, { lon: geom_x_y.lon, lat: geom_x_y.lat });
  }

  for (const inv of invaders) {
    const pt = turf.point([inv.lng, inv.lat]);
    for (const f of ParisGJ.features) {
      if (turf.booleanPointInPolygon(pt, f.geometry)) {
        districtMap.set(inv.id, f.properties.c_ar);
        break;
      }
    }
  }

  return {
    districtMap,
    centers,
    labelFn: (n) => n === 1 ? '1er arr.' : `${n}e arr.`,
  };
}
