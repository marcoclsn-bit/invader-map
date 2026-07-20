import { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch, Alert,
  Modal, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { PALETTE, ALL_STATUSES } from '../constants';
import { SUPPORTED_LANGUAGES } from '../i18n';

// ─── Sélecteur de couleur ─────────────────────────────────────────────────────

function ColorPickerModal({ title, value, onSelect, onClose }) {
  const { theme } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={layout.overlay} onPress={onClose}>
        <Pressable style={[layout.colorCard, { backgroundColor: theme.surface }]}>
          <Text style={[layout.colorTitle, { color: theme.textPrimary }]}>{title}</Text>
          <View style={layout.palette}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                style={[layout.swatch, { backgroundColor: c }]}
                onPress={() => { onSelect(c); onClose(); }}
              >
                {value === c && <Text style={layout.swatchCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Composants de mise en page ───────────────────────────────────────────────

function Section({ title, children }) {
  const { theme } = useTheme();
  return (
    <View style={layout.section}>
      {title ? (
        <Text style={[layout.sectionTitle, { color: theme.textSecondary }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[layout.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, hint, trailing, onPress, destructive, action, last, children }) {
  const { theme } = useTheme();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[layout.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      {(label !== undefined || trailing) && (
        <View style={layout.rowHead}>
          <View style={layout.rowLeft}>
            {label !== undefined && (
              <Text style={[
                layout.rowLabel,
                { color: theme.textPrimary },
                destructive && { color: theme.destructive },
                action && { color: theme.link },
              ]}>
                {label}
              </Text>
            )}
            {hint ? <Text style={[layout.rowHint, { color: theme.textSecondary }]}>{hint}</Text> : null}
          </View>
          {trailing}
        </View>
      )}
      {children}
    </Wrapper>
  );
}

// ─── Écran Réglages ───────────────────────────────────────────────────────────

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme, isDark, toggle } = useTheme();
  const { t } = useTranslation();
  const {
    statusColors, setStatusColor,
    labelDefs, setFlashedColor,
    mapsApp, setMapsAppPref,
    language, setLanguage,
    newsNotify, setNewsNotifyPref,
    resetOnboarding,
    resetLabels, clearFlashDates,
    dataVersion, dataUpdatedAt, checkDataUpdate,
  } = useAppContext();

  const flashedColor = labelDefs.find((d) => d.id === 'lbl_flashed')?.color;

  const [colorPickerFor, setColorPickerFor] = useState(null); // status | 'flashed' | null
  const [updateStatus, setUpdateStatus] = useState(null); // null|'checking'|'up_to_date'|string

  async function handleCheckUpdate() {
    setUpdateStatus('checking');
    const status = await checkDataUpdate();
    setUpdateStatus(status);
  }

  function confirmReset() {
    Alert.alert(
      t('settings.labels.resetTitle'),
      t('settings.labels.resetMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.labels.resetAction'), style: 'destructive', onPress: resetLabels },
      ]
    );
  }

  function confirmClearDates() {
    Alert.alert(
      t('settings.timeline.resetTitle'),
      t('settings.timeline.resetMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.timeline.resetAction'), style: 'destructive', onPress: clearFlashDates },
      ]
    );
  }

  return (
    <ScrollView
      style={[layout.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[layout.screenTitle, { color: theme.textPrimary }]}>{t('settings.title')}</Text>

      {/* ── Apparence ── */}
      <Section title={t('settings.appearance.section')}>
        <Row
          label={t('settings.appearance.darkTheme')}
          trailing={
            <Switch
              value={isDark}
              onValueChange={toggle}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.bg}
              ios_backgroundColor={theme.border}
            />
          }
          last
        />
      </Section>

      {/* ── Notifications ── */}
      <Section title={t('settings.notifs.section')}>
        <Row
          label={t('settings.notifs.news')}
          hint={t('settings.notifs.newsHint')}
          trailing={
            <Switch
              value={newsNotify}
              onValueChange={setNewsNotifyPref}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.bg}
              ios_backgroundColor={theme.border}
            />
          }
          last
        />
      </Section>

      {/* ── Couleurs des statuts + flashés ── */}
      <Section title={t('settings.statusColors.section')}>
        {ALL_STATUSES.map((status) => (
          <Row
            key={status}
            label={t(`common.status.${status}`)}
            trailing={<View style={[layout.colorDot, { backgroundColor: statusColors[status] }]} />}
            onPress={() => setColorPickerFor(status)}
          />
        ))}
        <Row
          label={t('settings.statusColors.flashed')}
          trailing={<View style={[layout.colorDot, { backgroundColor: flashedColor }]} />}
          onPress={() => setColorPickerFor('flashed')}
          last
        />
      </Section>

      {/* ── Navigation ── */}
      <Section title={t('settings.navigation.section')}>
        <Row label={t('settings.navigation.mapsApp')} hint={mapsApp === null ? t('settings.navigation.mapsAppHint') : undefined} last>
          <View style={layout.segmented}>
            {[{ key: 'apple', label: t('common.mapsApp.apple') }, { key: 'google', label: t('common.mapsApp.google') }].map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[layout.seg, { backgroundColor: mapsApp === key ? theme.accent : theme.surfaceHigh }]}
                onPress={() => setMapsAppPref(key)}
              >
                <Text style={[layout.segText, { color: mapsApp === key ? theme.bg : theme.textSecondary }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Row>
      </Section>

      {/* ── Données ── */}
      <Section title={t('settings.data.section')}>
        {/* Version actuelle */}
        <View style={[layout.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
          <Text style={[layout.rowLabel, { color: theme.textSecondary }]}>{t('settings.data.dataVersion')}</Text>
          <Text style={[layout.rowHint, { color: theme.textSecondary }]}>
            v{dataVersion} — {dataUpdatedAt || '—'}
          </Text>
        </View>

        {/* Bouton vérification */}
        <TouchableOpacity
          style={[layout.row, { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
          onPress={handleCheckUpdate}
          disabled={updateStatus === 'checking'}
          activeOpacity={0.6}
        >
          <View style={{ flex: 1 }}>
            <Text style={[layout.rowLabel, { color: updateStatus === 'checking' ? theme.textSecondary : theme.textPrimary }]}>
              {updateStatus === 'checking' ? t('settings.data.checking') : t('settings.data.checkUpdates')}
            </Text>
            {updateStatus && updateStatus !== 'checking' && (
              <Text style={[layout.rowHint, {
                color: updateStatus === 'up_to_date' || updateStatus.startsWith('updated')
                  ? theme.accent : theme.destructive,
              }]}>
                {updateStatus === 'up_to_date'
                  ? t('settings.data.upToDate')
                  : updateStatus.startsWith('updated_v')
                    ? t('settings.data.newVersion', { v: updateStatus.replace('updated_', '') })
                    : updateStatus === 'offline'
                      ? t('settings.data.offline')
                      : t('settings.data.updateError')}
              </Text>
            )}
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: 20 }}>›</Text>
        </TouchableOpacity>

        <Row
          label={t('settings.timeline.reset')}
          hint={t('settings.timeline.resetHint')}
          onPress={confirmClearDates}
          destructive
        />
        <Row
          label={t('settings.labels.resetAll')}
          hint={t('settings.labels.resetHint')}
          onPress={confirmReset}
          destructive
          last
        />
      </Section>

      {/* ── Langue ── */}
      <Section title={t('settings.language.section')}>
        {['system', ...SUPPORTED_LANGUAGES].map((lang, i, arr) => (
          <Row
            key={lang}
            label={t(`settings.language.${lang}`)}
            onPress={() => setLanguage(lang)}
            trailing={language === lang
              ? <Ionicons name="checkmark" size={18} color={theme.accent} />
              : null}
            last={i === arr.length - 1}
          />
        ))}
      </Section>

      {/* ── À propos & Intro ── */}
      <Section>
        <Row
          label={t('settings.replayOnboarding')}
          onPress={resetOnboarding}
          trailing={<Ionicons name="play-outline" size={16} color={theme.textSecondary} />}
        />
        <Row
          label={t('settings.aboutEntry')}
          onPress={() => navigation.navigate('À propos')}
          trailing={<Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
        />
        <Row
          label={t('privacy.title')}
          onPress={() => navigation.navigate('Confidentialité')}
          trailing={<Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
          last
        />
      </Section>

      {/* ── Modaux ── */}
      {colorPickerFor !== null && (
        <ColorPickerModal
          title={colorPickerFor === 'flashed'
            ? t('settings.statusColors.colorForFlashed')
            : t('settings.statusColors.colorFor', { status: t(`common.status.${colorPickerFor}`) })}
          value={colorPickerFor === 'flashed' ? flashedColor : statusColors[colorPickerFor]}
          onSelect={(color) => colorPickerFor === 'flashed'
            ? setFlashedColor(color)
            : setStatusColor(colorPickerFor, color)}
          onClose={() => setColorPickerFor(null)}
        />
      )}
    </ScrollView>
  );
}

// ─── Styles (structure uniquement — les couleurs viennent du theme) ───────────

const layout = StyleSheet.create({
  container: { flex: 1 },

  screenTitle: {
    ...typography.arcadeTitle,
    fontSize: 20,
    paddingHorizontal: 20, marginBottom: 24,
  },

  // Sections
  section: { marginBottom: 28, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.5,
    marginBottom: 8, paddingLeft: 4,
  },
  card: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },

  // Rows
  row: { paddingHorizontal: 16, paddingVertical: 14 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 16 },
  rowHint: { fontSize: 13, marginTop: 3 },

  // Dot de couleur
  colorDot: { width: 24, height: 24, borderRadius: 12 },

  // Segmented (App de cartes)
  segmented: { flexDirection: 'row', gap: 8, marginTop: 12 },
  seg: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  segText: { fontSize: 14, fontWeight: '500' },

  // ColorPickerModal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  colorCard: { borderRadius: 16, padding: 20 },
  colorTitle: { fontSize: 17, fontWeight: '600', marginBottom: 16 },

  // Palette partagée
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchCheck: {
    color: '#fff', fontSize: 20, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  // Éléments partagés de liste
  separator: { height: StyleSheet.hairlineWidth },
  chevron: { justifyContent: 'center', paddingLeft: 6 },
});
