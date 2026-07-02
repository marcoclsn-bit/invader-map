/**
 * services/invaderData.js
 *
 * Source unique de vérité pour les données Invaders — architecture multi-villes.
 *
 * Deux types de données :
 *   Index  — liste légère des villes (code, nom, count, version, centre, bbox).
 *            Chargé au démarrage. Cache + fetch en arrière-plan.
 *   Ville  — tableau d'Invaders d'une ville spécifique.
 *            Chargé à la demande. Cache + fetch en arrière-plan.
 *            Paris : fallback embarqué dans data/invaders.js.
 *
 * URLs distantes :
 *   BASE_URL/index.json
 *   BASE_URL/invaders_<CODE>.json
 *
 * Clés AsyncStorage :
 *   @invader_index_v2            — index complet (JSON stringifié)
 *   @invader_data_<CODE>         — tableau d'Invaders d'une ville
 *   @invader_meta_<CODE>         — { version, updatedAt } d'une ville
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  INVADERS as EMBEDDED_PA,
  INVADERS_VERSION as EMBEDDED_PA_VERSION,
  INVADERS_UPDATED_AT as EMBEDDED_PA_DATE,
} from '../data/invaders';

// ─── URLs ─────────────────────────────────────────────────────────────────────

const BASE_URL  = 'https://raw.githubusercontent.com/marcoclsn-bit/invader-map/main/data';
const INDEX_URL = `${BASE_URL}/index.json`;
const cityUrl   = (code) => `${BASE_URL}/invaders_${code}.json`;

// ─── Clés AsyncStorage ────────────────────────────────────────────────────────

const KEY_INDEX     = '@invader_index_v2';
const cityDataKey   = (code) => `@invader_data_${code}`;
const cityMetaKey   = (code) => `@invader_meta_${code}`;

// ─── État module (singleton) ──────────────────────────────────────────────────

let _cityIndex = [];

const _cityData = new Map();
_cityData.set('PA', {
  invaders:  EMBEDDED_PA,
  version:   EMBEDDED_PA_VERSION,
  updatedAt: EMBEDDED_PA_DATE,
});

const _listeners = new Set();

function _notify(cityCode) {
  const data = _cityData.get(cityCode);
  if (!data) return;
  _listeners.forEach(fn => fn({ cityCode, ...data }));
}

// ─── API publique ─────────────────────────────────────────────────────────────

/** Liste des villes (depuis l'index). Vide avant initInvaderService(). */
export function getCityIndex() { return _cityIndex; }

/** Données en mémoire pour une ville (null si pas encore chargée). */
export function getCityData(code) { return _cityData.get(code) ?? null; }

/** Version et date d'une ville en mémoire. */
export function getCityMeta(code) {
  const d = _cityData.get(code);
  return d ? { version: d.version, updatedAt: d.updatedAt } : null;
}

/** Abonne une fonction aux mises à jour de données. Retourne un unsubscribe. */
export function onCityUpdate(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Initialise le service : charge l'index depuis le cache, fetch en arrière-plan.
 * Retourne l'index disponible (peut être vide si première utilisation sans réseau).
 */
export async function initInvaderService() {
  await _loadIndexCache();
  _fetchIndex().catch(() => {});
  return _cityIndex;
}

/**
 * Charge les données d'une ville :
 *   - Utilise le cache si plus récent que l'embarqué (PA) ou que rien (autres villes).
 *   - Lance le fetch distant en arrière-plan.
 *   - Retourne immédiatement les données disponibles.
 */
export async function loadCityData(code) {
  await _loadCityCache(code);
  _fetchCity(code).catch(() => {});
  return _cityData.get(code) ?? null;
}

/**
 * Vérification manuelle (bouton Réglages).
 * Retourne : 'up_to_date' | 'updated_vX' | 'offline' | 'error'
 */
export async function checkCityForUpdate(code) {
  return _fetchCity(code);
}

/** Alias maintenu pour la compatibilité avec AppContext. */
export async function checkForUpdate(code = 'PA') {
  return checkCityForUpdate(code);
}

// ─── Implémentation privée ────────────────────────────────────────────────────

async function _loadIndexCache() {
  try {
    const raw = await AsyncStorage.getItem(KEY_INDEX);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.cities) && parsed.cities.length > 0) {
      _cityIndex = parsed.cities;
    }
  } catch (e) {
    __DEV__ && console.log('[InvaderData] Index cache error:', e.message);
  }
}

async function _fetchIndex() {
  try {
    const res = await fetch(INDEX_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json?.cities) || json.cities.length === 0) throw new Error('Index invalide');
    _cityIndex = json.cities;
    await AsyncStorage.setItem(KEY_INDEX, JSON.stringify(json));
  } catch (e) {
    __DEV__ && console.log('[InvaderData] Index fetch error:', e.message);
  }
}

async function _loadCityCache(code) {
  try {
    const metaRaw = await AsyncStorage.getItem(cityMetaKey(code));
    if (!metaRaw) return;
    const meta = JSON.parse(metaRaw);
    if (typeof meta.version !== 'number') return;

    // Pour Paris : n'utilise le cache que si plus récent que l'embarqué
    const embeddedVersion = code === 'PA' ? EMBEDDED_PA_VERSION : 0;
    if (meta.version <= embeddedVersion) return;

    const dataRaw = await AsyncStorage.getItem(cityDataKey(code));
    if (!dataRaw) return;
    const data = JSON.parse(dataRaw);
    if (!Array.isArray(data) || data.length < 1) return;

    _cityData.set(code, {
      invaders:  data,
      version:   meta.version,
      updatedAt: meta.updatedAt ?? '',
    });
  } catch (e) {
    __DEV__ && console.log(`[InvaderData] Cache error for ${code}:`, e.message);
  }
}

async function _fetchCity(code) {
  try {
    const res = await fetch(cityUrl(code), { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (
      typeof json.version !== 'number' ||
      !Array.isArray(json.invaders) ||
      json.invaders.length < 1
    ) {
      throw new Error('Structure invalide');
    }

    const current = _cityData.get(code);
    if (current && json.version <= current.version) return 'up_to_date';

    _cityData.set(code, {
      invaders:  json.invaders,
      version:   json.version,
      updatedAt: json.updatedAt ?? '',
    });

    await AsyncStorage.setItem(cityDataKey(code), JSON.stringify(json.invaders));
    await AsyncStorage.setItem(cityMetaKey(code), JSON.stringify({
      version:   json.version,
      updatedAt: json.updatedAt ?? '',
    }));

    _notify(code);
    return `updated_v${json.version}`;

  } catch (e) {
    const msg = String(e.message ?? '');
    __DEV__ && console.log(`[InvaderData] Fetch error for ${code}:`, msg);
    if (/network|fetch|econnrefused|timeout|http/i.test(msg)) return 'offline';
    return 'error';
  }
}
