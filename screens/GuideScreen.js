import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { typography } from '../theme/tokens';

// Structure de la page (ordre + icônes cohérentes avec le reste de l'app).
// Les textes viennent de i18n (guide.*), modifiables sans toucher au code.
const GROUPS = [
  { key: 'field', sections: [
    { id: 'carte', icon: 'map' },
    { id: 'chasse', icon: 'trophy', flagship: true },
    { id: 'trajet', icon: 'navigate' },
    { id: 'balade', icon: 'walk' },
  ] },
  { key: 'progress', sections: [
    { id: 'palmares', icon: 'ribbon' },
    { id: 'stats', icon: 'stats-chart' },
    { id: 'news', icon: 'newspaper' },
  ] },
  { key: 'manage', sections: [
    { id: 'flash', icon: 'flash' },
  ] },
];

function Section({ id, icon, flagship, theme, t }) {
  const steps = t(`guide.sections.${id}.steps`, { returnObjects: true });
  const stepList = Array.isArray(steps) ? steps : [];
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: flagship ? theme.accent : theme.border, borderWidth: flagship ? 1.5 : StyleSheet.hairlineWidth },
      ]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.iconRing, { backgroundColor: theme.accentDim, borderColor: theme.accent }]}>
          <Ionicons name={icon} size={20} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.arcadeHeading, styles.cardTitle, { color: theme.textPrimary }]}>
            {t(`guide.sections.${id}.title`)}
          </Text>
          {flagship && (
            <Text style={[styles.flagship, { color: theme.accent }]}>★ {t('guide.flagship')}</Text>
          )}
        </View>
      </View>

      <Text style={[styles.benefit, { color: theme.textPrimary }]}>
        {t(`guide.sections.${id}.benefit`)}
      </Text>

      <Text style={[styles.howto, { color: theme.textSecondary }]}>{t('guide.howto').toUpperCase()}</Text>
      {stepList.map((step, i) => (
        <View key={i} style={styles.stepRow}>
          <View style={[styles.stepNum, { borderColor: theme.accent }]}>
            <Text style={[styles.stepNumText, { color: theme.accent }]}>{i + 1}</Text>
          </View>
          <Text style={[styles.stepText, { color: theme.textSecondary }]}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

export default function GuideScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { resetOnboarding } = useAppContext();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Revoir l'intro — à sa place naturelle, en tête du guide */}
      <TouchableOpacity
        style={[styles.replayBtn, { backgroundColor: theme.accentDim, borderColor: theme.accent }]}
        onPress={resetOnboarding}
        activeOpacity={0.8}
      >
        <Ionicons name="play-circle" size={22} color={theme.accent} />
        <Text style={[styles.replayText, { color: theme.accent }]}>{t('guide.replayIntro')}</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.accent} />
      </TouchableOpacity>

      <Text style={[styles.intro, { color: theme.textSecondary }]}>{t('guide.intro')}</Text>

      {GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>
            {t(`guide.groups.${group.key}`).toUpperCase()}
          </Text>
          {group.sections.map((s) => (
            <Section key={s.id} id={s.id} icon={s.icon} flagship={s.flagship} theme={theme} t={t} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 16 },
  replayBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 18 },
  replayText: { flex: 1, fontSize: 15, fontWeight: '700' },
  intro: { fontSize: 15, lineHeight: 22, marginBottom: 20 },

  group: { marginBottom: 8 },
  groupTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, paddingLeft: 4 },

  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  iconRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15 },
  flagship: { fontSize: 11, fontWeight: '700', marginTop: 2, letterSpacing: 0.4 },

  benefit: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  howto: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  stepNum: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 11, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
