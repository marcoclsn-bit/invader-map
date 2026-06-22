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

for (const inv of INVADERS) {
  const pt = turf.point([inv.lng, inv.lat]);
  for (const f of GJ.features) {
    if (turf.booleanPointInPolygon(pt, f.geometry)) {
      INVADER_DISTRICT.set(inv.id, f.properties.c_ar);
      break;
    }
  }
}

export function arLabel(n) {
  return n === 1 ? '1er arr.' : `${n}e arr.`;
}
