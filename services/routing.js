/**
 * services/routing.js — couche « navigation » centralisée (hybride).
 *
 *   Recherche d'adresses (geocode / autocomplete) → MAPBOX (meilleure UX)
 *   Itinéraires (route / multiRoute)              → OpenRouteService (ORS)
 *                                                   (piéton/vélo spécialisés,
 *                                                    pas de limite de waypoints)
 *
 * Interface stable utilisée par TrajetScreen et ChasseScreen.
 * Sorties géo en [lon, lat] (comme avant).
 */

import i18n from '../i18n';
import { ORS_API_KEY } from '../config/ors';
import { MAPBOX_TOKEN } from '../config/mapbox';

// ─── MAPBOX : géocodage / autocomplétion ────────────────────────────────────────

const MAPBOX_FORWARD = 'https://api.mapbox.com/search/geocode/v6/forward';

async function mapboxForward(text, { focus, country, language, limit, autocomplete }) {
  const params = new URLSearchParams({
    q: text,
    access_token: MAPBOX_TOKEN,
    limit: String(limit),
    autocomplete: String(!!autocomplete),
  });
  if (focus && focus.length === 2) params.set('proximity', `${focus[0]},${focus[1]}`); // [lon,lat]
  if (country)  params.set('country', String(country).toLowerCase());
  if (language) params.set('language', String(language).slice(0, 2));

  const res = await fetch(`${MAPBOX_FORWARD}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.features ?? [])
    .map((f) => ({
      label: f.properties?.full_address || f.properties?.name || f.properties?.place_formatted || '',
      coords: f.geometry?.coordinates, // [lon, lat]
    }))
    .filter((x) => Array.isArray(x.coords) && x.coords.length === 2);
}

/** Suggestions d'adresses. focus = [lon,lat] (position GPS) ; opts = { country, language }. */
export async function autocomplete(text, focus, opts = {}) {
  try {
    return await mapboxForward(text, {
      focus, country: opts.country, language: opts.language, limit: 6, autocomplete: true,
    });
  } catch {
    return [];
  }
}

/** Géocode une adresse → { coords:[lon,lat], label }. Throw si introuvable. */
export async function geocode(text, opts = {}) {
  let list;
  try {
    list = await mapboxForward(text, {
      focus: opts.focus, country: opts.country, language: opts.language, limit: 1, autocomplete: false,
    });
  } catch {
    throw new Error(i18n.t('routing.error.addressNotFound'));
  }
  if (!list.length) throw new Error(i18n.t('routing.error.addressNotFoundFor', { text }));
  return list[0];
}

// ─── ORS : itinéraires (inchangé) ───────────────────────────────────────────────

/** Itinéraire A→B. Retourne la polyligne [[lon,lat], …]. */
export async function route(from, to, profile) {
  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [from, to] }),
    }
  );
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
  return coords;
}

/** Itinéraire à arrêts multiples (boucle de chasse). { coords, durationMin }. */
export async function multiRoute(waypointsLonLat, profile) {
  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: waypointsLonLat }),
    }
  );
  if (!res.ok) {
    let msg = i18n.t('routing.error.routeCalc');
    try { const e = await res.json(); msg = e?.error?.message ?? e?.message ?? msg; } catch (_) {}
    throw new Error(msg);
  }
  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error(i18n.t('routing.error.routeNotFound'));
  return {
    coords: feature.geometry.coordinates,
    durationMin: Math.round(feature.properties.summary.duration / 60),
  };
}
