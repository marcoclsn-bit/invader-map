import { createNavigationContainerRef } from '@react-navigation/native';

// Référence de navigation accessible hors composants (ex. au tap d'une notification).
export const navigationRef = createNavigationContainerRef();

/**
 * Centre la carte sur un Invader et ouvre sa fiche (réutilise le focus de MapScreen).
 * Attend que la navigation soit prête (utile au démarrage à froid depuis une notif).
 */
export function focusInvaderOnMap(invId, { onCity } = {}, attempt = 0) {
  if (!invId) return;
  // La ville est encodée dans l'id (ex. PA_649 → PA)
  const i = invId.lastIndexOf('_');
  const cityCode = i > 0 ? invId.slice(0, i) : null;
  if (cityCode && onCity) onCity(cityCode);

  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', {
      screen: 'Tabs',
      params: { screen: 'Carte', params: { focusId: invId, _ts: Date.now() } },
    });
  } else if (attempt < 20) {
    // navigation pas encore montée (cold start) → on réessaie brièvement
    setTimeout(() => focusInvaderOnMap(invId, { onCity }, attempt + 1), 150);
  }
}

/**
 * Ouvre l'écran Actus (tiroir latéral, pas un onglet).
 * Même réessai que ci-dessus : au démarrage à froid depuis une notification, la
 * navigation n'est pas encore montée et l'app resterait sur la Carte.
 */
export function openNews(attempt = 0) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', { screen: 'News' });
  } else if (attempt < 20) {
    setTimeout(() => openNews(attempt + 1), 150);
  }
}
