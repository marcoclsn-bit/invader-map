// Fiche d'un lieu d'intérêt, partagée par la Carte, le Trajet et la Chasse.
// Extraite de ChasseScreen pour éviter trois copies du même bloc : photo
// Wikimedia créditée, thème, résumé, « Y aller » et « Voir plus ».

import { StyleSheet, View, Text, TouchableOpacity, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { wikiUrl } from '../services/poiData';
import { openNavigationApp } from '../utils/navigation';

let _cache = null;
function getStyles(theme) {
  if (_cache?.theme === theme) return _cache.styles;
  const styles = makeStyles(theme);
  _cache = { theme, styles };
  return styles;
}

export default function PoiSheet({ poi, onClose, style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { mapsApp } = useAppContext();
  const styles = getStyles(theme);
  if (!poi) return null;
  const url = wikiUrl(poi);

  return (
    <View style={[styles.sheet, style]}>
      {poi.photo && (
        <View style={styles.photoWrap}>
          <Image source={{ uri: poi.photo }} style={styles.photo} contentFit="cover" cachePolicy="disk" transition={150} />
          {poi.photoBy && (
            <Text style={styles.photoCredit} numberOfLines={1}>
              {poi.photoBy} · {poi.photoLic}
            </Text>
          )}
        </View>
      )}

      <View style={styles.head}>
        <View style={styles.diamond} />
        <Text style={styles.title} numberOfLines={2}>{poi.name}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.chip}>{t(`hunt.poiTheme.${poi.theme}`)}</Text>
      <Text style={styles.text}>{poi.summary}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => openNavigationApp(mapsApp ?? 'apple', poi.lat, poi.lng)}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>{t('map.panel.navigate')}</Text>
        </TouchableOpacity>
        {url && (
          <TouchableOpacity
            style={styles.btn}
            onPress={() => Linking.openURL(url).catch(() => {})}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{t('hunt.poiMore')} ↗</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.credit}>{t('hunt.poiCredit')}</Text>
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    sheet: {
      position: 'absolute', left: 12, right: 12, bottom: 16,
      backgroundColor: t.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: t.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 10,
    },
    photoWrap: { height: 132, borderRadius: 11, overflow: 'hidden', marginBottom: 13, backgroundColor: t.surfaceHigh },
    photo: { width: '100%', height: '100%' },
    photoCredit: {
      position: 'absolute', right: 7, bottom: 5,
      fontSize: 9, color: 'rgba(255,255,255,0.85)',
      backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    diamond: { width: 15, height: 15, borderRadius: 4, backgroundColor: t.accentScore, transform: [{ rotate: '45deg' }] },
    title: { flex: 1, ...typography.arcadeHeading, fontSize: 15, color: t.textPrimary },
    chip: {
      alignSelf: 'flex-start', marginTop: 9, fontSize: 10, fontWeight: '800', letterSpacing: 0.4,
      color: t.accentScore, borderWidth: 1, borderColor: t.accentScore, borderRadius: 999,
      paddingHorizontal: 8, paddingVertical: 2, textTransform: 'uppercase',
    },
    text: { marginTop: 11, fontSize: 13.5, lineHeight: 19, color: t.textPrimary },
    actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    btnPrimary: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: t.accentScore },
    btnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#221A00' },
    btn: {
      flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10,
      backgroundColor: t.surfaceHigh, borderWidth: 1, borderColor: t.border,
    },
    btnText: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
    credit: { fontSize: 10, color: t.textSecondary, textAlign: 'center', marginTop: 10 },
  });
}
