import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

const THUMB = 28;
const TRACK_H = 8;
const ALIEN = require('../../assets/markers/alien_flashed.png');

/**
 * Axe de profil (affichage seul) : titre, piste avec curseur alien à `value`%,
 * et deux pôles (gauche/droite). Verrouillé si `available` est faux.
 *
 * @param {string} label     titre de l'axe (ex. « Rareté »)
 * @param {number} value     0–100
 * @param {boolean} available données suffisantes ?
 * @param {string} lowLabel  pôle gauche (ex. « Collecteur »)
 * @param {string} highLabel pôle droit (ex. « Sniper »)
 * @param {string} lockedHint message d'état vide
 */
export default function HunterSlider({ label, value = 0, available = true, lowLabel, highLabel, lockedHint }) {
  const { theme } = useTheme();
  const pct = Math.max(0, Math.min(100, value));

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.axisLabel, { color: theme.textPrimary }]}>{label}</Text>
        {available
          ? <Text style={[styles.valueText, { color: theme.accent }]}>{Math.round(pct)}</Text>
          : <Ionicons name="lock-closed" size={13} color={theme.textSecondary} />}
      </View>

      <View style={[styles.track, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
        {available && (
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.accentDim }]} />
        )}
        {available && (
          <View style={[styles.thumbWrap, { left: `${pct}%` }]}>
            <Image source={ALIEN} style={styles.thumb} resizeMode="contain" />
          </View>
        )}
      </View>

      {available ? (
        <View style={styles.poleRow}>
          <Text style={[styles.pole, { color: pct <= 40 ? theme.accent : theme.textSecondary }]} numberOfLines={1}>{lowLabel}</Text>
          <Text style={[styles.pole, styles.poleRight, { color: pct >= 60 ? theme.accent : theme.textSecondary }]} numberOfLines={1}>{highLabel}</Text>
        </View>
      ) : (
        <Text style={[styles.lockedHint, { color: theme.textSecondary }]} numberOfLines={2}>{lockedHint}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  axisLabel: { fontSize: 14, fontWeight: '600' },
  valueText: { fontSize: 13, fontWeight: '700' },
  track: {
    height: TRACK_H, borderRadius: TRACK_H / 2, borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: TRACK_H / 2 },
  thumbWrap: { position: 'absolute', width: 0, alignItems: 'center', top: (TRACK_H - THUMB) / 2 },
  thumb: { width: THUMB, height: THUMB, marginLeft: -THUMB / 2 },
  poleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  pole: { fontSize: 11, flex: 1 },
  poleRight: { textAlign: 'right' },
  lockedHint: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
});
