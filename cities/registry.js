/**
 * cities/registry.js
 *
 * Registre des villes disponibles dans l'app.
 * Activer une ville = ajouter un bloc + passer enabled: true.
 * Ajouter des subdivisions = mettre subdivisionsKey + déposer le GeoJSON dans data/.
 */

export const CITIES = {
  PA: {
    code: 'PA',
    name: 'Paris',
    center: { lat: 48.8566, lng: 2.3522 },
    mapDelta: { latitudeDelta: 0.12, longitudeDelta: 0.12 },
    bbox: { minLat: 48.50, maxLat: 49.10, minLng: 1.90, maxLng: 3.00 },
    orsCountry: 'boundary.country=FR',
    subdivisionsKey: 'paris-arrondissements',
    enabled: true,
  },
  // LDN: {
  //   code: 'LDN',
  //   name: 'London',
  //   center: { lat: 51.5074, lng: -0.1278 },
  //   mapDelta: { latitudeDelta: 0.12, longitudeDelta: 0.12 },
  //   bbox: { minLat: 51.28, maxLat: 51.70, minLng: -0.55, maxLng: 0.35 },
  //   orsCountry: 'boundary.country=GB',
  //   subdivisionsKey: null,
  //   enabled: false,
  // },
};

export const ENABLED_CITIES = Object.values(CITIES).filter(c => c.enabled);
export const DEFAULT_CITY_CODE = 'PA';
