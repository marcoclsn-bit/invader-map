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

// ─── Repli d'itinéraire : ORS → Mapbox ──────────────────────────────────────────
//
// ORS BLOQUE au-delà de son quota (2 000 itinéraires/jour pour la clé entière,
// tous utilisateurs confondus) au lieu de facturer. Un pic de trafic couperait
// donc Trajet ET Chasse pour tout le monde, jusqu'à la remise à zéro — et
// changer de clé par OTA ne répondrait pas au problème : une mise à jour n'est
// prise qu'au prochain lancement de l'app, bien après la fin du pic.
//
// D'où ce repli : quand ORS refuse POUR CAUSE DE QUOTA, on bascule sur Mapbox
// Directions (100 000 requêtes/mois incluses, et facturé plutôt que bloqué).
// On ne bascule PAS sur une erreur de calcul ordinaire — « aucun itinéraire
// trouvé » est une vraie réponse, la masquer cacherait de vrais défauts.
const QUOTA = 'QUOTA'; // marqueur interne, jamais affiché

// Mapbox n'accepte que 25 points par requête, ORS en accepte 50 : une chasse de
// 48 étapes doit donc être découpée. Les tronçons se chevauchent d'un point
// pour que les segments se raccordent sans trou.
const MAPBOX_MAX_POINTS = 25;

const MAPBOX_PROFILE = { 'foot-walking': 'walking', 'cycling-regular': 'cycling' };

// Découpe [a,b,c,…] en tronçons de 25 max, chaque tronçon reprenant le dernier
// point du précédent : [0..24], [24..48], …
export function chunkWaypoints(pts) {
  if (pts.length <= MAPBOX_MAX_POINTS) return [pts];
  const out = [];
  for (let i = 0; i < pts.length - 1; i += MAPBOX_MAX_POINTS - 1) {
    out.push(pts.slice(i, i + MAPBOX_MAX_POINTS));
  }
  return out;
}

/**
 * Itinéraire Mapbox à N points. Même forme de retour que multiRoute côté ORS :
 * { coords, durationMin, legsMin } — `legsMin` est indispensable, c'est lui qui
 * permet à la Chasse d'ajuster la boucle au budget sans rappeler l'API.
 */
async function mapboxDirections(waypointsLonLat, profile) {
  const prof = MAPBOX_PROFILE[profile] ?? 'walking';
  const coords = [];
  const legsMin = [];
  let totalSec = 0;
  let totalM = 0;

  for (const chunk of chunkWaypoints(waypointsLonLat)) {
    if (!(await underCap('mapbox'))) throw new Error(i18n.t('routing.error.limit'));
    const path = chunk.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/${prof}/${path}`
      + `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    bump('mapbox');
    if (!res.ok) throw new Error(i18n.t('routing.error.routeNotFound'));
    const json = await res.json();
    const r = json.routes?.[0];
    if (!r?.geometry?.coordinates?.length) throw new Error(i18n.t('routing.error.routeNotFound'));

    // Le premier point d'un tronçon suivant duplique le dernier du précédent.
    const geo = r.geometry.coordinates;
    coords.push(...(coords.length ? geo.slice(1) : geo));
    for (const leg of r.legs ?? []) legsMin.push(leg.duration / 60);
    totalSec += r.duration ?? 0;
    totalM += r.distance ?? 0;
  }

  return {
    coords,
    durationMin: Math.round(totalSec / 60),
    legsMin: legsMin.length ? legsMin : null,
    // La distance était renvoyée par les deux fournisseurs et jetée. Elle sert
    // aux sorties reconstituées, qui n'ont aucune trace GPS : c'est la seule
    // façon d'annoncer des kilomètres qui soient VRAIS, mesurés sur les rues
    // plutôt qu'à vol d'oiseau.
    distanceKm: totalM ? Math.round(totalM / 10) / 100 : null,
  };
}

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
  // Copie volontaire. Rendre la référence du cache telle quelle faisait que
  // recalculer deux fois le même trajet reposait dans le state la valeur déjà
  // présente : React n'avait rien à re-rendre, les effets qui en dépendent ne
  // se relançaient pas, et le spinner « Recherche d'Invaders » tournait sans fin.
  if (cached !== undefined) return cached.slice();

  let coords;
  try {
    coords = await orsRoute([from, to], profile);
  } catch (e) {
    if (e.message !== QUOTA) throw e;   // vraie erreur → on la remonte telle quelle
    coords = (await mapboxDirections([from, to], profile)).coords;
  }
  if (!coords || coords.length < 2) throw new Error(i18n.t('routing.error.routeNotFound'));

  cacheSet(key, coords, TTL_STABLE);
  return coords;
}

