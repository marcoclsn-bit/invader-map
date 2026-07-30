// Découpage des étapes pour le repli Mapbox (services/routing.js).
//
// Mapbox n'accepte que 25 points par requête, ORS en accepte 50 : une chasse de
// 48 étapes doit être découpée. Les tronçons se chevauchent d'un point pour se
// raccorder — une erreur d'indice y produirait un TROU dans le tracé, ou un
// segment compté deux fois dans la durée, sans qu'aucune erreur ne se déclenche.
// D'où ce test : le défaut serait silencieux et visible seulement sur la carte.

jest.mock('../i18n', () => ({ __esModule: true, default: { t: (k) => k } }));
jest.mock('../config/ors', () => ({ ORS_API_KEY: 'test' }));
jest.mock('../config/mapbox', () => ({ MAPBOX_TOKEN: 'test' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));

import { chunkWaypoints } from '../services/routing';

// Nombre de segments couverts par un découpage : chaque tronçon de n points
// couvre n-1 segments. Le total doit valoir exactement (points - 1).
const legs = (chunks) => chunks.reduce((s, c) => s + c.length - 1, 0);
const pts = (n) => Array.from({ length: n }, (_, i) => [i, i]);

describe('chunkWaypoints', () => {
  test('ne découpe pas en dessous de la limite', () => {
    for (const n of [2, 10, 25]) {
      const c = chunkWaypoints(pts(n));
      expect(c).toHaveLength(1);
      expect(c[0]).toHaveLength(n);
    }
  });

  test('respecte la limite de 25 points par requête', () => {
    for (const n of [26, 30, 48, 50, 99]) {
      for (const chunk of chunkWaypoints(pts(n))) {
        expect(chunk.length).toBeGreaterThanOrEqual(2);
        expect(chunk.length).toBeLessThanOrEqual(25);
      }
    }
  });

  test('couvre exactement tous les segments, sans trou ni doublon', () => {
    for (let n = 2; n <= 60; n++) {
      expect(legs(chunkWaypoints(pts(n)))).toBe(n - 1);
    }
  });

  test('les tronçons se raccordent bout à bout', () => {
    const chunks = chunkWaypoints(pts(48));
    for (let i = 1; i < chunks.length; i++) {
      const finPrec = chunks[i - 1][chunks[i - 1].length - 1];
      const debut = chunks[i][0];
      expect(debut).toEqual(finPrec); // le point de jonction est partagé
    }
  });

  test('une chasse pleine (48 points) tient en deux requêtes', () => {
    expect(chunkWaypoints(pts(48))).toHaveLength(2);
  });
});
