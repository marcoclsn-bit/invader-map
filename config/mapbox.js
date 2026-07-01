// Token public Mapbox (pk.*).
// Fourni via la variable d'environnement EXPO_PUBLIC_MAPBOX_TOKEN :
//   - en local : fichier .env.local (gitignoré)
//   - en build : variables d'environnement EAS (profil production/preview/development)
// Token côté client : inliné par Metro au build. Ce fichier ne contient AUCUN secret,
// il peut donc être committé (nécessaire pour que l'import se résolve dans les builds
// EAS archivés depuis git).
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
