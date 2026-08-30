const { genererGpx } = require('../utils/gpx');

const COORDS = [[2.3488, 48.8534], [2.3522, 48.8566], [2.3601, 48.8607]];
const INVADERS = [
  { id: 'PA_0002', lat: 48.8600, lng: 2.3590, hint: 'Angle rue <X> & rue "Y"', along: 1.8 },
  { id: 'PA_0001', lat: 48.8540, lng: 2.3500, along: 0.2 },
];

describe('genererGpx — le trajet vers la montre', () => {
  const gpx = genererGpx({ nom: 'Trajet InvaderQuest', coords: COORDS, invaders: INVADERS, date: '2026-08-30' });

  test('document GPX 1.1 bien formé, avec le nom du parcours', () => {
    expect(gpx).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(gpx).toContain('<gpx version="1.1" creator="InvaderQuest"');
    expect(gpx).toContain('<name>Trajet InvaderQuest</name>');
    expect(gpx.trim().endsWith('</gpx>')).toBe(true);
  });

  test('la trace porte tous les points, en lat/lon (ordre GPX, inverse de GeoJSON)', () => {
    const trkpts = gpx.match(/<trkpt /g) ?? [];
    expect(trkpts.length).toBe(COORDS.length);
    // [2.3488, 48.8534] en GeoJSON doit devenir lat=48.85… lon=2.34…
    expect(gpx).toContain('<trkpt lat="48.853400" lon="2.348800">');
  });

  test('un waypoint par Invader, ordonnés dans le sens de la marche', () => {
    const noms = [...gpx.matchAll(/<wpt[^>]*>\n<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    expect(noms).toEqual(['PA_0001', 'PA_0002']); // along 0.2 avant along 1.8
  });

  test('les indices sont échappés : « & », « < » et guillemets ne cassent pas le XML', () => {
    expect(gpx).toContain('Angle rue &lt;X&gt; &amp; rue &quot;Y&quot;');
    // Aucun & nu en dehors des entités
    expect(gpx.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toContain('&');
  });

  test('garde-fous : tracé vide ou à un seul point → null', () => {
    expect(genererGpx({ nom: 'x', coords: [] })).toBeNull();
    expect(genererGpx({ nom: 'x', coords: [[2, 48]] })).toBeNull();
    expect(genererGpx({ nom: 'x', coords: null })).toBeNull();
  });

  test('un Invader sans coordonnées est écarté, jamais exporté à 0,0', () => {
    const g = genererGpx({
      nom: 'x', coords: COORDS,
      invaders: [{ id: 'SPACE_02', lat: null, lng: null }, INVADERS[1]],
    });
    expect(g).not.toContain('SPACE_02');
    expect(g).toContain('PA_0001');
  });

  test('sans invaders : la trace seule, aucun waypoint', () => {
    const g = genererGpx({ nom: 'x', coords: COORDS });
    expect(g).not.toContain('<wpt');
    expect((g.match(/<trkpt /g) ?? []).length).toBe(3);
  });
});

describe('libellé explicite : la Chasse numérote ses étapes', () => {
  test('`nom` prime sur `id` quand il est fourni', () => {
    const g = genererGpx({
      nom: 'Chasse', coords: COORDS,
      invaders: [
        { id: 'PA_632', lat: 48.8540, lng: 2.3500, nom: '1 · PA_632' },
        { id: 'PA_198', lat: 48.8600, lng: 2.3590, nom: '2 · PA_198' },
      ],
    });
    const noms = [...g.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    expect(noms).toContain('1 · PA_632');
    expect(noms).toContain('2 · PA_198');
  });

  test('sans `along`, l\'ordre fourni est préservé', () => {
    // La Chasse rend ses étapes déjà ordonnées et n'a pas de `along` : un tri
    // qui les réarrangerait casserait la numérotation affichée à l'écran.
    const g = genererGpx({
      nom: 'Chasse', coords: COORDS,
      invaders: [
        { id: 'C', lat: 48.86, lng: 2.36, nom: '1 · C' },
        { id: 'A', lat: 48.85, lng: 2.35, nom: '2 · A' },
        { id: 'B', lat: 48.855, lng: 2.355, nom: '3 · B' },
      ],
    });
    const noms = [...g.matchAll(/<wpt[^>]*>\n<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    expect(noms).toEqual(['1 · C', '2 · A', '3 · B']);
  });
});
