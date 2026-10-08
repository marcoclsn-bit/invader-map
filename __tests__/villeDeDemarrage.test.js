import { villeRestaurable, CITIES, MAPPABLE_CITIES, ENABLED_CITIES } from '../cities/registry';
import { aUnePosition } from '../utils/coordonnees';
import { SPACE_INVADERS, SPACE_CITY_CODE } from '../data/invadersSpace';

/**
 * Deux utilisateurs Android bloqués pendant des semaines, octobre 2026 : l'app
 * s'arrêtait à chaque lancement. Chaîne complète, vérifiée dans le code :
 *   Palmarès ou sélecteur de la Collection → setCurrentCity('SPACE') → ville
 *   mémorisée → relue au démarrage → la Carte (premier onglet) reçoit les deux
 *   mosaïques de l'Espace, sans position → Google Maps refuse un marqueur à
 *   coordonnées nulles → le processus tombe. La désinstallation ne libérait pas :
 *   la sauvegarde automatique d'Android restaure le stockage.
 * Ces tests verrouillent chaque maillon.
 */

describe('villeRestaurable : ce qu’on accepte comme ville de démarrage', () => {
  test('refuse l’Espace, qui n’a pas de position', () => {
    expect(CITIES[SPACE_CITY_CODE]).toBeDefined();          // la ville existe bien…
    expect(villeRestaurable(SPACE_CITY_CODE)).toBe(false);  // …mais ne se rouvre pas
  });

  test('accepte toute ville cartographiable, et rien d’autre', () => {
    for (const c of MAPPABLE_CITIES) expect(villeRestaurable(c.code)).toBe(true);
    expect(villeRestaurable('PA')).toBe(true);
    expect(villeRestaurable('NEXISTEPAS')).toBe(false);
    expect(villeRestaurable(null)).toBe(false);
    expect(villeRestaurable(undefined)).toBe(false);
    expect(villeRestaurable('')).toBe(false);
  });

  test('l’Espace est la seule ville activée non cartographiable', () => {
    const nonCarto = ENABLED_CITIES.filter((c) => c.mappable === false).map((c) => c.code);
    expect(nonCarto).toEqual([SPACE_CITY_CODE]);
  });

  test('toute ville cartographiable a un centre numérique (sinon _nearestCity lève)', () => {
    for (const c of MAPPABLE_CITIES) {
      expect(Number.isFinite(c.center?.lat)).toBe(true);
      expect(Number.isFinite(c.center?.lng)).toBe(true);
    }
  });
});

describe('aUnePosition : ce qu’on laisse atteindre un marqueur natif', () => {
  test('les mosaïques de l’Espace n’en ont pas', () => {
    for (const inv of SPACE_INVADERS) expect(aUnePosition(inv)).toBe(false);
  });

  test('null, undefined, NaN et chaînes sont tous refusés', () => {
    expect(aUnePosition({ lat: null, lng: null })).toBe(false);
    expect(aUnePosition({ lat: undefined, lng: 2.35 })).toBe(false);
    expect(aUnePosition({ lat: NaN, lng: 2.35 })).toBe(false);
    expect(aUnePosition({ lat: '48.85', lng: '2.35' })).toBe(false);
    expect(aUnePosition(null)).toBe(false);
    expect(aUnePosition({})).toBe(false);
  });

  test('une vraie position passe, zéro compris (c’est une coordonnée valide)', () => {
    expect(aUnePosition({ lat: 48.8566, lng: 2.3522 })).toBe(true);
    expect(aUnePosition({ lat: 0, lng: 0 })).toBe(true);
  });
});