/**
 * Appel ORS brut. Lève QUOTA — et seulement QUOTA — quand le refus vient du
 * plafond : plafond local par appareil, ou 429/403 renvoyé par leur serveur.
 * Toute autre erreur remonte telle quelle, pour ne pas masquer un vrai défaut.
 */
async function orsRoute(waypointsLonLat, profile) {
  if (!(await underCap('ors'))) throw new Error(QUOTA);

  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: waypointsLonLat }),
    }
  );
  bump('ors');
  if (res.status === 429 || res.status === 403) throw new Error(QUOTA);
  // Message d'ORS volontairement non repris : il est en anglais et technique.
  // (Le code d'origine tentait de l'extraire, mais son `throw` était à
  // l'intérieur du `try` et donc avalé par son propre `catch` — il n'a jamais
  // été affiché. On garde ce comportement plutôt que de le changer ici.)
  if (!res.ok) throw new Error(i18n.t('routing.error.routeNotFound'));
  return (await res.json()).features?.[0]?.geometry?.coordinates;
}

/** Itinéraire à arrêts multiples (boucle de chasse). { coords, durationMin }. */
export async function multiRoute(waypointsLonLat, profile) {
  const key = `mr|${profile}|${waypointsLonLat.map(roundPt).join(';')}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  let result;
  try {
    if (!(await underCap('ors'))) throw new Error(QUOTA);

    const res = await fetch(
      `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
      {
        method: 'POST',
        headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: waypointsLonLat }),
      }
    );
    bump('ors');
    if (res.status === 429 || res.status === 403) throw new Error(QUOTA);
    if (!res.ok) {
      let msg = i18n.t('routing.error.routeCalc');
      try { const e = await res.json(); msg = e?.error?.message ?? e?.message ?? msg; } catch (_) {}
      throw new Error(msg);
    }
    const json = await res.json();
    const feature = json.features?.[0];
    if (!feature) throw new Error(i18n.t('routing.error.routeNotFound'));
    // Durée par tronçon (leg entre 2 waypoints consécutifs) — sert à ajuster une
    // boucle de chasse au budget sans multiplier les appels ORS.
    const segs = feature.properties.segments;
    const metres = feature.properties.summary?.distance;
    result = {
      coords: feature.geometry.coordinates,
      durationMin: Math.round(feature.properties.summary.duration / 60),
      legsMin: Array.isArray(segs) ? segs.map(s => s.duration / 60) : null,
      distanceKm: Number.isFinite(metres) ? Math.round(metres / 10) / 100 : null,
    };
  } catch (e) {
    if (e.message !== QUOTA) throw e;   // vraie erreur de calcul → on la remonte
    // Quota ORS épuisé : Mapbox prend le relais, en découpant si nécessaire.
    result = await mapboxDirections(waypointsLonLat, profile);
  }

  cacheSet(key, result, TTL_STABLE);
  return result;
}

// ─── NOTE IMPORTANTE (côté fournisseur) ─────────────────────────────────────────
// Les plafonds ci-dessus sont PAR APPAREIL. Configure aussi, côté compte :
//   • Mapbox : dashboard → un budget/alerte d'usage (Account → Usage / Billing).
//   • ORS    : la clé gratuite est déjà plafonnée par leur quota (≈2000/j) ; surveille
//              l'usage sur openrouteservice.org/dev.
