// theme/mapStyle.js — style Google Maps sombre (ANDROID uniquement).
//
// Sur iOS on utilise mapType="mutedStandard" + userInterfaceStyle (Apple Maps).
// Google Maps (Android) ignore ces props → sans customMapStyle, la carte serait
// claire standard et casserait l'identité sombre/néon de l'app.
// `customMapStyle` est ignoré par Apple Maps → aucun impact iOS.
//
// Rendu épuré (POI/transports masqués) proche du "mutedStandard" iOS.

export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0b0f0e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8fa39a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f0e' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#283430' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6e7e78' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4a44' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1614' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#131a18' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#283430' }] },
];

// Thème clair : on laisse le style Google standard (tableau vide = défaut).
export const LIGHT_MAP_STYLE = [];
