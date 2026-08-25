import { Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Demandes de permission de localisation — la règle qui évite le 3e refus.
 *
 * Google Play a refusé l'app deux fois pour « prominent disclosure ». Le trou
 * restant : la Carte, le Trajet et la Chasse déclenchaient la boîte système
 * AUTOMATIQUEMENT à leur montage. Quelqu'un qui touche « Passer » à
 * l'onboarding — l'examinateur, typiquement — atterrissait sur la Carte et
 * voyait surgir la demande sans aucune divulgation à l'écran.
 *
 * LA RÈGLE, sur Android : la boîte système n'apparaît jamais d'elle-même. Au
 * montage d'un écran, on ne fait que LIRE l'état (aucune boîte). La demande ne
 * part que sur un GESTE dont la position est le but évident — « Me localiser »,
 * générer une chasse autour de soi. Dans ce contexte, la demande est dans
 * l'attente raisonnable de l'utilisateur, ce que la politique exige.
 *
 * iOS GARDE SON COMPORTEMENT : demande au montage, comme dans la version
 * qu'Apple a approuvée. Même motif de bornage que le volet Balade et le
 * correctif du tiroir — on ne change pas ce qu'un magasin a déjà validé.
 */

/** Au montage d'un écran. Android : lecture seule, JAMAIS de boîte. */
export async function permissionAuMontage() {
  if (Platform.OS === 'android') {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Sur un geste explicite de l'utilisateur : là, demander est légitime. */
export async function permissionSurGeste() {
  const avant = await Location.getForegroundPermissionsAsync();
  if (avant.status === 'granted') return true;
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}
