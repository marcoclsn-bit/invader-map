// Clé API OpenRouteService.
// Fournie via la variable d'environnement EXPO_PUBLIC_ORS_API_KEY :
//   - en local : fichier .env.local (gitignoré)
//   - en build : variables d'environnement EAS (profil production/preview/development)
// Clé côté client : inlinée par Metro au moment du build. Ce fichier ne contient
// AUCUN secret, il peut donc être committé (nécessaire pour que l'import se résolve
// dans les builds EAS archivés depuis git).
export const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY ?? '';
