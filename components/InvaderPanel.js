import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import InvaderPhoto from './InvaderPhoto';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { openInstagramTag } from '../utils/navigation';
import { buildContextBlock } from '../utils/feedback';
import { FEEDBACK_EMAIL } from '../constants';
import i18n from '../i18n';

// « 1998-04-18 » → date lisible dans la LANGUE DE L'APP (ex. « 18 avr. 1998 »).
// On passe i18n.language (pas la locale du téléphone) pour rester cohérent avec l'app.
function formatPosedDate(iso) {
  try {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(i18n.language || 'fr', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

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
  const [zoom, setZoom] = useState(false);

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
      // Différé : iOS ne présente aucun modal (compositeur mail) tant que l'Alert
      // n'est pas complètement fermée → sans ce délai, « rien ne se passe ».
      onPress: () => setTimeout(() => submitStatusReport(s), 400),
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

    // Feuille de partage native : s'ouvre toujours (Mail, Gmail, Messages, Copier…).
    // L'adresse de contact est incluse dans le message.
    try {
      await Share.share({ subject, message: `${subject}\n\n${body}\n\n→ ${FEEDBACK_EMAIL}` });
    } catch {
      Alert.alert(t('feedback.noMailTitle'), t('feedback.noMailBody', { email: FEEDBACK_EMAIL }));
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

      <View style={styles.topRow}>
        {invader.photoUrl ? (
          <TouchableOpacity style={styles.thumbWrap} onPress={() => setZoom(true)} activeOpacity={0.8}>
            <InvaderPhoto
              photoUrl={invader.photoUrl}
              status={invader.status}
              style={styles.thumb}
              contentFit="contain"
            />
            <View style={styles.zoomBadge}>
              <Ionicons name="expand" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.topInfo}>
          <View style={styles.panelRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColors[invader.status] }]}>
              <Text style={styles.statusText}>{t(`common.status.${invader.status}`) ?? invader.status}</Text>
            </View>
            <Text style={styles.points}>{invader.points != null ? `${invader.points} pts` : '— pts'}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleFlash}
              style={[styles.actionBtn, isFlashed ? styles.actionBtnActive : styles.actionBtnPrimary]}
            >
              <Text
                style={[styles.actionBtnText, isFlashed ? styles.actionBtnTextActive : styles.actionBtnTextPrimary]}
                numberOfLines={1}
              >
                {isFlashed ? t('map.panel.alreadyFlashed') : t('map.panel.markFlashed')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNavigate} style={styles.actionBtn}>
              <Text style={styles.actionBtnText} numberOfLines={1}>{t('map.panel.navigate')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {invader.datePosed ? (
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
          <Text style={styles.metaText}>{t('map.panel.posedOn', { date: formatPosedDate(invader.datePosed) })}</Text>
        </View>
      ) : null}
      {invader.hint ? <Text style={styles.hint}>{invader.hint}</Text> : null}

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

      {invader.photoUrl ? (
        <Modal
          visible={zoom}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setZoom(false)}
        >
          <TouchableOpacity style={styles.lightbox} activeOpacity={1} onPress={() => setZoom(false)}>
            <InvaderPhoto
              photoUrl={invader.photoUrl}
              status={invader.status}
              style={styles.lightboxImg}
              contentFit="contain"
            />
            <TouchableOpacity
              style={styles.lightboxClose}
              onPress={() => setZoom(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      ) : null}
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
    // stretch + space-between : le badge s'aligne sur le haut de la photo,
    // les boutons sur le bas → colonne de droite calée sur la vignette.
    topRow: { flexDirection: 'row', alignItems: 'stretch', gap: 14, marginBottom: 4 },
    thumbWrap: { width: 88, height: 88 },
    thumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: t.surfaceHigh },
    zoomBadge: {
      position: 'absolute', right: 4, bottom: 4,
      backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 9, padding: 3,
    },
    topInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
    // Lightbox plein écran
    lightbox: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    lightboxImg: { width: '100%', height: '80%' },
    lightboxClose: { position: 'absolute', top: 60, right: 24 },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    panelId: { ...typography.arcadeTitle, color: t.textPrimary },
    closeButton: { fontSize: 18, color: t.textSecondary },
    panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    points: { fontSize: 15, color: t.textSecondary },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
    metaText: { fontSize: 13, color: t.textSecondary },
    hint: { marginTop: 10, fontSize: 14, color: t.textSecondary, fontStyle: 'italic' },
    actions: { flexDirection: 'row', gap: 8 },
    actionBtn: {
      flex: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9,
      backgroundColor: t.surfaceHigh, alignItems: 'center',
    },
    // « Flasher » = action n°1 → bouton plein accent tant que non flashé.
    actionBtnPrimary: { backgroundColor: t.accent },
    actionBtnTextPrimary: { color: t.bg, fontWeight: '700' },
    // Déjà flashé → état « fait » : fond neutre, liseré + texte accent.
    actionBtnActive: { backgroundColor: t.surfaceHigh, borderWidth: 1, borderColor: t.accent },
    actionBtnText: { fontSize: 14, fontWeight: '500', color: t.textPrimary },
    actionBtnTextActive: { color: t.accent, fontWeight: '600' },
    igBtn: {
      marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
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
