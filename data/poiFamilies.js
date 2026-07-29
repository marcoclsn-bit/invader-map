// Familles de lieux d'intérêt.
//
// Les données portent 12 `theme` (museums, religious, palaces, monuments, water,
// parks, streets, stages, tables, shops, culture, other) qui restent le niveau
// fin, affiché sur la fiche d'un lieu via `hunt.poiTheme.*`.
//
// Douze cases à cocher, c'est trop pour un sélecteur. On regroupe donc en sept
// familles équilibrées (56 à 122 lieux à Paris), seul niveau exposé à
// l'utilisateur. Les libellés et descriptions vivent dans `locales/*.json`
// sous `poi.family.*`.

export const POI_FAMILIES = [
  { key: 'museums',   themes: ['museums', 'culture'],            icon: 'color-palette-outline' },
  { key: 'monuments', themes: ['monuments', 'palaces'],          icon: 'business-outline' },
  { key: 'religious', themes: ['religious'],                     icon: 'home-outline' },
  { key: 'nature',    themes: ['parks', 'water'],                icon: 'leaf-outline' },
  { key: 'streets',   themes: ['streets'],                       icon: 'trail-sign-outline' },
  { key: 'nightlife', themes: ['stages', 'tables', 'shops'],     icon: 'wine-outline' },
  { key: 'misc',      themes: ['other'],                         icon: 'ellipsis-horizontal-outline' },
];

export const ALL_POI_FAMILIES = POI_FAMILIES.map(f => f.key);

// theme → famille (index inverse, construit une fois)
const FAMILY_OF_THEME = POI_FAMILIES.reduce((acc, f) => {
  for (const t of f.themes) acc[t] = f.key;
  return acc;
}, {});

/** Famille d'un lieu ; 'misc' si le thème est inconnu (donnée plus récente que le code). */
export function familyOf(poi) {
  return FAMILY_OF_THEME[poi?.theme] ?? 'misc';
}

/** true si le lieu appartient à l'une des familles retenues. */
export function inFamilies(poi, families) {
  return families?.has(familyOf(poi)) ?? false;
}
