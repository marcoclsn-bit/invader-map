import { TouchableOpacity, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { track } from '../services/analytics';

/**
 * Ampoule d'indice, sur une ligne d'Invader.
 *
 * Deux indices, et l'ordre n'est pas décoratif : ils ne révèlent pas la même
 * chose. Le gros plan montre la mosaïque seule, donc CE QU'ON CHERCHE, sans dire
 * où. Le plan large la montre sur son mur, donc OÙ ELLE EST : c'est la réponse.
 * D'où deux niveaux annoncés comme tels, et le second explicitement signalé
 * comme révélant l'emplacement.
 *
 * Disponible même en mode explorateur, contrairement aux liens de la fiche :
 * un indice demandé volontairement, Invader par Invader, n'est pas l'app qui
 * dévoile, c'est le chasseur qui renonce. La promesse du mode est de ne jamais
 * montrer sans qu'on demande, pas de refuser de répondre.
 *
 * Aucune image n'est affichée ni mise en cache : liens sortants uniquement.
 */
export default function IndiceButton({ invader, style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const zoom = invader?.photoUrl;
  const large = invader?.photoWideUrl;
  if (!zoom && !large) return null;

  function ouvrir(url, niveau) {
    track('indice', { niveau, city: invader.id.slice(0, invader.id.lastIndexOf('_')) });
    Linking.openURL(url).catch(() => {});
  }

  function demander() {
    const boutons = [];
    if (zoom) boutons.push({ text: t('indice.niveau1'), onPress: () => ouvrir(zoom, 1) });
    if (large) boutons.push({ text: t('indice.niveau2'), onPress: () => ouvrir(large, 2) });
    // Android ne garde que TROIS boutons : deux indices plus Annuler, ça tombe juste.
    boutons.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(t('indice.titre', { id: invader.id }), t('indice.corps'), boutons, { cancelable: true });
  }

  return (
    <TouchableOpacity
      onPress={demander}
      style={style}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={t('indice.a11y', { id: invader.id })}
    >
      <Ionicons name="bulb-outline" size={17} color={theme.accentScore} />
    </TouchableOpacity>
  );
}
