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
import i18n from '../i18n';

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

// Motifs d'échec normalisés.
const REASONS = [
  ['routing.error.limit',            'api_limit'],
  ['routing.error.routeNotFound',    'route_not_found'],
  ['routing.error.addressNotFound',  'address_not_found'],
  ['route.error.noGps',              'no_gps'],
  ['route.error.noArrival',          'no_arrival'],
  ['route.error.noApiKey',           'no_api_key'],
  ['hunt.error.noInvadersReachable', 'no_invaders'],
];

/**
 * Réduit une erreur à un motif stable et anonyme.
 *
 * Deux raisons de ne JAMAIS envoyer `e.message` tel quel :
 *   - les erreurs sont levées DÉJÀ TRADUITES (services/routing.js), donc un même
 *     échec produirait quatre valeurs distinctes et aucun regroupement lisible ;
 *   - `routing.error.addressNotFoundFor` interpole l'adresse saisie par
 *     l'utilisateur, qui n'a rien à faire dans une mesure d'audience.
 */
export function failureReason(e) {
  const msg = String(e?.message ?? '').trim();
  if (!msg) return 'unknown';
  for (const [key, slug] of REASONS) {
    if (msg === i18n.t(key)) return slug;
  }
  // Variante interpolée : on compare le début du gabarit, jamais le texte saisi.
  const prefix = i18n.t('routing.error.addressNotFoundFor', { text: '' }).slice(0, 12).trim();
  if (prefix.length > 4 && msg.startsWith(prefix)) return 'address_not_found';
  if (/^HTTP \d+$/.test(msg)) return 'http_error';
  return 'other';
}
