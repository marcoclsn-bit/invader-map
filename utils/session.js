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

// Largeur du couloir dans lequel un Invader compte comme « croisé ». Le seuil
// est sensible : sur une sortie réelle au Marais, 150 m donnaient 6 manqués
// pour 25 flashés, 200 m en donnaient 20. Au-delà, on ne raconte plus le
// parcours mais le quartier — et le tapis gris efface ce qui a été trouvé.
const MANQUE_KM = 0.15;
// Garde-fou de rendu, pas de sens : sans lui, une longue balade dans un secteur
// dense pourrait poser des centaines de sprites sur la carte de partage.
const MANQUE_MAX = 40;

// Distance point → segment, en plan local (exact à cette échelle, et sans le
// coût d'un haversine par segment).
function distSegmentKm(lat, lng, a, b) {
  const ky = 111.32;
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const px = lng * kx, py = lat * ky;
  const ax = a[0] * kx, ay = a[1] * ky;
  const bx = b[0] * kx, by = b[1] * ky;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Invaders jamais flashés situés le long d'un parcours — ce qu'il reste à
 * trouver, pas ce qui a été raté aujourd'hui : un Invader flashé le mois
 * dernier n'apparaît pas. La carte de partage les montre en gris effacé.
 *
 * Les détruits sont écartés : les afficher enverrait chercher une mosaïque
 * qui n'existe plus.
 *
 * @param invaders liste de la ville — { id, lat, lng, status }
 * @param route    [[lng,lat],…] déjà rogné
 * @param flashed  Set des ids flashés (toutes sorties confondues)
 * @returns {{lng:number,lat:number}[]} triés du plus proche du tracé au plus loin
 */
export function missedAlongRoute(invaders, route, flashed, limite = MANQUE_MAX) {
  if (!Array.isArray(invaders) || !Array.isArray(route) || route.length < 2) return [];

  // Préfiltre par boîte englobante : évite un calcul de distance sur les
  // 1 500 Invaders de la ville quand le parcours en traverse une poignée de rues.
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const c of route) {
    if (c[0] < minLng) minLng = c[0];
    if (c[0] > maxLng) maxLng = c[0];
    if (c[1] < minLat) minLat = c[1];
    if (c[1] > maxLat) maxLat = c[1];
  }
  const padLat = MANQUE_KM / 111.32;
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) || 1;
  const padLng = MANQUE_KM / (111.32 * cosLat);

  const out = [];
  for (const inv of invaders) {
    if (!inv || inv.status === 'destroyed') continue;
    if (flashed?.has?.(inv.id)) continue;
    if (inv.lng < minLng - padLng || inv.lng > maxLng + padLng) continue;
    if (inv.lat < minLat - padLat || inv.lat > maxLat + padLat) continue;

    let best = Infinity;
    for (let i = 0; i < route.length - 1; i++) {
      const d = distSegmentKm(inv.lat, inv.lng, route[i], route[i + 1]);
      if (d < best) best = d;
      if (best <= 0.001) break;
    }
    if (best <= MANQUE_KM) out.push({ lng: inv.lng, lat: inv.lat, d: best });
  }

  out.sort((a, b) => a.d - b.d);
  return out.slice(0, limite).map(({ lng, lat }) => ({ lng, lat }));
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
