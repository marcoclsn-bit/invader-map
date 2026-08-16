const fs = require('fs');
const path = require('path');

/**
 * Garde contre un renommage silencieux de prop par react-native-maps.
 *
 * Passer une prop qui n'existe plus ne lève RIEN : pas d'erreur, pas
 * d'avertissement. Le composant l'ignore, et le comportement qu'elle réglait
 * revient à sa valeur par défaut. C'est arrivé à la montée en 1.29 :
 * `showsPointsOfInterest` est devenu `showsPointsOfInterests`, sans
 * rétrocompatibilité, et les jardins, zoos et musées d'Apple Maps sont
 * réapparus par-dessus les Invaders sur le premier build.
 *
 * J'avais pourtant vérifié « les props qu'on utilise existent-elles encore ».
 * Ma liste était incomplète et ma recherche trop lâche — elle cherchait le mot
 * n'importe où dans le paquet, ce qui trouvait la prop dans une phrase de
 * documentation qui expliquait justement qu'elle avait changé de nom.
 */
const RACINE = path.join(__dirname, '..');
const PAQUET = path.join(RACINE, 'node_modules', 'react-native-maps', 'src');

/** Noms de props déclarés par le paquet, spec native ET enveloppe TypeScript. */
function propsConnues() {
  const noms = new Set(['ref', 'style', 'key', 'children']);
  const fichiers = [];
  const parcourir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(e.name)) fichiers.push(p);
    }
  };
  parcourir(PAQUET);
  for (const f of fichiers) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)) noms.add(m[1]);
  }
  return noms;
}

/** Props réellement passées aux composants de carte, dans nos écrans. */
function propsPassees() {
  const ecrans = ['screens/MapScreen.js', 'screens/TrajetScreen.js',
    'screens/ChasseScreen.js', 'components/HeadingCone.js'];
  const trouvees = [];
  for (const rel of ecrans) {
    const src = fs.readFileSync(path.join(RACINE, rel), 'utf8');
    for (const comp of ['MapView', 'Marker', 'Polyline', 'Polygon', 'Callout']) {
      for (const m of src.matchAll(new RegExp(`<${comp}\\b`, 'g'))) {
        const suite = src.slice(m.index + m[0].length, m.index + 1200);
        const fin = suite.indexOf('>');
        const bloc = suite.slice(0, fin > 0 ? fin : 1200);
        for (const p of bloc.matchAll(/\n\s+([a-zA-Z][a-zA-Z0-9]*)=/g)) {
          trouvees.push({ fichier: rel, composant: comp, prop: p[1] });
        }
      }
    }
  }
  return trouvees;
}

describe('props de react-native-maps', () => {
  test('le paquet est bien lisible', () => {
    expect(fs.existsSync(PAQUET)).toBe(true);
    expect(propsConnues().size).toBeGreaterThan(80);
  });

  test('toutes les props que nous passons existent encore', () => {
    const connues = propsConnues();
    const inconnues = propsPassees()
      .filter((x) => !connues.has(x.prop))
      .map((x) => `${x.composant}.${x.prop} (${x.fichier})`);
    expect([...new Set(inconnues)]).toEqual([]);
  });

  test('les points d’intérêt d’Apple Maps sont masqués sur les trois cartes', () => {
    // Régression vécue : sans cette prop, la carte se couvre de jardins et de
    // zoos qui noient les Invaders.
    for (const f of ['screens/MapScreen.js', 'screens/TrajetScreen.js', 'screens/ChasseScreen.js']) {
      const src = fs.readFileSync(path.join(RACINE, f), 'utf8');
      expect(src).toMatch(/showsPointsOfInterests=\{false\}/);
    }
  });
});
