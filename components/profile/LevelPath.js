import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { MAX_LEVEL } from '../../utils/hunterProfile';

// Rangs (mêmes seuils que computeXpLevel) : nœud = début du rang.
const TIERS = [
  { key: 'novice', from: 1 },
  { key: 'scout', from: 10 },
  { key: 'hunter', from: 20 },
  { key: 'veteran', from: 30 },
  { key: 'master', from: 40 },
  { key: 'legend', from: 47 },
];

/**
 * « Parcours du chasseur » : le niveau vu comme un chemin à travers les 6 rangs.
 * Rangs passés remplis, position courante marquée d'un point lumineux, rangs
 * futurs grisés. Un « i » explique comment l'XP se gagne.
 * @param {{level:number,progress:number,xpRemaining:number,isMax:boolean}} level
 */
export default function LevelPath({ level }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  if (!level) return null;

  const n = TIERS.length;
  const tierIdx = TIERS.reduce((acc, tr, i) => (level.level >= tr.from ? i : acc), 0);
  const from = TIERS[tierIdx].from;
  const to = tierIdx + 1 < n ? TIERS[tierIdx + 1].from : MAX_LEVEL + 1;
  const within = Math.min(1, (level.level - from + level.progress) / (to - from));
  // Position sur la piste : nœuds répartis uniformément (0 → n-1) ;
  // le marqueur avance à l'intérieur du segment [rang courant → rang suivant].
  const posPct = Math.min(100, ((tierIdx + within) / (n - 1)) * 100);

  const nextTier = tierIdx + 1 < n ? TIERS[tierIdx + 1] : null;

  return (
    <View>
      {/* Piste + nœuds */}
      <View style={styles.trackWrap}>
        <View style={[styles.track, { backgroundColor: theme.border }]} />
        <View style={[styles.track, { backgroundColor: theme.accent, width: `${posPct}%` }]} />
        {TIERS.map((tr, i) => {
          const reached = level.level >= tr.from;
          return (
            <View key={tr.key} style={[styles.node, { left: `${(i / (n - 1)) * 100}%` }]}>
              <View style={[
                styles.dot,
                reached
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { backgroundColor: theme.surfaceHigh, borderColor: theme.border },
              ]} />
            </View>
          );
        })}
        {/* Marqueur de position : point lumineux (halo néon) */}
        <View style={[styles.marker, { left: `${posPct}%` }]}>
          <View style={[styles.markerHalo, { backgroundColor: theme.accentDim, borderColor: theme.accentGlow }]} />
          <View style={[styles.markerDot, { backgroundColor: theme.accent, borderColor: theme.bg, shadowColor: theme.accent }]} />
        </View>
      </View>

      {/* Noms des rangs */}
      <View style={styles.labels}>
        {TIERS.map((tr, i) => {
          const reached = level.level >= tr.from;
          const current = i === tierIdx;
          return (
            <Text
              key={tr.key}
              style={[
                styles.label,
                { color: current ? theme.accent : reached ? theme.textPrimary : theme.textSecondary },
                current && { fontWeight: '800' },
                i === 0 && { textAlign: 'left' },
                i === n - 1 && { textAlign: 'right' },
              ]}
              numberOfLines={1}
            >
              {t(`stats.profile.titles.${tr.key}`)}
            </Text>
          );
        })}
      </View>

      {/* Ligne d'info : prochain niveau + prochain rang, et « c'est quoi l'XP ? » */}
      <View style={styles.infoRow}>
        <Text style={[styles.info, { color: theme.textSecondary }]}>
          {level.isMax
            ? t('stats.path.maxed')
            : nextTier
              ? t('stats.path.info', {
                  next: level.level + 1, remaining: level.xpRemaining,
                  tier: t(`stats.profile.titles.${nextTier.key}`), tierLevel: nextTier.from,
                })
              : t('stats.path.infoNoTier', { next: level.level + 1, remaining: level.xpRemaining })}
        </Text>
        <TouchableOpacity onPress={() => setShowInfo(!showInfo)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons
            name={showInfo ? 'information-circle' : 'information-circle-outline'}
            size={16}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {showInfo && (
        <View style={[styles.infoBox, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>{t('stats.path.xpInfo')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trackWrap: { height: 26, justifyContent: 'center', marginHorizontal: 10, marginTop: 6 },
  track: { position: 'absolute', left: 0, right: undefined, height: 5, borderRadius: 3, width: '100%' },
  node: { position: 'absolute', marginLeft: -6 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  marker: { position: 'absolute', marginLeft: -11, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  markerHalo: { position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 1 },
  markerDot: {
    width: 14, height: 14, borderRadius: 7, borderWidth: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4,
  },
  labels: { flexDirection: 'row', marginTop: 6 },
  label: { flex: 1, fontSize: 8.5, textAlign: 'center', letterSpacing: 0.2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  info: { fontSize: 12, textAlign: 'center' },
  infoBox: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginTop: 8 },
  infoText: { fontSize: 12, lineHeight: 17 },
});
