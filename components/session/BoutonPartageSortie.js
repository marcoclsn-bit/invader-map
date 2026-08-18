import { TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { useSorties } from './useSorties';

/**
 * « Partager ma sortie » — présent sur les trois onglets terrain.
 *
 * UN BOUTON, PAS UN BANDEAU DIFFÉRÉ. Après une chasse, l'app est fermée : un
 * déclenchement « 30 minutes sans flash » n'arriverait jamais pendant qu'on est
 * là, et proposerait à la prochaine ouverture — parfois des jours plus tard — de
 * partager une balade oubliée. Un bouton, lui, attend sans rien exiger.
 *
 * TOUJOURS VISIBLE, GRISÉ QUAND IL N'Y A RIEN. C'est ce qui en apprend
 * l'existence : un bouton qui surgit une fois la condition remplie n'enseigne
 * rien, un bouton grisé pose une question. Mais un bouton mort qui ne dit pas
 * pourquoi frustre — celui-ci s'explique quand on le touche.
 *
 * Sur les trois onglets et pas seulement la Carte : on flashe autant depuis la
 * Chasse et le Trajet, et un bouton présent ici mais absent là ne s'apprend
 * jamais. Le récap de fin de Chasse ou de Trajet reste ce qu'il était ; celui-ci
 * rattrape tout le reste, y compris une sortie improvisée.
 *
 * @param {'carte'|'terrain'} variante  jeu de styles de l'écran d'accueil :
 *   la Carte a des pastilles pleines, la Chasse et le Trajet des cercles bordés.
 */
export default function BoutonPartageSortie({ style, variante = 'terrain', taille = 20 }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { derniere, ouvrir } = useSorties();

  const surCarte = variante === 'carte';
  const couleur = surCarte ? theme.textPrimary : theme.accent;

  return (
    <TouchableOpacity
      style={[style, !derniere && styles.inactif]}
      onPress={() => (derniere
        ? ouvrir(derniere)
        : Alert.alert(t('sorties.title'), t('sorties.btnDisabled')))}
      accessibilityRole="button"
      accessibilityLabel={t('sorties.btnLabel')}
      accessibilityState={{ disabled: !derniere }}
    >
      <Ionicons name="share-social-outline" size={taille} color={couleur} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Même atténuation que le bouton de localisation de la Carte quand le GPS
  // manque : deux boutons inertes côte à côte doivent se ressembler.
  inactif: { opacity: 0.4 },
});
