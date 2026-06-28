import { Image } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Source unique des deux variantes du logo InvaderQuest.
// Pour les remplacer : écraser ces deux fichiers dans assets/ (même nom).
// ─────────────────────────────────────────────────────────────────────────────
const LOGO_GREEN = require('../assets/Logo_Green.png'); // pour fonds CLAIRS
const LOGO_WHITE = require('../assets/Logo_White.png'); // pour fonds SOMBRES

/**
 * <Logo /> — choisit automatiquement la variante lisible selon le thème, pour ne
 * jamais afficher un logo invisible (blanc sur clair / etc.).
 *   - thème clair  → logo vert  (le blanc serait invisible)
 *   - thème sombre → logo blanc
 * Override possible via `variant="green" | "white"` si le fond est connu
 * (ex. bandeau sombre en thème clair).
 *
 * @param {number} size  côté en px (le logo est carré). Défaut 40.
 */
export default function Logo({ size = 40, variant, style }) {
  const { isDark } = useTheme();
  const source =
    variant === 'green' ? LOGO_GREEN :
    variant === 'white' ? LOGO_WHITE :
    (isDark ? LOGO_WHITE : LOGO_GREEN);

  return (
    <Image
      source={source}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      fadeDuration={0}
    />
  );
}
