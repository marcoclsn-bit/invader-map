// Tests du modèle de session (utils/session.js).
// On mocke arrondissement pour éviter de charger turf + tout le dataset Invaders.
jest.mock('../utils/arrondissement', () => ({
  INVADER_DISTRICT: new Map([['PA_1', 18], ['PA_2', 18], ['PA_3', 9]]),
  arLabel: (n) => String(n),
}));

import {
  haversineKm, invaderIdsInRange, dominantDistrict, makeSession, extractCityCode,
  missedAlongRoute,
} from '../utils/session';

describe('haversineKm', () => {
  test('1° de latitude ≈ 111 km', () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 0);
  });
  test('même point = 0', () => {
    expect(haversineKm(48.86, 2.35, 48.86, 2.35)).toBe(0);
  });
});

describe('extractCityCode', () => {
  test('extrait le code ville de l’ID', () => {
    expect(extractCityCode('PA_1528')).toBe('PA');
    expect(extractCityCode('MARS_12')).toBe('MARS');
  });
});

describe('invaderIdsInRange', () => {
  const t = (h) => new Date(2024, 0, 1, h, 0, 0).toISOString();
  const flashedDates = new Map([
    ['PA_1', t(10)], // dans la fenêtre
    ['PA_2', t(11)], // dans la fenêtre
    ['PA_3', t(20)], // hors fenêtre
  ]);
  test('ne garde que les flashs dans [start, end]', () => {
    const start = new Date(2024, 0, 1, 9, 0, 0).getTime();
    const end = new Date(2024, 0, 1, 12, 0, 0).getTime();
    const ids = invaderIdsInRange(flashedDates, start, end).sort();
    expect(ids).toEqual(['PA_1', 'PA_2']);
  });
  test('Map vide → []', () => {
    expect(invaderIdsInRange(new Map(), 0, Date.now())).toEqual([]);
  });
});

describe('dominantDistrict', () => {
  test('renvoie l’arrondissement majoritaire', () => {
    expect(dominantDistrict(['PA_1', 'PA_2', 'PA_3'])).toBe(18); // 18 apparaît 2×
  });
  test('aucun arrondissement connu → null', () => {
    expect(dominantDistrict(['LY_1', 'LY_2'])).toBeNull();
  });
});

describe('makeSession', () => {
  test('calcule la durée, arrondit la distance, déduit le district', () => {
    const s = makeSession({
      source: 'hunt',
      startedAt: new Date(2024, 0, 1, 10, 0, 0).toISOString(),
      endedAt: new Date(2024, 0, 1, 11, 0, 0).toISOString(),
      distanceKm: 3.456,
      invaderIds: ['PA_1', 'PA_2'],
      city: 'PA',
    });
    expect(s.durationSec).toBe(3600);
    expect(s.distanceKm).toBe(3.46);
    expect(s.district).toBe(18);
    expect(s.id).toMatch(/^s_/);
  });
  test('distanceKm null reste null (balade)', () => {
    const s = makeSession({
      source: 'stroll',
      startedAt: new Date(2024, 0, 1, 10, 0, 0).toISOString(),
      endedAt: new Date(2024, 0, 1, 10, 30, 0).toISOString(),
      distanceKm: null,
      invaderIds: [],
      city: 'PA',
    });
    expect(s.distanceKm).toBeNull();
    expect(s.routeCoords).toBeNull();
  });
});

describe('missedAlongRoute', () => {
  // Tracé rectiligne d'ouest en est le long de l'équateur : 1° de longitude
  // y vaut ~111 km, les distances sont donc lisibles à l'œil.
  const route = [[0, 0], [0.01, 0]]; // ~1,1 km

  const inv = (id, lng, lat, status = 'ok') => ({ id, lng, lat, status });

  test('retient un Invader proche du tracé, jamais flashé', () => {
    const out = missedAlongRoute([inv('a', 0.005, 0.0009)], route, new Set());
    expect(out).toEqual([{ lng: 0.005, lat: 0.0009 }]); // ~100 m
  });

  test('écarte au-delà du couloir de 150 m', () => {
    expect(missedAlongRoute([inv('a', 0.005, 0.002)], route, new Set())).toHaveLength(0); // ~222 m
  });

  test('écarte les déjà flashés — le gris dit « à trouver », pas « raté »', () => {
    const out = missedAlongRoute([inv('a', 0.005, 0.0005)], route, new Set(['a']));
    expect(out).toHaveLength(0);
  });

  test('écarte les détruits : inutile d’envoyer chercher une mosaïque disparue', () => {
    const out = missedAlongRoute([inv('a', 0.005, 0.0005, 'destroyed')], route, new Set());
    expect(out).toHaveLength(0);
  });

  test('trie du plus proche du tracé au plus loin', () => {
    const out = missedAlongRoute(
      [inv('loin', 0.004, 0.0012), inv('pres', 0.006, 0.0002)],
      route, new Set(),
    );
    expect(out[0].lng).toBe(0.006);
  });

  test('plafonne le nombre de repères', () => {
    const many = Array.from({ length: 60 }, (_, i) => inv(`i${i}`, 0.0001 * i, 0.0001));
    expect(missedAlongRoute(many, route, new Set(), 40)).toHaveLength(40);
  });

  test('sans tracé exploitable, aucun repère', () => {
    expect(missedAlongRoute([inv('a', 0, 0)], [[0, 0]], new Set())).toEqual([]);
    expect(missedAlongRoute([inv('a', 0, 0)], null, new Set())).toEqual([]);
  });
});
