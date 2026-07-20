/**
 * services/routing.js — couche « navigation » centralisée (hybride) + GARDE-FOUS.
 *
 *   Recherche d'adresses (geocode / autocomplete) → MAPBOX
 *   Itinéraires (route / multiRoute)              → OpenRouteService (ORS)
 *
 * Garde-fous anti-dépassement de quota (tout est ici) :
 *   1. CACHE en mémoire des résultats identiques (aucun appel répété).
 *   2. PLAFOND d'appels par API et par JOUR (constante DAILY_CAPS ci-dessous) :
 *      au-delà, on N'APPELLE PLUS et on renvoie une erreur claire.
 *   3. Le debounce de l'autocomplétion est géré côté écrans (300 ms, 3 caractères min).
 *
 * ⚠️ Ces plafonds sont PAR APPAREIL. Ils protègent contre une boucle/emballement
 *    local, PAS contre le volume agrégé de tous les utilisateurs → configure AUSSI
 *    un plafond côté fournisseur (Mapbox & ORS), cf. note en bas de fichier.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { ORS_API_KEY } from '../config/ors';
import { MAPBOX_TOKEN } from '../config/mapbox';

// ─── Plafonds de sécurité (FACILES À MODIFIER) ──────────────────────────────────
// Appels max par API et par jour, par appareil.
export const DAILY_CAPS = {
  mapbox: 500, // géocodage + autocomplétion (l'appel le plus fréquent)
  ors: 300,    // itinéraires (déclenchés par action utilisateur, volume faible)
};

// ─── Cache mémoire (TTL) ────────────────────────────────────────────────────────
const TTL_AUTOCOMPLETE = 10 * 60 * 1000;      // 10 min (suggestions volatiles)
const TTL_STABLE = 24 * 60 * 60 * 1000;       // 24 h (géocode exact / itinéraires)
const MAX_CACHE = 200;
const _cache = new Map(); // key -> { value, exp }

function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) { _cache.delete(key); return undefined; }
  return e.value;
}
function cacheSet(key, value, ttl) {
  if (_cache.size >= MAX_CACHE) _cache.delete(_cache.keys().next().value); // évince le plus ancien
  _cache.set(key, { value, exp: Date.now() + ttl });
}
const roundPt = (c) => `${(+c[0]).toFixed(5)},${(+c[1]).toFixed(5)}`;

// ─── Compteur quotidien (miroir mémoire + persistance) ──────────────────────────
const KEY_CALLS = '@invader_api_calls';
let _counts = null; // { day, mapbox, ors }
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
async function ensureCounts() {
  if (_counts && _counts.day === todayKey()) return _counts;
  try {
    const raw = await AsyncStorage.getItem(KEY_CALLS);
    const o = raw ? JSON.parse(raw) : null;
    _counts = o && o.day === todayKey() ? o : { day: todayKey(), mapbox: 0, ors: 0 };
  } catch (_) {
    _counts = { day: todayKey(), mapbox: 0, ors: 0 };
  }
  return _counts;
}
async function underCap(api) {
  const c = await ensureCounts();
  return (c[api] ?? 0) < DAILY_CAPS[api];
}
function bump(api) {
  if (!_counts) return;
  _counts[api] = (_counts[api] ?? 0) + 1;
  AsyncStorage.setItem(KEY_CALLS, JSON.stringify(_counts)).catch(() => {});
}
const RATE_LIMIT = 'RATE_LIMIT'; // marqueur d'erreur interne

// Réserve un appel Mapbox (ex. carte statique du partage) : compte dans le même
// plafond quotidien que le géocodage. Renvoie true si sous le plafond (et incrémente).
export async function reserveMapboxCall() {
  if (!(await underCap('mapbox'))) return false;
  bump('mapbox');
  return true;
}

// ─── MAPBOX : géocodage / autocomplétion ────────────────────────────────────────

const MAPBOX_FORWARD = 'https://api.mapbox.com/search/geocode/v6/forward';

async function mapboxForward(text, { focus, country, language, limit, autocomplete }) {
  const q = String(text || '').trim();
  const key = `mb|${autocomplete ? 'a' : 'g'}|${country || ''}|${language || ''}|${q.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached; // ← aucun appel réseau

  if (!(await underCap('mapbox'))) throw new Error(RATE_LIMIT); // plafond atteint

  const params = new URLSearchParams({
    q,
    access_token: MAPBOX_TOKEN,
    limit: String(limit),
    autocomplete: String(!!autocomplete),
  });
  if (focus && focus.length === 2) params.set('proximity', `${focus[0]},${focus[1]}`);
  if (country) params.set('country', String(country).toLowerCase());
  if (language) params.set('language', String(language).slice(0, 2));

  const res = await fetch(`${MAPBOX_FORWARD}?${params.toString()}`);
  bump('mapbox');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const out = (json.features ?? [])
    .map((f) => ({
      label: f.properties?.full_address || f.properties?.name || f.properties?.place_formatted || '',
      coords: f.geometry?.coordinates,
    }))
    .filter((x) => Array.isArray(x.coords) && x.coords.length === 2);

  cacheSet(key, out, autocomplete ? TTL_AUTOCOMPLETE : TTL_STABLE);
  return out;
}

/** Suggestions d'adresses. focus = [lon,lat] ; opts = { country, language }. */
export async function autocomplete(text, focus, opts = {}) {
  try {
    return await mapboxForward(text, {
      focus, country: opts.country, language: opts.language, limit: 6, autocomplete: true,
    });
  } catch (_) {
    return []; // silencieux (plafond atteint ou réseau) : pas de spam dans la saisie
  }
}

