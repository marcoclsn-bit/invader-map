import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { openInstagramTag } from '../utils/navigation';
import { buildContextBlock, sendFeedbackEmail } from '../utils/feedback';

let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

// autoCloseOnAction : ferme le panel après chaque action (utilisé en mode navigation Chasse)
export default function InvaderPanel({ invader, onToggleFlash, onNavigate, onClose, autoCloseOnAction = false }) {
  const { flashed, statusColors, dataVersion } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const isFlashed = flashed.has(invader.id);

  function handleFlash() {
    onToggleFlash(invader.id);
    // fromFlash : permet à l'appelant (Trajet) de fermer sans relancer le recentrage.
    if (autoCloseOnAction) onClose({ fromFlash: true });
  }
  function handleNavigate() {
    onNavigate(invader.lat, invader.lng);
    if (autoCloseOnAction) onClose();
  }
  function handleInstagram() {
    openInstagramTag(invader.id);
    if (autoCloseOnAction) onClose();
  }

  // ── Signalement d'un changement de statut ──────────────────────────────────
  function reportStatus() {
    const options = ['ok', 'damaged', 'destroyed'];
    const buttons = options.map((s) => ({
      text: t(`common.status.${s}`),
      onPress: () => submitStatusReport(s),
    }));
    buttons.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(
      t('feedback.status.pickTitle'),
      t('feedback.status.pickBody', { id: invader.id }),
      buttons,
    );
  }

  async function submitStatusReport(newStatus) {
    const subject = t('feedback.status.emailSubject', { id: invader.id });
    const body = [
      t('feedback.status.bodyId', { id: invader.id }),
      t('feedback.status.bodyCurrent', { status: t(`common.status.${invader.status}`) }),
      t('feedback.status.bodyReported', { status: t(`common.status.${newStatus}`) }),
      t('feedback.status.bodyCoords', { lat: invader.lat, lng: invader.lng }),
      t('feedback.status.bodyDate', { date: new Date().toLocaleString() }),
      '',
      buildContextBlock(dataVersion),
    ].join('\n');

    const status = await sendFeedbackEmail({ subject, body }).catch(() => 'no_mail');
    if (status === 'no_mail') {
      Alert.alert(t('feedback.noMailTitle'), t('feedback.noMailBody'));
    } else if (status === 'sent') {
      Alert.alert(t('feedback.status.sentTitle'), t('feedback.status.sentBody'));
    }
    if (autoCloseOnAction) onClose();
  }

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelId}>{invader.id}</Text>
        <TouchableOpacity onPress={() => onClose()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panelRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[invader.status] }]}>
          <Text style={styles.statusText}>{t(`common.status.${invader.status}`) ?? invader.status}</Text>
        </View>
        <Text style={styles.points}>{invader.points != null ? `${invader.points} pts` : '— pts'}</Text>
      </View>

      {invader.hint ? <Text style={styles.hint}>{invader.hint}</Text> : null}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleFlash}
          style={[styles.actionBtn, isFlashed && styles.actionBtnActive]}
        >
          <Text style={[styles.actionBtnText, isFlashed && styles.actionBtnTextActive]}>
            {isFlashed ? t('map.panel.alreadyFlashed') : t('map.panel.markFlashed')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNavigate} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>{t('map.panel.navigate')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.igBtn}
        onPress={handleInstagram}
        activeOpacity={0.7}
      >
        <Ionicons name="logo-instagram" size={16} color="#E1306C" />
        <Text style={styles.igBtnText}>{t('map.panel.instagram')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.reportBtn}
        onPress={reportStatus}
        activeOpacity={0.6}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="flag-outline" size={13} color={theme.textSecondary} />
        <Text style={styles.reportBtnText}>{t('feedback.status.button')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    panel: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40,
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    panelId: { ...typography.arcadeTitle, color: t.textPrimary },
    closeButton: { fontSize: 18, color: t.textSecondary },
    panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    points: { fontSize: 15, color: t.textSecondary },
    hint: { marginTop: 12, fontSize: 14, color: t.textSecondary, fontStyle: 'italic' },
    actions: { marginTop: 16, flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: t.surfaceHigh, alignItems: 'center',
    },
    actionBtnActive: { backgroundColor: t.accent },
    actionBtnText: { fontSize: 14, fontWeight: '500', color: t.textPrimary },
    actionBtnTextActive: { color: t.bg },
    igBtn: {
      marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 7, paddingVertical: 8, borderRadius: 8,
      borderWidth: 1, borderColor: '#E1306C',
    },
    igBtnText: { fontSize: 14, fontWeight: '500', color: '#E1306C' },
    reportBtn: {
      marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 4,
    },
    reportBtnText: { fontSize: 12, color: t.textSecondary, textDecorationLine: 'underline' },
  });
}
