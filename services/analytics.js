// services/analytics.js
//
// Fine couche au-dessus d'Aptabase (analytics de fréquentation, privacy-first).
// Tout passe par ici pour :
//   - ne RIEN envoyer si aucune clé n'est configurée (config/aptabase.js) ;
//   - ne jamais faire planter l'app si le SDK échoue (tout est try/catch).
//
// Aptabase ne collecte aucune donnée personnelle : ni identifiant publicitaire, ni
// localisation précise, ni contenu. Juste des compteurs anonymes agrégés
// (ouvertures, écrans visités, événements). La région (EU) est déduite du préfixe
// de la clé (A-EU-…), donc rien d'autre à configurer.

import Aptabase, { trackEvent } from '@aptabase/react-native';
import { APTABASE_KEY } from '../config/aptabase';

let enabled = false;

/** À appeler une seule fois au tout début (App.js). Sans clé → ne fait rien. */
export function initAnalytics() {
  if (!APTABASE_KEY || enabled) return;
  try {
    Aptabase.init(APTABASE_KEY);
    enabled = true;
  } catch (e) {
    if (__DEV__) console.log('[analytics] init :', e?.message);
  }
}

/** Enregistre un événement anonyme. No-op si l'analytics est désactivé. */
export function track(name, props) {
  if (!enabled) return;
  try {
    trackEvent(name, props);
  } catch (e) {
    if (__DEV__) console.log('[analytics] track :', e?.message);
  }
}
