import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from 'react-native';

/**
 * Donut de progression avec le % au centre.
 * @param {number} pct        0–100
 * @param {number} size       diamètre en px (défaut 44)
 * @param {number} stroke     épaisseur de l'anneau
 * @param {string} color      couleur de l'arc rempli
 * @param {string} trackColor couleur de l'anneau de fond
 * @param {string} textColor  couleur du % central
 */
export default function DonutChart({
  pct = 0, size = 44, stroke = 5, color, trackColor, textColor,
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Anneau de fond */}
        <Circle cx={center} cy={center} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {/* Arc de progression (départ en haut, sens horaire) */}
        {dash > 0 && (
          <Circle
            cx={center} cy={center} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}  /* départ à 12 h, sens horaire */
          />
        )}
      </Svg>
      <Text
        style={{
          position: 'absolute',
          fontSize: size <= 46 ? 11 : 13,
          fontWeight: '700',
          color: textColor,
        }}
      >
        {Math.round(clamped)}%
      </Text>
    </View>
  );
}
