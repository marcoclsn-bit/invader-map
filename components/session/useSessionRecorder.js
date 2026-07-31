import { useRef, useCallback } from 'react';
import { haversineKm } from '../../utils/session';

/**
 * Enregistreur de session pour la Chasse et le Trajet navigués.
 * Accumule la distance à partir des points GPS reçus (réutilise le watch déjà
 * ouvert par l'écran — aucun GPS supplémentaire).
 *
 *   begin({ source, city, district, routeCoords })
 *   addPoint(lat, lng, accuracy)   // à brancher sur watchPositionAsync
 *   end() → brouillon de session
 *   cancel()
 */

// Un écart supérieur à ceci entre deux points signale une interruption du suivi
// (téléphone verrouillé), pas un déplacement observé.
const TROU_KM = 0.08;

// Plafond de vraisemblance, PAR MODE : au-delà, l'écart n'a pas été parcouru par
// l'utilisateur — bond GPS, ou trajet en transport. On raccorde le tracé mais on
// ne compte pas la distance ; annoncer 6 km parce qu'on a pris le métro serait
// faux. Le mode est connu de l'app, il n'y a donc aucune raison de se rabattre
// sur une valeur unique : 30 km/h laisserait passer le métro pour un marcheur,
// 12 km/h amputerait un cycliste rapide.
//   à pied  : 18 — la COURSE comprise. Rien n'empêche de courir avec le profil
//              piéton, et 12 km/h effaçait la distance d'un coureur ordinaire —
//              exactement ce que ce garde-fou est censé éviter. 18 km/h de
//              moyenne sur plusieurs minutes relève déjà du niveau national.
//   à vélo  : 30 — pointe en ville sur une courte distance
export const VITESSE_MAX_KMH = { 'foot-walking': 18, 'cycling-regular': 30 };
export const VITESSE_DEFAUT = 18;

// Distance maximale entre un point GPS et l'itinéraire prévu pour reprendre ce
// dernier. Volontairement large : entre deux erreurs possibles, on préfère celle
// qui ne se voit pas. Une ligne droite traversant un pâté de maisons saute aux
// yeux ; un tracé plausible passant une rue à côté, non. À 400 m on couvre les
// détours ordinaires — un café, une rue barrée, un aller-retour — tout en
// écartant le cas où l'utilisateur s'est franchement éloigné du parcours, où
// reprendre l'itinéraire raconterait une balade qui n'a pas eu lieu.
const PROCHE_ITI_KM = 0.40;

// Indice du point de l'itinéraire le plus proche d'une position donnée.
function plusProche(route, lat, lng) {
  let idx = -1, best = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = haversineKm(lat, lng, route[i][1], route[i][0]);
    if (d < best) { best = d; idx = i; }
  }
  return { idx, d: best };
}

/**
 * Reconstitue le chemin manquant entre deux positions.
 *
 * iOS suspend l'app dès que l'écran se verrouille : entre le moment où
 * l'utilisateur range son téléphone et celui où il le ressort, aucun point n'est
 * reçu. Le tracé montrait donc une ligne droite d'un bout à l'autre du quartier,
 * et — plus grave — la distance n'était PAS comptée du tout, l'ancien filtre
 * rejetant tout saut de plus de 500 m.
 *
 * Plutôt que de deviner, on s'appuie sur l'itinéraire DÉJÀ CALCULÉ pour cette
 * sortie : si les deux extrémités du trou sont proches de ce chemin, le morceau
 * qui les relie est le trajet le plus vraisemblable — c'est celui que l'app avait
 * indiqué à l'utilisateur. Sinon, on s'abstient et on garde la ligne droite.
 *
 * @returns {{ points: number[][], km: number } | null}
 */
export function comblerDepuisItineraire(route, depart, arrivee) {
  if (!Array.isArray(route) || route.length < 2) return null;
  const a = plusProche(route, depart.lat, depart.lng);
  const b = plusProche(route, arrivee.lat, arrivee.lng);
  if (a.idx < 0 || b.idx < 0) return null;
  if (a.d > PROCHE_ITI_KM || b.d > PROCHE_ITI_KM) return null;   // hors itinéraire
  if (a.idx === b.idx) return null;

  const sens = a.idx < b.idx ? 1 : -1;
  const points = [];
  for (let i = a.idx + sens; i !== b.idx + sens; i += sens) points.push(route[i]);
  if (points.length === 0) return null;

  let km = haversineKm(depart.lat, depart.lng, points[0][1], points[0][0]);
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  km += haversineKm(points[points.length - 1][1], points[points.length - 1][0], arrivee.lat, arrivee.lng);
  return { points, km };
}

export function useSessionRecorder() {
  const ref = useRef(null);

  const begin = useCallback((meta = {}) => {
    ref.current = {
      source: meta.source ?? 'hunt',
      city: meta.city ?? null,
      district: meta.district ?? null,
      // Itinéraire prévu : sert de repli d'affichage ET de patron pour combler
      // les interruptions de suivi.
      fallbackRoute: meta.routeCoords ?? null,
      // Mode de déplacement : fixe le plafond de vraisemblance de la distance.
      // Absent (Trajet, Balade) → à pied, qui est le cas de ces écrans.
      vitesseMax: VITESSE_MAX_KMH[meta.profile] ?? VITESSE_DEFAUT,
      startedAt: new Date().toISOString(),
      distanceKm: 0,
      last: null,
      lastAt: null,
      coords: [],
    };
  }, []);

  const addPoint = useCallback((lat, lng, accuracy) => {
    const s = ref.current;
    if (!s || lat == null || lng == null) return;
    if (accuracy != null && accuracy > 40) return; // point trop imprécis

    const now = Date.now();
    if (s.last) {
      const d = haversineKm(s.last.lat, s.last.lng, lat, lng);

      if (d < 0.003) { s.lastAt = now; return; }        // bruit GPS : on ignore

      if (d <= TROU_KM) {
        s.distanceKm += d;                              // suivi continu, cas normal
      } else {
        // Interruption : on tente de reconstituer le chemin réellement suivi.
        const comble = comblerDepuisItineraire(s.fallbackRoute, s.last, { lat, lng });
        const heures = Math.max((now - (s.lastAt ?? now)) / 3600000, 1 / 3600);
        const parcourue = comble ? comble.km : d;
        // Vraisemblance : au-delà du plafond du mode, l'écart n'a pas été
        // parcouru par l'utilisateur. On raccorde le tracé sans gonfler le total.
        if (parcourue / heures <= s.vitesseMax) s.distanceKm += parcourue;
        if (comble) s.coords.push(...comble.points);
      }
    }

    s.last = { lat, lng };
    s.lastAt = now;
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
