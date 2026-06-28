import {
  StyleSheet, View, Text, ScrollView, Switch, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

const RADIUS_MIN = 25;
const RADIUS_MAX = 150;
const RADIUS_STEP = 5;

// ─── Cache de styles thémés ───────────────────────────────────────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

function Section({ title, children, theme }) {
  const styles = getStyles(theme);
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function ToggleRow({ label, hint, value, onValueChange, disabled, theme, last }) {
  const styles = getStyles(theme);
  return (
    <View style={[styles.row, !last && styles.rowDivider, disabled && styles.rowDisabled]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={theme.bg}
        ios_backgroundColor={theme.border}
      />
    </View>
  );
}

// ─── Écran Mode balade ──────────────────────────────────────────────────────────
export default function StrollScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const { stroll, setStrollPref } = useAppContext();

  const off = !stroll.enabled;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('stroll.title')}</Text>
        <TouchableOpacity
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* ── Bandeau « bientôt disponible » ── */}
        <View style={styles.banner}>
          <Ionicons name="construct-outline" size={18} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{t('stroll.comingSoon.badge')}</Text>
            <Text style={styles.bannerBody}>{t('stroll.comingSoon.body')}</Text>
          </View>
        </View>

        {/* ── Explication ── */}
        <Section title={t('stroll.aboutSection')} theme={theme}>
          <View style={styles.aboutBlock}>
            <Text style={styles.aboutLabel}>{t('stroll.whatTitle')}</Text>
            <Text style={styles.aboutBody}>{t('stroll.whatBody')}</Text>
          </View>
          <View style={[styles.aboutBlock, styles.rowDividerTop]}>
            <Text style={styles.aboutLabel}>{t('stroll.vsTrajetTitle')}</Text>
            <Text style={styles.aboutBody}>{t('stroll.vsTrajetBody')}</Text>
          </View>
        </Section>

        {/* ── Activation ── */}
        <Section theme={theme}>
          <ToggleRow
            label={t('stroll.enableLabel')}
            hint={t('stroll.enableHint')}
            value={stroll.enabled}
            onValueChange={(v) => setStrollPref({ enabled: v })}
            theme={theme}
            last
          />
        </Section>

        {/* ── Rayon d'alerte ── */}
        <Section title={t('stroll.radiusSection')} theme={theme}>
          <View style={[styles.radiusBlock, off && styles.rowDisabled]}>
            <View style={styles.radiusHeader}>
              <Text style={styles.rowLabel}>{t('stroll.radiusLabel')}</Text>
              <Text style={styles.radiusValue}>{t('stroll.radiusValue', { m: stroll.radius })}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={RADIUS_MIN}
              maximumValue={RADIUS_MAX}
              step={RADIUS_STEP}
              value={stroll.radius}
              onValueChange={(v) => setStrollPref({ radius: Math.round(v) })}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor={theme.border}
              thumbTintColor={theme.accent}
              disabled={off}
            />
            <Text style={styles.rowHint}>{t('stroll.radiusHint')}</Text>
          </View>
        </Section>

        {/* ── Comment être alerté ── */}
        <Section title={t('stroll.alertsSection')} theme={theme}>
          <ToggleRow
            label={t('stroll.vibration')}
            value={stroll.vibration}
            onValueChange={(v) => setStrollPref({ vibration: v })}
            disabled={off}
            theme={theme}
          />
          <ToggleRow
            label={t('stroll.notification')}
            value={stroll.notification}
            onValueChange={(v) => setStrollPref({ notification: v })}
            disabled={off}
            theme={theme}
            last
          />
        </Section>

        {/* ── Cibler ── */}
        <Section title={t('stroll.targetSection')} theme={theme}>
          <ToggleRow
            label={t('stroll.unflashedOnly')}
            hint={t('stroll.unflashedOnlyHint')}
            value={stroll.unflashedOnly}
            onValueChange={(v) => setStrollPref({ unflashedOnly: v })}
            disabled={off}
            theme={theme}
            last
          />
        </Section>

        <Text style={styles.footnote}>{t('stroll.footnote')}</Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      backgroundColor: t.surface,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    title: { ...typography.arcadeTitle, color: t.textPrimary },

    banner: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      marginHorizontal: 16, marginTop: 16, padding: 14,
      borderRadius: 12, backgroundColor: t.accentDim,
      borderWidth: 1, borderColor: t.accent,
    },
    bannerTitle: { ...typography.arcadeHeading, fontSize: 12, color: t.accent, marginBottom: 4 },
    bannerBody: { fontSize: 13, lineHeight: 19, color: t.textPrimary },

    section: { marginTop: 24, paddingHorizontal: 16 },
    sectionTitle: {
      fontSize: 12, fontWeight: '600', letterSpacing: 0.5,
      color: t.textSecondary, marginBottom: 8, paddingLeft: 4,
    },
    card: {
      borderRadius: 12, overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      backgroundColor: t.surface,
    },

    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    rowDividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    rowDisabled: { opacity: 0.45 },
    rowText: { flex: 1 },
    rowLabel: { fontSize: 16, color: t.textPrimary },
    rowHint: { fontSize: 13, color: t.textSecondary, marginTop: 3, lineHeight: 18 },

    aboutBlock: { paddingHorizontal: 16, paddingVertical: 14 },
    aboutLabel: { ...typography.arcadeHeading, fontSize: 12, color: t.textPrimary, marginBottom: 6 },
    aboutBody: { fontSize: 14, lineHeight: 21, color: t.textSecondary },

    radiusBlock: { paddingHorizontal: 16, paddingVertical: 14 },
    radiusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    radiusValue: { ...typography.arcadeScore, fontSize: 15, color: t.accent },
    slider: { width: '100%', height: 36, marginVertical: 4 },

    footnote: {
      fontSize: 12, lineHeight: 18, color: t.textSecondary,
      textAlign: 'center', marginTop: 20, paddingHorizontal: 32,
    },
  });
}
