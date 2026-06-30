// Avatars pixel-art par défaut — réutilisent les aliens du jeu (aucun module natif).
// `key` est ce qu'on stocke en local ; `source` est l'image.
export const AVATARS = [
  { key: 'flashed',   source: require('../../assets/markers/alien_flashed.png') },
  { key: 'ok',        source: require('../../assets/markers/alien_ok.png') },
  { key: 'damaged',   source: require('../../assets/markers/alien_damaged.png') },
  { key: 'unknown',   source: require('../../assets/markers/alien_unknown.png') },
  { key: 'destroyed', source: require('../../assets/markers/alien_destroyed.png') },
];

export const DEFAULT_AVATAR_KEY = 'flashed';

export function avatarSource(key) {
  return (AVATARS.find((a) => a.key === key) ?? AVATARS[0]).source;
}
