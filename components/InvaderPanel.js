import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { openInstagramTag } from '../utils/navigation';

let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

export default function InvaderPanel({ invader, onToggleFlash, onNavigate, onClose }) {
  const { flashed, labelDefs, statusColors, labels, toggleLabel } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const isFlashed = flashed.has(invader.id);
  const invLabelIds = labels[invader.id] ?? [];

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelId}>{invader.id}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
          onPress={() => onToggleFlash(invader.id)}
          style={[styles.actionBtn, isFlashed && styles.actionBtnActive]}
        >
          <Text style={[styles.actionBtnText, isFlashed && styles.actionBtnTextActive]}>
            {isFlashed ? t('map.panel.alreadyFlashed') : t('map.panel.markFlashed')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onNavigate(invader.lat, invader.lng)} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>{t('map.panel.navigate')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.igBtn}
        onPress={() => openInstagramTag(invader.id)}
        activeOpacity={0.7}
      >
        <Ionicons name="logo-instagram" size={16} color="#E1306C" />
        <Text style={styles.igBtnText}>{t('map.panel.instagram')}</Text>
      </TouchableOpacity>

      {labelDefs.filter((d) => !d.system).length > 0 && (
        <View style={styles.labelSection}>
          <Text style={styles.labelSectionTitle}>{t('map.panel.labelsTitle')}</Text>
          <View style={styles.labelChips}>
            {labelDefs.filter((d) => !d.system).map((def) => {
              const applied = invLabelIds.includes(def.id);
              return (
                <TouchableOpacity
                  key={def.id}
                  style={[
                    styles.labelChip,
                    applied ? { backgroundColor: def.color } : { borderColor: def.color, borderWidth: 1.5 },
                  ]}
                  onPress={() => toggleLabel(invader.id, def.id)}
                >
                  <Text style={[styles.labelChipText, applied && styles.labelChipTextActive]}>
                    {def.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    panel: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
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
    labelSection: { marginTop: 16 },
    labelSectionTitle: { fontSize: 11, fontWeight: '600', color: t.textSecondary, letterSpacing: 0.5, marginBottom: 8 },
    labelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    labelChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'transparent' },
    labelChipText: { fontSize: 13, fontWeight: '500', color: t.textPrimary },
    labelChipTextActive: { color: '#fff' },
  });
}
