// Comblement des interruptions de suivi (components/session/useSessionRecorder.js).
//
// iOS suspend l'app au verrouillage de l'écran : le tracé montrait une ligne
// droite d'un bout à l'autre du quartier, et la distance du segment n'était pas
// comptée. Le comblement s'appuie sur l'itinéraire déjà calculé.
//
// Ce défaut est SILENCIEUX — un tracé approximatif ne lève aucune erreur et ne
// se voit que sur la carte de partage, après coup. D'où ces tests.

import { comblerDepuisItineraire } from '../components/session/useSessionRecorder';

// Itinéraire droit d'ouest en est, 11 points espacés d'environ 74 m.
const route = Array.from({ length: 11 }, (_, i) => [2.3500 + i * 0.001, 48.8600]);
const sur = (i) => ({ lat: route[i][1], lng: route[i][0] });

describe('comblerDepuisItineraire', () => {
  test('insère les points intermédiaires de l’itinéraire', () => {
    const r = comblerDepuisItineraire(route, sur(1), sur(7));
    expect(r).not.toBeNull();
    expect(r.points).toHaveLength(6);              // indices 2 à 7
    expect(r.points[0]).toEqual(route[2]);
    expect(r.points[r.points.length - 1]).toEqual(route[7]);
  });

  test('la distance suit le chemin, elle ne saute pas d’un bout à l’autre', () => {
    const r = comblerDepuisItineraire(route, sur(0), sur(10));
    // 10 segments d’environ 73 m : le total doit rester cohérent
    expect(r.km).toBeGreaterThan(0.6);
    expect(r.km).toBeLessThan(0.9);
  });

  test('fonctionne dans le sens inverse', () => {
    const r = comblerDepuisItineraire(route, sur(8), sur(3));
    expect(r).not.toBeNull();
    expect(r.points[0]).toEqual(route[7]);
    expect(r.points[r.points.length - 1]).toEqual(route[3]);
  });

  test('s’abstient si l’utilisateur n’était pas sur l’itinéraire', () => {
    // 2 km au nord : on ne peut rien déduire du chemin prévu
    const loin = { lat: 48.8800, lng: 2.3520 };
    expect(comblerDepuisItineraire(route, loin, sur(7))).toBeNull();
    expect(comblerDepuisItineraire(route, sur(1), loin)).toBeNull();
  });

  test('s’abstient quand il n’y a rien à combler', () => {
    expect(comblerDepuisItineraire(route, sur(4), sur(4))).toBeNull();
    expect(comblerDepuisItineraire(null, sur(1), sur(5))).toBeNull();
    expect(comblerDepuisItineraire([[2.35, 48.86]], sur(1), sur(5))).toBeNull();
  });

  test('n’invente jamais de points hors de l’itinéraire fourni', () => {
    const r = comblerDepuisItineraire(route, sur(2), sur(9));
    for (const p of r.points) expect(route).toContainEqual(p);
  });
});
