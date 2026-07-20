import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { useGamification } from '../../context/GamificationContext';
import { useAppContext } from '../../context/AppContext';
import { BADGE_CATEGORIES, completedCityCodes } from '../../data/badges';
import { CITIES } from '../../cities/registry';

// Galerie « Trophées » — catégories dépliables, secrets masqués (« ??? »),
// grille dynamique des villes terminées en bas.
export default function BadgeGallery() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { badges, unlockedCount, totalBadges } = useGamification();
  const { getFlashHistory, cityIndex, cityProgress } = useAppContext();

  // Badges groupés par catégorie (ordre des définitions conservé)
  const byCategory = useMemo(() => {
    const m = new Map(BADGE_CATEGORIES.map((c) => [c, []]));
    for (const b of badges) (m.get(b.category) ?? m.get('secret')).push(b);
    return m;
  }, [badges]);

  // La 1re catégorie contenant un badge débloqué est ouverte par défaut.
  const [open, setOpen] = useState(() => {
    const first = BADGE_CATEGORIES.find((c) =>
      badges.some((b) => b.category === c && b.unlockedAt)
    );
    return new Set([first ?? BADGE_CATEGORIES[0]]);
  });
  const toggle = (c) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  // Villes terminées (mini-trophées dynamiques)
  const doneCities = useMemo(() => {
    const codes = completedCityCodes({
      flashHistory: getFlashHistory(), cityIndex, cityProgress,
    });
    return [...codes]
      .map((code) => ({ code, name: CITIES[code]?.name ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [getFlashHistory, cityIndex, cityProgress]);
  const [citiesOpen, setCitiesOpen] = useState(true);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textSecondary }]}>{t('badges.gallery.title').toUpperCase()}</Text>
        <Text style={[styles.count, { color: theme.accent }]}>{unlockedCount}/{totalBadges}</Text>
      </View>

      {unlockedCount === 0 && (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('badges.gallery.empty')}</Text>
      )}

      {BADGE_CATEGORIES.map((cat) => {
        const list = byCategory.get(cat) ?? [];
        if (!list.length) return null;
        const got = list.filter((b) => b.unlockedAt).length;
        const isOpen = open.has(cat);
        return (
          <View key={cat} style={[styles.section, { borderColor: theme.border }]}>
            <TouchableOpacity style={styles.sectionHead} onPress={() => toggle(cat)} activeOpacity={0.7}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                {t(`badges.category.${cat}`)}
              </Text>
              <View style={styles.sectionRight}>
                <Text style={[styles.sectionCount, { color: got === list.length ? theme.accent : theme.textSecondary }]}>
                  {got}/{list.length}
                </Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.grid}>
                {list.map((b) => {
                  const on = !!b.unlockedAt;
                  const hidden = cat === 'secret' && !on; // secrets masqués tant que verrouillés
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
                          name={on ? b.iconName : hidden ? 'help' : 'lock-closed'}
                          size={22}
                          color={on ? theme.accent : theme.textSecondary}
                        />
                      </View>
                      <Text
                        style={[styles.tileTitle, { color: on ? theme.textPrimary : theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {hidden ? '???' : t(`badges.${b.id}.title`)}
                      </Text>
                      <Text style={[styles.tileDesc, { color: theme.textSecondary, opacity: on ? 0.7 : 1 }]} numberOfLines={2}>
                        {hidden ? t('badges.locked') : t(`badges.${b.id}.desc`)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {/* ── Salle des trophées : une plaque par ville terminée ── */}
      {doneCities.length > 0 && (
        <View style={[styles.section, { borderColor: theme.border }]}>
          <TouchableOpacity style={styles.sectionHead} onPress={() => setCitiesOpen(!citiesOpen)} activeOpacity={0.7}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
              {t('badges.citiesDone.title')}
            </Text>
            <View style={styles.sectionRight}>
              <Text style={[styles.sectionCount, { color: theme.accent }]}>{doneCities.length}</Text>
              <Ionicons name={citiesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>
          {citiesOpen && (
            <View style={styles.cityWrap}>
              {doneCities.map((c) => (
                <View key={c.code} style={[styles.cityPlate, { borderColor: theme.accent, backgroundColor: theme.accentDim }]}>
                  <Ionicons name="trophy" size={13} color={theme.accent} />
                  <Text style={[styles.cityPlateText, { color: theme.accent }]} numberOfLines={1}>{c.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  count: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 13, lineHeight: 20, fontStyle: 'italic', marginBottom: 10 },

  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700' },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionCount: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 6 },
  tile: { width: '33.33%', alignItems: 'center', paddingHorizontal: 4, marginBottom: 16 },
  iconRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  tileDesc: { fontSize: 10, textAlign: 'center', marginTop: 3, lineHeight: 13 },

  cityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 10 },
  cityPlate: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  cityPlateText: { fontSize: 12, fontWeight: '700' },
});
