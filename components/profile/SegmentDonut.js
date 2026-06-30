import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * Donut multi-segments (≠ DonutChart qui est mono-arc de progression).
 *
 * @param {{value:number,color:string}[]} segments
 * @param {number} size      diamètre px
 * @param {number} stroke    épaisseur de l'anneau
 * @param {string} trackColor anneau de fond (si total = 0)
 * @param {string} centerLabel grand texte central
 * @param {string} centerSub   petit texte sous le grand
 * @param {string} textColor / subColor
 */
export default function SegmentDonut({
  segments = [], size = 130, stroke = 16, trackColor = '#283430',
  centerLabel, centerSub, textColor = '#ECF6F0', subColor = '#8FA39A',
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);

  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Anneau de fond toujours présent */}
        <Circle cx={center} cy={center} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {total > 0 && segments.map((seg, i) => {
          const frac = (seg.value || 0) / total;
          if (frac <= 0) return null;
          const dash = frac * c;
          const offset = -acc * c;
          acc += frac;
          return (
            <Circle
              key={i}
              cx={center} cy={center} r={r}
              stroke={seg.color} strokeWidth={stroke} fill="none"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${center} ${center})`}
            />
          );
        })}
      </Svg>
      {(centerLabel != null || centerSub != null) && (
        <View style={styles.center} pointerEvents="none">
          {centerLabel != null && <Text style={[styles.label, { color: textColor }]}>{centerLabel}</Text>}
          {centerSub != null && <Text style={[styles.sub, { color: subColor }]}>{centerSub}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 11, marginTop: 2 },
});
