import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { getPrivacyPolicy } from '../data/privacyPolicy';

export default function PrivacyPolicyScreen() {
  const { theme } = useTheme();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const p = getPrivacyPolicy(i18n.language);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
    >
      <Text style={[styles.updated, { color: theme.textSecondary }]}>
        {p.updatedLabel} : {p.updated}
      </Text>
      <Text style={[styles.intro, { color: theme.textPrimary }]}>{p.intro}</Text>

      {/* En bref */}
      <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.accent }]}>
        <Text style={[styles.summaryTitle, { color: theme.accent }]}>{p.summaryTitle.toUpperCase()}</Text>
        <Text style={[styles.summaryBody, { color: theme.textPrimary }]}>{p.summary}</Text>
      </View>

      {p.sections.map((s, i) => (
        <View key={i} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{s.title}</Text>
          <Text style={[styles.sectionBody, { color: theme.textSecondary }]}>{s.body}</Text>
        </View>
      ))}

      <Text style={[styles.footer, { color: theme.textSecondary }]}>{p.footer}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16 },
  updated: { fontSize: 12, marginBottom: 12 },
  intro: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  summaryCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 24 },
  summaryTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  summaryBody: { fontSize: 14, lineHeight: 21 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  sectionBody: { fontSize: 14, lineHeight: 21 },
  footer: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginTop: 8 },
});
