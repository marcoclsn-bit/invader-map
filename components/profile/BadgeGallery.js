import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { useGamification } from '../../context/GamificationContext';

// Galerie « Mes Badges » — obtenus colorés, verrouillés grisés avec indice.
export default function BadgeGallery() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { badges, unlockedCount, totalBadges } = useGamification();

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textSecondary }]}>{t('badges.gallery.title').toUpperCase()}</Text>
        <Text style={[styles.count, { color: theme.accent }]}>{unlockedCount}/{totalBadges}</Text>
      </View>

      {unlockedCount === 0 && (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('badges.gallery.empty')}</Text>
      )}

      <View style={styles.grid}>
        {badges.map((b) => {
          const on = !!b.unlockedAt;
          return (
            <View key={b.id} style={styles.tile}>
              <View
                style={[
                  styles.iconRing,
                  on
                    ? { borderColor: theme.accent, backgroundColor: theme.accentDim }
                    : { borderColor: theme.border, backgroundColor: theme.surfaceHigh },
                ]}
              >
                <Ionicons
                  name={on ? b.iconName : 'lock-closed'}
                  size={22}
                  color={on ? theme.accent : theme.textSecondary}
                />
              </View>
              <Text
                style={[styles.tileTitle, { color: on ? theme.textPrimary : theme.textSecondary }]}
                numberOfLines={1}
              >
                {t(`badges.${b.id}.title`)}
              </Text>
              <Text style={[styles.tileDesc, { color: theme.textSecondary, opacity: on ? 0.7 : 1 }]} numberOfLines={2}>
                {t(`badges.${b.id}.desc`)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  count: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 13, lineHeight: 20, fontStyle: 'italic', marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: '33.33%', alignItems: 'center', paddingHorizontal: 4, marginBottom: 16 },
  iconRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  tileDesc: { fontSize: 10, textAlign: 'center', marginTop: 3, lineHeight: 13 },
});