/** Géocode une adresse → { coords:[lon,lat], label }. Throw si introuvable/limite. */
export async function geocode(text, opts = {}) {
  let list;
  try {
    list = await mapboxForward(text, {
      focus: opts.focus, country: opts.country, language: opts.language, limit: 1, autocomplete: false,
    });
  } catch (e) {
    if (e.message === RATE_LIMIT) throw new Error(i18n.t('routing.error.limit'));
    throw new Error(i18n.t('routing.error.addressNotFound'));
  }
  if (!list.length) throw new Error(i18n.t('routing.error.addressNotFoundFor', { text }));
  return list[0];
}

// ─── ORS : itinéraires ──────────────────────────────────────────────────────────

/** Itinéraire A→B. Retourne la polyligne [[lon,lat], …]. */
export async function route(from, to, profile) {
  const key = `rt|${profile}|${roundPt(from)}|${roundPt(to)}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  if (!(await underCap('ors'))) throw new Error(i18n.t('routing.error.limit'));

  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [from, to] }),
    }
  );
  bump('ors');
  if (!res.ok) {
    try {
      const err = await res.json();
      const msg = err?.error?.message ?? err?.message;
      if (msg) throw new Error(msg);
    } catch (_) { /* ignore parse */ }
    throw new Error(i18n.t('routing.error.routeNotFound'));
  }
  const json = await res.json();
  const coords = json.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) throw new Error(i18n.t('routing.error.routeNotFound'));

  cacheSet(key, coords, TTL_STABLE);
  return coords;
}

/** Itinéraire à arrêts multiples (boucle de chasse). { coords, durationMin }. */
export async function multiRoute(waypointsLonLat, profile) {
  const key = `mr|${profile}|${waypointsLonLat.map(roundPt).join(';')}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  if (!(await underCap('ors'))) throw new Error(i18n.t('routing.error.limit'));

  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: waypointsLonLat }),
    }
  );
  bump('ors');
  if (!res.ok) {
    let msg = i18n.t('routing.error.routeCalc');
    try { const e = await res.json(); msg = e?.error?.message ?? e?.message ?? msg; } catch (_) {}
    throw new Error(msg);
  }
  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error(i18n.t('routing.error.routeNotFound'));
  const result = {
    coords: feature.geometry.coordinates,
    durationMin: Math.round(feature.properties.summary.duration / 60),
  };

  cacheSet(key, result, TTL_STABLE);
  return result;
}

// ─── NOTE IMPORTANTE (côté fournisseur) ─────────────────────────────────────────
// Les plafonds ci-dessus sont PAR APPAREIL. Configure aussi, côté compte :
//   • Mapbox : dashboard → un budget/alerte d'usage (Account → Usage / Billing).
//   • ORS    : la clé gratuite est déjà plafonnée par leur quota (≈2000/j) ; surveille
//              l'usage sur openrouteservice.org/dev.
