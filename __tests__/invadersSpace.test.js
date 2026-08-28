const {
  SPACE_INVADERS, SPACE_CITY_META, SPACE_CITY_CODE, memeInvader,
} = require('../data/invadersSpace');

describe('Espace / ISS — les deux mosaïques hors du sol', () => {
  test('les identifiants sont EXACTEMENT ceux de la source amont', () => {
    // La synchro FlashInvaders compare les identifiants verbatim : les renommer
    // romprait silencieusement la reconnaissance des flashs importés.
    expect(SPACE_INVADERS.map((i) => i.id)).toEqual(['SPACE_01', 'SPACE_02']);
  });

  test('aucune des deux n\'a de coordonnées, et surtout pas zéro', () => {
    // 0 serait une position valide, au large du golfe de Guinée : une épingle
    // apparaîtrait en plein océan.
    for (const inv of SPACE_INVADERS) {
      expect(inv.lat).toBeNull();
      expect(inv.lng).toBeNull();
    }
  });

  test('statuts et points repris de la source, pas réinventés', () => {
    const parId = Object.fromEntries(SPACE_INVADERS.map((i) => [i.id, i]));
    expect(parId.SPACE_01.status).toBe('hidden');
    expect(parId.SPACE_01.points).toBe(0);
    expect(parId.SPACE_02.status).toBe('ok');
    expect(parId.SPACE_02.points).toBe(100);
  });

  test('la ville n\'a ni centre ni cadre : elle n\'est pas cartographiable', () => {
    expect(SPACE_CITY_META.code).toBe(SPACE_CITY_CODE);
    expect(SPACE_CITY_META.center).toBeNull();
    expect(SPACE_CITY_META.bbox).toBeNull();
    expect(SPACE_CITY_META.count).toBe(2);
    expect(SPACE_CITY_META.destroyed).toBe(1); // SPACE_01 n'existe plus
  });

  test('la comparaison ignore les espaces — la source écrit « SPACE_01 »', () => {
    expect(memeInvader('SPACE_01 ', 'SPACE_01')).toBe(true);
    expect(memeInvader(' SPACE_02', 'SPACE_02')).toBe(true);
    expect(memeInvader('SPACE_01', 'SPACE_02')).toBe(false);
    expect(memeInvader(null, undefined)).toBe(true);
  });
});

describe('registre des villes', () => {
  const { CITIES, ENABLED_CITIES, MAPPABLE_CITIES } = require('../cities/registry');

  test('l\'Espace est une ville à part entière', () => {
    expect(CITIES.SPACE).toBeDefined();
    expect(CITIES.SPACE.name).toBe('Espace / ISS');
    expect(ENABLED_CITIES.some((c) => c.code === 'SPACE')).toBe(true);
  });

  test('mais elle est exclue des villes cartographiables', () => {
    expect(CITIES.SPACE.mappable).toBe(false);
    expect(MAPPABLE_CITIES.some((c) => c.code === 'SPACE')).toBe(false);
    expect(MAPPABLE_CITIES.length).toBe(ENABLED_CITIES.length - 1);
  });

  test('toutes les autres villes restent cartographiables et gardent leur bbox', () => {
    for (const c of MAPPABLE_CITIES) {
      expect(c.mappable).toBe(true);
      expect(c.bbox).not.toBeNull();
      expect(c.center).not.toBeNull();
    }
  });
});
