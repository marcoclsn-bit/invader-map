/**
 * services/invaderData.js
 *
 * Source unique de vérité pour les données Invaders.
 * Stratégie : cache-first + rafraîchissement distant en arrière-plan.
 *
 * Séquence au démarrage (initInvaderData) :
 *   1. Retourne immédiatement les données disponibles (cache AsyncStorage
 *      si version plus récente que l'embarquée, sinon copie embarquée).
 *   2. Lance en arrière-plan un fetch du JSON distant ; si la version distante
 *      est plus récente, met à jour le cache et notifie les abonnés.
 *
 * Format du JSON distant attendu :
 *   { "version": 2, "updatedAt": "2026-07-01", "invaders": [...] }
 *
 * La progression utilisateur (flashed, labels, colorOverrides) n'est JAMAIS
 * touchée ici — elle vit dans AppContext, indexée par id d'Invader.
 * Un id qui disparaît des nouvelles données devient invisible mais sa
 * progression reste intacte dans AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  INVADERS as EMBEDDED,
  INVADERS_VERSION,
  INVADERS_UPDATED_AT,
} from '../data/invaders';

// ─── URL configurable ─────────────────────────────────────────────────────────
// Remplace par l'URL GitHub raw quand le fichier est publié dans le repo.
// Format attendu : { version, updatedAt, invaders: [...] }
export const DATA_URL =
  'https://raw.githubusercontent.com/marcoclsn-bit/invader-map/main/data/invaders.json';

// ─── Clés AsyncStorage ────────────────────────────────────────────────────────
const KEY_DATA = '@invader_remote_data';
const KEY_META = '@invader_remote_meta';

// ─── État module (singleton) ──────────────────────────────────────────────────
let _invaders  = EMBEDDED;
let _version   = INVADERS_VERSION;
let _updatedAt = INVADERS_UPDATED_AT;
const _listeners = new Set();

function _notify() {
  const payload = { invaders: _invaders, version: _version, updatedAt: _updatedAt };
  _listeners.forEach((fn) => fn(payload));
}

// ─── API publique ─────────────────────────────────────────────────────────────

/** Données actuellement en mémoire (embarquées, cache, ou dernière version distante). */
export function getInvaders() { return _invaders; }

/** Métadonnées de la version courante. */
export function getDataMeta() {
  return { version: _version, updatedAt: _updatedAt };
}

/**
 * Abonne une fonction aux mises à jour de données.
 * Retourne un unsubscribe.
 */
export function onDataUpdate(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Initialise le module au démarrage.
 * - Charge le cache synchronisé (AsyncStorage) si plus récent que l'embarqué.
 * - Lance le fetch distant en arrière-plan (fire & forget).
 * - Retourne immédiatement les données disponibles.
 */
export async function initInvaderData() {
  await _loadCache();
  _fetchRemote().catch(() => {}); // arrière-plan, échec silencieux
  return { invaders: _invaders, version: _version, updatedAt: _updatedAt };
}

/**
 * Vérification manuelle (bouton Réglages).
 * Retourne un statut :
 *   'up_to_date'       — déjà à la dernière version
 *   'updated_vX'       — nouvelle version X installée
 *   'offline'          — réseau absent ou erreur HTTP
 *   'error'            — JSON invalide ou autre problème
 */
export async function checkForUpdate() {
  return _fetchRemote();
}

// ─── Implémentation privée ────────────────────────────────────────────────────

async function _loadCache() {
  try {
    const metaRaw = await AsyncStorage.getItem(KEY_META);
    if (!metaRaw) return;

    const meta = JSON.parse(metaRaw);
    // N'utilise le cache que s'il est strictement plus récent que l'embarqué
    if (typeof meta.version !== 'number' || meta.version <= INVADERS_VERSION) return;

    const dataRaw = await AsyncStorage.getItem(KEY_DATA);
    if (!dataRaw) return;

    const data = JSON.parse(dataRaw);
    if (!Array.isArray(data) || data.length < 100) return; // sanity check

    _invaders  = data;
    _version   = meta.version;
    _updatedAt = meta.updatedAt ?? '';
  } catch (e) {
    console.log('[InvaderData] Cache read error:', e.message);
  }
}

async function _fetchRemote() {
  try {
    const res = await fetch(DATA_URL, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    // Validation minimale de la structure
    if (
      typeof json.version !== 'number' ||
      !Array.isArray(json.invaders) ||
      json.invaders.length < 100
    ) {
      throw new Error('Structure JSON invalide');
    }

    if (json.version <= _version) return 'up_to_date';

    // Mise à jour en mémoire
    _invaders  = json.invaders;
    _version   = json.version;
    _updatedAt = json.updatedAt ?? '';

    // Persistance cache
    await AsyncStorage.setItem(KEY_DATA, JSON.stringify(json.invaders));
    await AsyncStorage.setItem(KEY_META, JSON.stringify({
      version: _version,
      updatedAt: _updatedAt,
    }));

    _notify(); // notifie AppContext → re-render des écrans
    return `updated_v${_version}`;

  } catch (e) {
    const msg = String(e.message ?? '');
    console.log('[InvaderData] Remote fetch error:', msg);
    // Distingue réseau absent de problème de données
    if (/network|fetch|econnrefused|timeout|http/i.test(msg)) return 'offline';
    return 'error';
  }
}
