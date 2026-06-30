import { useRef, useCallback } from 'react';
import { haversineKm } from '../../utils/session';

/**
 * Enregistreur de session pour la Chasse navigée.
 * Accumule la distance à partir des points GPS reçus (réutilise le watch existant
 * de l'écran Chasse — aucun GPS supplémentaire).
 *
 *   begin({ source, city, district, routeCoords })
 *   addPoint(lat, lng, accuracy)   // à brancher sur watchPositionAsync
 *   end() → brouillon de session { source, startedAt, endedAt, distanceKm, city, district, routeCoords }
 *   cancel()
 */
export function useSessionRecorder() {
  const ref = useRef(null);

  const begin = useCallback((meta = {}) => {
    ref.current = {
      source: meta.source ?? 'hunt',
      city: meta.city ?? null,
      district: meta.district ?? null,
      fallbackRoute: meta.routeCoords ?? null,
      startedAt: new Date().toISOString(),
      distanceKm: 0,
      last: null,
      coords: [],
    };
  }, []);

  const addPoint = useCallback((lat, lng, accuracy) => {
    const s = ref.current;
    if (!s || lat == null || lng == null) return;
    if (accuracy != null && accuracy > 40) return; // ignore les points trop imprécis
    if (s.last) {
      const d = haversineKm(s.last.lat, s.last.lng, lat, lng);
      // filtre le bruit GPS (3 m mini) et les sauts aberrants (500 m maxi entre 2 points)
      if (d >= 0.003 && d < 0.5) s.distanceKm += d;
    }
    s.last = { lat, lng };
    s.coords.push([lng, lat]);
  }, []);

  const end = useCallback(() => {
    const s = ref.current;
    if (!s) return null;
    ref.current = null;
    return {
      source: s.source,
      startedAt: s.startedAt,
      endedAt: new Date().toISOString(),
      distanceKm: Math.round(s.distanceKm * 100) / 100,
      city: s.city,
      district: s.district,
      routeCoords: s.coords.length > 1 ? s.coords : s.fallbackRoute,
    };
  }, []);

  const cancel = useCallback(() => { ref.current = null; }, []);
  const isActive = useCallback(() => !!ref.current, []);

  return { begin, addPoint, end, cancel, isActive };
}
