const { rechercherVilles } = require('../utils/villesSearch');

describe('rechercherVilles — recherche locale dans l\'annuaire embarqué', () => {
  test('préfixe : « bordeaux » remonte Bordeaux en tête', () => {
    const r = rechercherVilles('bordeaux');
    expect(r[0].nom).toBe('Bordeaux');
    expect(r[0].label).toMatch(/Nouvelle-Aquitaine/);
    expect(typeof r[0].lat).toBe('number');
    expect(typeof r[0].lng).toBe('number');
  });

  test('insensible aux accents : « orleans » trouve Orléans', () => {
    const noms = rechercherVilles('orleans').map((v) => v.nom);
    expect(noms).toContain('Orléans');
  });

  test('tirets et espaces équivalents : « saint denis » ≈ « saint-denis »', () => {
    const a = rechercherVilles('saint denis').map((v) => v.nom);
    const b = rechercherVilles('saint-denis').map((v) => v.nom);
    expect(a).toEqual(b);
    expect(a).toContain('Saint-Denis');
  });

  test('début de mot : « denis » fait surgir un Saint-Denis', () => {
    const noms = rechercherVilles('denis', 30).map((v) => v.nom);
    expect(noms.some((n) => /Denis/.test(n))).toBe(true);
  });

  test('homonymes départagés par population : Paris (Île-de-France) avant Paris (Texas)', () => {
    const paris = rechercherVilles('paris', 10).filter((v) => v.nom === 'Paris');
    expect(paris.length).toBeGreaterThanOrEqual(1);
    expect(paris[0].label).toBe('Île-de-France');
  });

  test('international : Tokyo et New York sont dans l\'annuaire', () => {
    expect(rechercherVilles('tokyo')[0].nom).toBe('Tokyo');
    expect(rechercherVilles('new york').some((v) => /New York/.test(v.nom))).toBe(true);
  });

  test('garde-fous : moins de 2 caractères → aucun résultat', () => {
    expect(rechercherVilles('')).toEqual([]);
    expect(rechercherVilles('p')).toEqual([]);
    expect(rechercherVilles(null)).toEqual([]);
  });

  test('la limite est respectée', () => {
    expect(rechercherVilles('sa', 5).length).toBeLessThanOrEqual(5);
  });
});
