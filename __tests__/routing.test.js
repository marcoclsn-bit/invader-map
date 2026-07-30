// Découpage des étapes pour le repli Mapbox (services/routing.js).
//
// Mapbox n'accepte que 25 points par requête, ORS en accepte 50 : une chasse de
// 48 étapes doit être découpée. Les tronçons se chevauchent d'un point pour se
// raccorder — une erreur d'indice y produirait un TROU dans le tracé, ou un
// segment compté deux fois dans la durée, sans qu'aucune erreur ne se déclenche.
// D'où ce test : le défaut serait silencieux et visible seulement sur la carte.

jest.mock('../i18n', () => ({ __esModule: true, default: { t: (k) => k } }));
jest.mock('../config/ors', () => ({ ORS_API_KEY: 'test' }));
jest.mock('../config/mapbox', () => ({ MAPBOX_TOKEN: 'jeton-test' }));

// Compteur d'appels du jour : on le pilote pour simuler un quota ORS épuisé.
let mockStockage = null;
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => mockStockage),
    setItem: jest.fn(async () => {}),
  },
}));

import { chunkWaypoints, multiRoute, DAILY_CAPS } from '../services/routing';

// Doit reproduire EXACTEMENT todayKey() de routing.js : heure locale et pas de
// zéro de tête (« 2026-7-30 »), sinon le compteur simulé est ignoré en silence.
const jour = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

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

// ─── Repli ORS → Mapbox ───────────────────────────────────────────────────────
//
// Ce chemin ne s'exécute JAMAIS en usage normal : il n'existe que pour le jour
// où ORS est à sec. S'il est cassé, il le sera exactement quand il compte, et
// personne ne s'en apercevra avant. Il ne peut donc être vérifié qu'ici.

function reponseMapbox(nbPoints) {
  const legs = Array.from({ length: nbPoints - 1 }, () => ({ duration: 300 }));
  return {
    ok: true,
    status: 200,
    json: async () => ({
      routes: [{
        duration: legs.length * 300,
        legs,
        geometry: { coordinates: Array.from({ length: 40 }, (_, i) => [i / 100, i / 100]) },
      }],
    }),
  };
}

describe('repli sur Mapbox quand le quota ORS est épuisé', () => {
  beforeEach(() => {
    // Compteur du jour au plafond ORS → underCap('ors') renvoie false.
    mockStockage = JSON.stringify({ day: jour(), mapbox: 0, ors: DAILY_CAPS.ors });
    jest.resetModules();
  });

  test('bascule sur Mapbox et respecte le contrat de multiRoute', async () => {
    const urls = [];
    global.fetch = jest.fn(async (url) => {
      urls.push(String(url));
      return reponseMapbox(4);
    });

    // Coordonnées uniques : le cache mémoire ne doit pas court-circuiter l'appel.
    const wp = [[2.1, 48.1], [2.2, 48.2], [2.3, 48.3], [2.4, 48.4]];
    const r = await multiRoute(wp, 'foot-walking');

    // ORS n'a pas été appelé du tout : le plafond local coupe avant le réseau.
    expect(urls.every((u) => !u.includes('openrouteservice'))).toBe(true);
    expect(urls.some((u) => u.includes('api.mapbox.com/directions'))).toBe(true);
    // Profil traduit : ORS dit « foot-walking », Mapbox dit « walking ».
    expect(urls[0]).toContain('/mapbox/walking/');

    // Contrat identique à celui d'ORS, sans quoi la Chasse ne peut plus ajuster
    // sa boucle au budget.
    expect(Array.isArray(r.coords)).toBe(true);
    expect(r.coords.length).toBeGreaterThan(1);
    expect(typeof r.durationMin).toBe('number');
    expect(r.legsMin).toHaveLength(wp.length - 1);
    for (const m of r.legsMin) expect(m).toBeCloseTo(5, 5);
  });

  test('le jeton n’apparaît jamais dans une valeur renvoyée', async () => {
    global.fetch = jest.fn(async () => reponseMapbox(3));
    const r = await multiRoute([[3.1, 47.1], [3.2, 47.2], [3.3, 47.3]], 'cycling-regular');
    expect(JSON.stringify(r)).not.toContain('jeton-test');
  });
});
