import { ScrollView, View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

const PNOTE_ENABLED = true;

const APP_VERSION = require('../app.json')?.expo?.version ?? '1.0.0';

// ─── Composants internes ──────────────────────────────────────────────────────

function Card({ children, theme }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

function Section({ title, children, theme }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text>
      <Card theme={theme}>{children}</Card>
    </View>
  );
}

function Divider({ theme }) {
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

function InfoRow({ label, value, last, theme }) {
  return (
    <>
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: theme.textPrimary }]}>{label}</Text>
        {value ? <Text style={[styles.infoValue, { color: theme.textSecondary }]}>{value}</Text> : null}
      </View>
      {!last && <Divider theme={theme} />}
    </>
  );
}

function LinkRow({ label, url, last, theme }) {
  return (
    <>
      <TouchableOpacity
        style={styles.linkRow}
        onPress={() => Linking.openURL(url).catch(() => {})}
        activeOpacity={0.6}
      >
        <Text style={[styles.linkLabel, { color: theme.textPrimary }]} numberOfLines={1}>{label}</Text>
        <Ionicons name="open-outline" size={14} color={theme.textSecondary} style={styles.linkIcon} />
      </TouchableOpacity>
      {!last && <Divider theme={theme} />}
    </>
  );
}

function SubHeader({ label, theme }) {
  return (
    <Text style={[styles.subHeader, { color: theme.textSecondary }]}>{label.toUpperCase()}</Text>
  );
}

function ThanksBlock({ text, last, theme }) {
  return (
    <>
      <Text style={[styles.thanksText, { color: theme.textSecondary }]}>{text}</Text>
      {!last && <Divider theme={theme} />}
    </>
  );
}

function LegalBlock({ text, theme }) {
  return (
    <Text style={[styles.legalText, { color: theme.textSecondary }]}>{text}</Text>
  );
}

// ─── Écran À propos ───────────────────────────────────────────────────────────

export default function AboutScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation();
  const { dataVersion, dataUpdatedAt } = useAppContext();
  const insets = useSafeAreaInsets();

  const dataVersionLabel = dataVersion
    ? `v${dataVersion}${dataUpdatedAt ? ` — ${dataUpdatedAt}` : ''}`
    : '—';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={[typography.arcadeTitle, styles.appName, { color: theme.accent }]}>
          {t('common.appName')}
        </Text>
        <Text style={[styles.appVersion, { color: theme.textSecondary }]}>v{APP_VERSION}</Text>
        <Text style={[styles.appPitch, { color: theme.textSecondary }]}>
          {t('about.appPitch')}
        </Text>
      </View>

      {/* ── L'application ── */}
      <Section title={t('about.appSection')} theme={theme}>
        <InfoRow label={t('about.versionApp')} value={`v${APP_VERSION}`} theme={theme} />
        <InfoRow label={t('about.versionData')} value={dataVersionLabel} last theme={theme} />
      </Section>

      {/* ── Créateur ── */}
      <Section title={t('about.creatorSection')} theme={theme}>
        <InfoRow label={t('about.createdBy')} last theme={theme} />
      </Section>

      {/* ── Remerciements ── */}
      <Section title={t('about.thanksSection')} theme={theme}>
        <ThanksBlock text={t('about.thanks1')} theme={theme} />
        <ThanksBlock text={t('about.thanks2')} last theme={theme} />
      </Section>

      {/* ── Crédits & sources ── */}
      <Section title={t('about.creditsSection')} theme={theme}>
        <SubHeader label={t('about.creditsDataLabel')} theme={theme} />
        <LinkRow label="goguelnikov/SpaceInvaders" url="https://github.com/goguelnikov/SpaceInvaders" theme={theme} />
        {PNOTE_ENABLED && (
          <LinkRow label="pnote.eu" url="https://pnote.eu" theme={theme} />
        )}
        <LinkRow label="invader-spotter.art" url="https://www.invader-spotter.art" theme={theme} />
        <Divider theme={theme} />
        <SubHeader label={`${t('about.creditsMapLabel')} & ${t('about.creditsRoutingLabel')}`} theme={theme} />
        <LinkRow label="© OpenStreetMap contributors" url="https://www.openstreetmap.org/copyright" theme={theme} />
        <LinkRow label="OpenRouteService" url="https://openrouteservice.org" theme={theme} />
        <LinkRow label="© Mapbox" url="https://www.mapbox.com/about/maps/" theme={theme} />
        <Divider theme={theme} />
        <SubHeader label={t('about.creditsFontsLabel')} theme={theme} />
        <LinkRow label="Silkscreen" url="https://fonts.google.com/specimen/Silkscreen" theme={theme} />
        <LinkRow label="Press Start 2P" url="https://fonts.google.com/specimen/Press+Start+2P" last theme={theme} />
      </Section>

      {/* ── Confidentialité ── */}
      <Section title={t('privacy.title')} theme={theme}>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate('Confidentialité')}
          activeOpacity={0.6}
        >
          <Text style={[styles.linkLabel, { color: theme.textPrimary }]}>{t('privacy.title')}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} style={styles.linkIcon} />
        </TouchableOpacity>
      </Section>

      {/* ── Mentions légales ── */}
      <Section title={t('about.legalSection')} theme={theme}>
        <LegalBlock text={t('about.legalText')} theme={theme} />
      </Section>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 20 },

  header: { alignItems: 'center', marginBottom: 32 },
  appName: { fontSize: 22, textAlign: 'center' },
  appVersion: { fontSize: 13, marginTop: 6 },
  appPitch: { fontSize: 15, marginTop: 12, textAlign: 'center', lineHeight: 22 },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.6,
    marginBottom: 8, paddingLeft: 4,
  },
  card: {
    borderRadius: 12, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },

  divider: { height: StyleSheet.hairlineWidth },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 46,
  },
  infoLabel: { fontSize: 15, flex: 1 },
  infoValue: { fontSize: 14, textAlign: 'right', marginLeft: 8 },

  linkRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 46,
  },
  linkLabel: { fontSize: 15, flex: 1 },
  linkIcon: { marginLeft: 6 },

  subHeader: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },

  thanksText: {
    fontSize: 14, lineHeight: 21, fontStyle: 'italic',
    paddingHorizontal: 16, paddingVertical: 14,
  },

  legalText: {
    fontSize: 13, lineHeight: 20,
    paddingHorizontal: 16, paddingVertical: 16,
  },
});
