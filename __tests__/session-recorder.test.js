// Comblement des interruptions de suivi (components/session/useSessionRecorder.js).
//
// iOS suspend l'app au verrouillage de l'écran : le tracé montrait une ligne
// droite d'un bout à l'autre du quartier, et la distance du segment n'était pas
// comptée. Le comblement s'appuie sur l'itinéraire déjà calculé.
//
// Ce défaut est SILENCIEUX — un tracé approximatif ne lève aucune erreur et ne
// se voit que sur la carte de partage, après coup. D'où ces tests.

import { lieuxAtteints, comblerDepuisItineraire } from '../components/session/useSessionRecorder';

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

  test('comble encore après un détour ordinaire', () => {
    // ~250 m au nord de l'itinéraire : un café, une rue barrée. On préfère un
    // tracé plausible à une ligne droite traversant les immeubles.
    const detour = { lat: 48.8622, lng: 2.3530 };
    expect(comblerDepuisItineraire(route, detour, sur(8))).not.toBeNull();
  });

  test('s’abstient quand l’utilisateur s’est franchement éloigné', () => {
    // 2 km au nord : reprendre l'itinéraire raconterait une balade qui n'a pas eu lieu
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

// ── Plafond de vraisemblance de la distance ─────────────────────────────────
// Le tracé et le compteur obéissent à deux règles distinctes : le premier
// privilégie le chemin plausible, le second refuse de compter ce qui n'a pas pu
// être parcouru. Un trajet en métro doit apparaître sur la carte sans gonfler
// les kilomètres.
import { VITESSE_MAX_KMH, VITESSE_DEFAUT } from '../components/session/useSessionRecorder';

describe('plafond de vitesse par mode', () => {
  test('le vélo est plus permissif que la marche', () => {
    expect(VITESSE_MAX_KMH['cycling-regular']).toBeGreaterThan(VITESSE_MAX_KMH['foot-walking']);
  });

  test('un marcheur ne peut pas valider une vitesse de métro', () => {
    expect(VITESSE_MAX_KMH['foot-walking']).toBeLessThan(25); // vitesse commerciale du métro
  });

  test('la course en mode marche reste comptée', () => {
    // Rien n'empêche de courir avec le profil piéton. À 12 km/h, la distance
    // d'un coureur était effacée — l'inverse du but recherché.
    expect(VITESSE_MAX_KMH['foot-walking']).toBeGreaterThanOrEqual(16);
  });

  test('un cycliste rapide en ville reste sous le plafond', () => {
    expect(VITESSE_MAX_KMH['cycling-regular']).toBeGreaterThanOrEqual(30);
  });

  test('un mode inconnu retombe sur la marche, le plus strict', () => {
    expect(VITESSE_DEFAUT).toBe(VITESSE_MAX_KMH['foot-walking']);
  });
});

describe('lieuxAtteints', () => {
  // Tracé le long de l'équateur : 1° de longitude y vaut ~111 km, donc
  // 0,0005° ≈ 55 m, juste sous le seuil de 60 m.
  const trace = [[0, 0], [0.001, 0], [0.002, 0]];
  const lieu = (id, lng, lat) => ({ id, lng, lat });

  test('retient un lieu longé de près', () => {
    expect(lieuxAtteints([lieu('a', 0.001, 0.0004)], trace)).toEqual(['a']);
  });

  test('écarte un lieu prévu mais jamais approché', () => {
    // ~220 m du tracé : la sortie s'est arrêtée avant, ou est passée ailleurs.
    expect(lieuxAtteints([lieu('a', 0.001, 0.002)], trace)).toEqual([]);
  });

  test('ne compte chaque lieu qu\'une fois, même longé plusieurs fois', () => {
    const allerRetour = [[0, 0], [0.001, 0], [0.002, 0], [0.001, 0], [0, 0]];
    expect(lieuxAtteints([lieu('a', 0.001, 0)], allerRetour)).toEqual(['a']);
  });

  test('sans tracé ou sans lieu, rien', () => {
    expect(lieuxAtteints([], trace)).toEqual([]);
    expect(lieuxAtteints([lieu('a', 0, 0)], [])).toEqual([]);
    expect(lieuxAtteints(null, trace)).toEqual([]);
  });
});
