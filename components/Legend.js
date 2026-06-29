import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';

// Mêmes images que les marqueurs de la carte (cohérence visuelle)
const IMAGES = {
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  flashed:   require('../assets/markers/alien_flashed.png'),
};

const ORDER = ['ok', 'damaged', 'unknown', 'destroyed', 'flashed'];

/**
 * Légende des couleurs des Invaders.
 * @param {function} onDismiss  si fourni → affiche une croix de fermeture (version flottante carte)
 * @param {boolean}  inline     true = sans fond/ombre (intégré au panneau de filtres)
 */
export default function Legend({ onDismiss, inline = false }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(theme);

  return (
    <View style={inline ? styles.inline : styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('map.legend.title')}</Text>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {ORDER.map((key) => (
        <View key={key} style={styles.row}>
          <Image source={IMAGES[key]} style={styles.icon} resizeMode="contain" fadeDuration={0} />
          <Text style={styles.label}>{t(`map.legend.${key}`)}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    card: {
      backgroundColor: t.surface,
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
    },
    inline: { paddingTop: 4 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, marginBottom: 8,
    },
    title: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
      color: t.textSecondary, textTransform: 'uppercase',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    icon: { width: 18, height: 18 },
    label: { fontSize: 13, color: t.textPrimary },
  });
}
