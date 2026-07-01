import { Image } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Logo InvaderQuest — une seule source, lisible sur fond clair ET sombre
// (le logo a son propre fond). Pour le remplacer : écraser ce fichier dans assets/.
// ─────────────────────────────────────────────────────────────────────────────
const LOGO = require('../assets/LogoFinal.png');

/**
 * <Logo /> — affiche le logo InvaderQuest, indépendant du thème.
 * @param {number} size  côté en px (le logo est carré). Défaut 40.
 * @param {object} style style additionnel éventuel.
 */
export default function Logo({ size = 40, style }) {
  return (
    <Image
      source={LOGO}
      style={[{ width: size, height: size, borderRadius: size * 0.22 }, style]}
      resizeMode="cover"
      fadeDuration={0}
    />
  );
}
