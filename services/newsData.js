/**
 * services/newsData.js
 *
 * Fil d'actualité (News) — chargé comme les données Invaders :
 *   - cache local AsyncStorage (lecture instantanée + hors-ligne)
 *   - fetch distant en arrière-plan, mise à jour du cache si plus récent
 *
 * Source distante : BASE_URL/news.json (même dépôt que les données).
 * Tolérant : si le fichier n'existe pas encore (404) ou hors-ligne → on garde
 * le cache (ou un fil vide). Jamais d'erreur bloquante.
 *
 * Clé AsyncStorage : @invader_news
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import BUNDLED_NEWS from '../data/news.json'; // fallback embarqué (offline / pas encore publié)

const BASE_URL  = 'https://raw.githubusercontent.com/marcoclsn-bit/invader-map/main/data';
const NEWS_URL  = `${BASE_URL}/news.json`;
const KEY_NEWS  = '@invader_news';

function isValid(json) {
  return json && typeof json === 'object' && Array.isArray(json.events);
}

// Baseline embarquée (toujours valide). Le cache puis le distant la remplacent.
const BASELINE = isValid(BUNDLED_NEWS) ? BUNDLED_NEWS : { version: 0, updatedAt: null, events: [] };

/** Lit le fil depuis le cache, sinon la baseline embarquée. */
export async function getCachedNews() {
  try {
    const raw = await AsyncStorage.getItem(KEY_NEWS);
    if (!raw) return BASELINE;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return BASELINE;
    // Garde la plus récente entre cache et baseline (utile si l'app est mise à jour)
    return (parsed.version ?? 0) >= (BASELINE.version ?? 0) ? parsed : BASELINE;
  } catch {
    return BASELINE;
  }
}

/**
 * Récupère le fil distant. Met à jour le cache uniquement si la version est plus
 * récente. Retourne le fil le plus à jour disponible (distant si OK, sinon cache).
 */
export async function fetchNews() {
  const cached = await getCachedNews();
  try {
    const res = await fetch(NEWS_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return cached; // 404 (pas encore publié) ou autre → on garde le cache
    const json = await res.json();
    if (!isValid(json)) return cached;

    const remoteVersion = typeof json.version === 'number' ? json.version : 0;
    if (remoteVersion >= (cached.version ?? 0)) {
      await AsyncStorage.setItem(KEY_NEWS, JSON.stringify(json));
      return json;
    }
    return cached;
  } catch {
    return cached; // hors-ligne → cache
  }
}
