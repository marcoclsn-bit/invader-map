/**
 * utils/session.js — Modèle « session de chasse » (objets JS simples, pas de TS).
 *
 * Une HuntingSession regroupe une période d'activité (Chasse navigée ou Balade)
 * avec sa durée, sa distance (si trackée) et les Invaders flashés pendant.
 *
 *   {
 *     id, source:'hunt'|'stroll'|'auto',
 *     startedAt, endedAt,        // ISO
 *     durationSec, distanceKm,   // distanceKm = null si non tracké
 *     invaderIds: string[],
 *     city, district,            // district optionnel
 *     routeCoords,               // [[lon,lat],…] optionnel (carte de partage)
 *   }
 */

import { INVADER_DISTRICT } from './arrondissement';

export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function genSessionId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function extractCityCode(id) {
  const i = id.lastIndexOf('_');
  return i > 0 ? id.substring(0, i) : id;
}

/** IDs flashés dans [startMs, endMs] d'après flashedDates (Map id→ISO). */
export function invaderIdsInRange(flashedDates, startMs, endMs) {
  const out = [];
  if (!flashedDates) return out;
  for (const [id, iso] of flashedDates) {
    const ts = new Date(iso).getTime();
    if (Number.isFinite(ts) && ts >= startMs && ts <= endMs) out.push(id);
  }
  return out;
}

/** Arrondissement dominant parmi une liste d'IDs (Paris). null sinon. */
export function dominantDistrict(invaderIds) {
  const counts = new Map();
  for (const id of invaderIds) {
    const ar = INVADER_DISTRICT.get(id);
    if (ar) counts.set(ar, (counts.get(ar) ?? 0) + 1);
  }
  let best = null, bestN = 0;
  for (const [ar, n] of counts) if (n > bestN) { bestN = n; best = ar; }
  return best;
}

/** Construit une session normalisée à partir d'un brouillon. */
export function makeSession({
  source = 'hunt', startedAt, endedAt, distanceKm = null,
  invaderIds = [], city = null, district = null, routeCoords = null,
}) {
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  const durationSec = Math.max(0, Math.round((endMs - startMs) / 1000));
  return {
    id: genSessionId(),
    source,
    startedAt, endedAt, durationSec,
    distanceKm: distanceKm == null ? null : Math.round(distanceKm * 100) / 100,
    invaderIds,
    city,
    district: district ?? dominantDistrict(invaderIds),
    routeCoords: routeCoords && routeCoords.length > 1 ? routeCoords : null,
  };
}
