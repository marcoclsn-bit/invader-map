import { View, Text, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { MAX_LEVEL } from '../../utils/hunterProfile';

const ALIEN = require('../../assets/markers/alien_flashed.png');

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
 * Rangs passés remplis, alien positionné sur le rang courant, rangs futurs grisés.
 * @param {{level:number,progress:number,xpRemaining:number,isMax:boolean}} level
 */
export default function LevelPath({ level }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  if (!level) return null;

  const n = TIERS.length;
  const tierIdx = TIERS.reduce((acc, tr, i) => (level.level >= tr.from ? i : acc), 0);
  // Position de l'alien : interpolation à l'intérieur du segment du rang courant
  const from = TIERS[tierIdx].from;
  const to = tierIdx + 1 < n ? TIERS[tierIdx + 1].from : MAX_LEVEL + 1;
  const within = Math.min(1, (level.level - from + level.progress) / (to - from));
  // Position sur la piste : les nœuds sont répartis uniformément (0 → n-1) ;
  // l'alien avance à l'intérieur du segment [rang courant → rang suivant].
  const posPct = ((tierIdx + within) / (n - 1)) * 100;

  // Prochain rang (pour la ligne d'info)
  const nextTier = tierIdx + 1 < n ? TIERS[tierIdx + 1] : null;

  return (
    <View>
      {/* Piste + nœuds */}
      <View style={styles.trackWrap}>
        <View style={[styles.track, { backgroundColor: theme.border }]} />
        <View style={[styles.track, styles.fill, { backgroundColor: theme.accent, width: `${Math.min(100, posPct)}%` }]} />
        {TIERS.map((tr, i) => {
          const reached = level.level >= tr.from;
          const x = (i / (n - 1)) * 100;
          return (
            <View key={tr.key} style={[styles.node, { left: `${x}%` }]}>
              <View style={[
                styles.dot,
                reached
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { backgroundColor: theme.surfaceHigh, borderColor: theme.border },
              ]} />
            </View>
          );
        })}
        {/* Alien sur la position courante */}
        <View style={[styles.alienWrap, { left: `${Math.min(100, posPct)}%` }]}>
          <Image source={ALIEN} style={styles.alien} resizeMode="contain" />
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

      {/* Ligne d'info : prochain niveau + prochain rang */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  trackWrap: { height: 34, justifyContent: 'center', marginHorizontal: 10, marginTop: 6 },
  track: { position: 'absolute', left: 0, right: 0, height: 5, borderRadius: 3 },
  fill: { right: undefined },
  node: { position: 'absolute', marginLeft: -6 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  alienWrap: { position: 'absolute', marginLeft: -13, top: -4 },
  alien: { width: 26, height: 26 },
  labels: { flexDirection: 'row', marginTop: 2 },
  label: { flex: 1, fontSize: 8.5, textAlign: 'center', letterSpacing: 0.2 },
  info: { fontSize: 12, marginTop: 10, textAlign: 'center' },
});
