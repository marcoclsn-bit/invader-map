// ─── Design tokens — palette sombre (défaut) et claire ────────────────────────
//
// Pour ajouter une couleur :
//   1. Ajoute un champ dans `dark` ET dans `light`
//   2. Utilise-le via `const { theme } = useTheme()` → theme.monToken
//
// Conventions :
//   bg / surface / surfaceHigh  → fonds (du plus sombre au plus clair)
//   border                      → séparateurs et hairlines
//   textPrimary / textSecondary → texte
//   accent                      → couleur principale interactive (vert néon en sombre)
//   accentGlow / accentDim      → variantes de l'accent pour halos et fonds teintés
//   status*                     → marqueurs Invaders
//   tabBarBg / tabBarBorder     → barre d'onglets
//   destructive / link          → actions

export const dark = {
  // Fonds
  bg:            '#0B0F0E',
  surface:       '#131A18',
  surfaceHigh:   '#1C2622',
  border:        '#283430',

  // Texte
  textPrimary:   '#ECF6F0',
  textSecondary: '#8FA39A',

  // Accent néon
  accent:        '#3DF96B',
  accentGlow:    'rgba(61,249,107,0.45)',
  accentDim:     'rgba(61,249,107,0.12)',

  // Statuts Invaders
  statusOk:        '#00E08A',   // teal — ne pas confondre avec l'accent
  statusDamaged:   '#FFB02E',   // amber
  statusDestroyed: '#FF4D4D',   // rouge
  statusUnknown:   '#7A8A82',   // gris

  // Navigation
  tabBarBg:     '#0F1614',
  tabBarBorder: '#1E2A26',

  // Actions
  destructive: '#FF4D4D',
  link:        '#3DF96B',

  // Score arcade (flash +PTS) — jaune chaud, lisible sur n'importe quel fond
  accentScore: '#FFD23F',
};

export const light = {
  // Fonds
  bg:            '#F2F2F7',
  surface:       '#FFFFFF',
  surfaceHigh:   '#F0F4F2',
  border:        '#D8E0DC',

  // Texte
  textPrimary:   '#1C1C1E',
  textSecondary: '#6E7E78',

  // Accent (vert lisible sur blanc)
  accent:        '#00A86B',
  accentGlow:    'rgba(0,168,107,0.30)',
  accentDim:     'rgba(0,168,107,0.12)',

  // Statuts Invaders
  statusOk:        '#00897B',
  statusDamaged:   '#C68B00',
  statusDestroyed: '#C0392B',
  statusUnknown:   '#7A8A82',

  // Navigation
  tabBarBg:     '#FFFFFF',
  tabBarBorder: '#E5E5EA',

  // Actions
  destructive: '#FF3B30',
  link:        '#007AFF',

  // Score arcade (flash +PTS) — même jaune, lisible sur fond clair aussi
  accentScore: '#CC9900',
};

export const THEMES = { dark, light };

// ─── Échelle typographique ────────────────────────────────────────────────────
//
// Règle : arcade uniquement sur les titres courts et les chiffres isolés.
// Corps, hints, erreurs, longues chaînes → police système (undefined = défaut).
//
//   arcadeTitle   → titres d'écran, nom de ville/arrondissement (Silkscreen Bold)
//   arcadeHeading → identifiants Invader dans les panneaux, compteurs (Silkscreen Regular)
//   arcadeScore   → grand score unique (%, total pts) — Press Start 2P, UNE occurrence max par écran
//
export const typography = {
  arcadeTitle:   { fontFamily: 'Silkscreen_700Bold',      fontSize: 17, lineHeight: 26 },
  arcadeHeading: { fontFamily: 'Silkscreen_400Regular',   fontSize: 14, lineHeight: 22 },
  arcadeScore:   { fontFamily: 'PressStart2P_400Regular', fontSize: 15, lineHeight: 28 },
};
