import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

const THUMB = 28;
const TRACK_H = 8;
const ALIEN = require('../../assets/markers/alien_flashed.png');

/**
 * Axe de profil (affichage seul) : titre, piste avec curseur alien à `value`%,
 * et deux pôles (gauche/droite). Verrouillé si `available` est faux.
 * Un « i » déplie une explication (`info`).
 *
 * @param {string} label     titre de l'axe (ex. « Rareté »)
 * @param {number} value     0–100
 * @param {boolean} available données suffisantes ?
 * @param {string} lowLabel  pôle gauche (ex. « Collecteur »)
 * @param {string} highLabel pôle droit (ex. « Sniper »)
 * @param {string} lockedHint message d'état vide
 * @param {string} info       explication affichée au tap sur le « i »
 */
export default function HunterSlider({ label, value = 0, available = true, lowLabel, highLabel, lockedHint, info }) {
  const { theme } = useTheme();
  const [showInfo, setShowInfo] = useState(false);
  const pct = Math.max(0, Math.min(100, value));

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.labelGroup}>
          <Text style={[styles.axisLabel, { color: theme.textPrimary }]}>{label}</Text>
          {info ? (
            <TouchableOpacity
              onPress={() => setShowInfo((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={label}
            >
              <Ionicons
                name={showInfo ? 'information-circle' : 'information-circle-outline'}
                size={16}
                color={showInfo ? theme.accent : theme.textSecondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
        {available
          ? <Text style={[styles.valueText, { color: theme.accent }]}>{Math.round(pct)}</Text>
          : <Ionicons name="lock-closed" size={13} color={theme.textSecondary} />}
      </View>

      {showInfo && info ? (
        <View style={[styles.infoBox, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>{info}</Text>
        </View>
      ) : null}

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
  labelGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  axisLabel: { fontSize: 14, fontWeight: '600' },
  valueText: { fontSize: 13, fontWeight: '700' },
  infoBox: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginBottom: 10 },
  infoText: { fontSize: 12, lineHeight: 17 },
  track: {
    height: TRACK_H, borderRadius: TRACK_H / 2, borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'stretch',
  },
  // Enfant flex à hauteur explicite (comme la ProgressBar du Palmarès) : largeur en %.
  // L'ancienne version absolue (top/bottom + width %) ne se rendait pas sur Android.
  fill: { height: TRACK_H, borderRadius: TRACK_H / 2 },
  thumbWrap: { position: 'absolute', width: 0, alignItems: 'center', top: (TRACK_H - THUMB) / 2 },
  thumb: { width: THUMB, height: THUMB, marginLeft: -THUMB / 2 },
  poleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  pole: { fontSize: 11, flex: 1 },
  poleRight: { textAlign: 'right' },
  lockedHint: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
});
