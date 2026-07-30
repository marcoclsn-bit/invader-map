// Les sept familles de lieux, en pastilles cochables.
//
// Le même bloc existait à l'identique dans trois écrans — le panneau de filtres
// de la Carte, la Chasse et la carte d'invitation — alors que `poiPrefs.families`
// est un réglage UNIQUE et partagé. Trois copies d'un même contrôle finissent
// toujours par diverger : c'est déjà arrivé sur la taille des icônes.

import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { POI_FAMILIES } from '../data/poiFamilies';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

function PoiFamilyChips({ style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { poiPrefs, togglePoiFamily } = useAppContext();

  return (
    <View style={[styles.rangee, style]}>
      {POI_FAMILIES.map(({ key, icon }) => {
        const actif = poiPrefs.families.has(key);
        return (
          <TouchableOpacity
            key={key}
            onPress={() => togglePoiFamily(key)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: actif }}
            accessibilityLabel={t(`poi.family.${key}`)}
            style={[
              styles.pastille,
              actif
                ? { backgroundColor: theme.accentScore, borderColor: theme.accentScore }
                : { backgroundColor: 'transparent', borderColor: theme.border },
            ]}
          >
            <Ionicons name={icon} size={15} color={actif ? theme.bg : theme.textSecondary} />
            <Text style={[styles.texte, { color: actif ? theme.bg : theme.textPrimary }]}>
              {t(`poi.family.${key}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default memo(PoiFamilyChips);

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pastille: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5,
  },
  texte: { fontSize: 12, fontWeight: '600' },
});
