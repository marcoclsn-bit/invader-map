import { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  FlatList, Switch, ScrollView, Keyboard, Platform, KeyboardAvoidingView, Linking, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import MapView, { Polyline, Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as turf from '@turf/turf';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { STATUS_COLOR } from '../constants';
import { useAppContext } from '../context/AppContext';
import { CITIES } from '../cities/registry';
import { countryCodeOf } from '../cities/countries';
import { geocode, autocomplete, multiRoute } from '../services/routing';
import {
  INVADER_DISTRICT, ARRONDISSEMENT_CENTERS, ensureDistricts, districtOfPoint, districtRing,
  neighborsOf,
} from '../utils/arrondissement';
import { spillOffer } from '../utils/huntSpill';
import ExplorerSheet from '../components/ExplorerSheet';
import { backtrackScore } from '../utils/tourGeometry';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '../theme/mapStyle';
import InvaderPanel from '../components/InvaderPanel';
import PinMarker from '../components/PinMarker';
import HeadingCone from '../components/HeadingCone';
import { openNavigationApp } from '../utils/navigation';
import { useSessionRecorder } from '../components/session/useSessionRecorder';
import useKeepScreenOn from '../components/session/useKeepScreenOn';
import { useGamification } from '../context/GamificationContext';
import { canUseFeature, FEATURES } from '../services/featureAccess';
import { getPois, hasPois, wikiUrl, summaryOf } from '../services/poiData';
import { familyOf } from '../data/poiFamilies';
import { track, failureReason } from '../services/analytics';
import ObjectivePicker from '../components/ObjectivePicker';
import PoiFamiliesRow from '../components/PoiFamiliesRow';

const _PA        = CITIES.PA;
const PARIS      = { latitude: _PA.center.lat, longitude: _PA.center.lng, ..._PA.mapDelta };
// Temps d'arrêt par étape. C'est la constante la plus lourde du planificateur :
// dans une zone dense, elle pèse les deux tiers d'une chasse d'une heure, bien
// devant le choix du mode de transport.
// Les deux valent 1,5 : repérer puis flasher un Invader coûte à peu près autant
// que s'arrêter devant un monument. Elles restent deux constantes distinctes pour
// pouvoir les régler séparément le jour où on les mesurera sur de vraies sessions.
const VISIT_MIN = 1.5;     // minutes par Invader (repérer, viser, flasher)
const VISIT_MIN_POI = 1.5; // minutes par lieu d'intérêt (s'arrêter, lever les yeux)
const visitMinOf = (step) => (step.isPoi ? VISIT_MIN_POI : VISIT_MIN);
// Temps d'arrêt cumulé d'une liste d'étapes.
const visitTotalMin = (list) => list.reduce((s, x) => s + visitMinOf(x), 0);
// Limite de l'API d'itinéraires (~50 points) : départ + étapes + retour.
const MAX_STEPS = 46;
// Pénalité de demi-tour, en minutes par demi-tour complet.
//
// Réglée sur mesure, pas au jugé. Sur 180 chasses parisiennes, en comptant les
// virages de plus de 100° par parcours : 5,56 sans pénalité, 4,64 au premier
// réglage (seuil 120°, poids 0,5), 3,25 au réglage actuel (seuil 90°, poids 1).
// Le tout pour 97,5 min contre 97,6 sans pénalité et le même nombre d'étapes :
// l'Or-opt récupère intégralement ce que la pénalité dépense.
//
// Monter à 2 descendrait à 2,34 virages, mais coûterait une minute et quatre
// dixièmes d'étape. C'est le premier réglage qui se paie vraiment : on s'arrête
// donc juste avant.
//
// Appliquée à TOUTES les chasses. Elle a d'abord été livrée en option, le temps
// de l'éprouver sur le terrain : refaire ses pas est ennuyeux à marcher quel que
// soit le mode de jeu, ce n'était donc pas une affaire de puristes.
//
// `planHunt` garde malgré tout le paramètre : le mode explorateur voudra
// probablement une pondération plus forte, puisque chez lui un aller-retour ne
// gâche pas seulement la promenade, il désigne l'Invader.
const BACKTRACK_W = 1;
// Arrondissement d'un lieu d'intérêt, mémoïsé par id. Le point-dans-polygone
// coûte jusqu'à 20 tests par lieu ; sans cache il serait refait sur les ~690
// lieux parisiens à chaque planification.
const _poiDistrict = new Map();
const poiDistrict = (p) => {
  if (!_poiDistrict.has(p.id)) _poiDistrict.set(p.id, districtOfPoint(p.lng, p.lat));
  return _poiDistrict.get(p.id);
};
const SPEEDS = { 'foot-walking': 5, 'cycling-regular': 15 }; // km/h
// Pondération densité : bonus aux Invaders entourés d'autres Invaders (favorise les
// grappes → on en attrape bien plus). Réglages validés sur données réelles Paris.
const DENSITY_ALPHA = 0.15;      // poids des points voisins dans le score glouton
const DENSITY_RADIUS_KM = 0.25;  // rayon de voisinage (~250 m à pied)
// Facteur de détour : le vol d'oiseau sous-estime la distance réelle par les rues.
// Appliqué au calcul de temps interne pour que la durée réelle colle au budget.
const STREET_DETOUR = 1.2;
// Aucune étape ne peut à elle seule ajouter plus que cette fraction du budget.
// Sans ce plafond, le remplissage final acceptait n'importe quoi tant qu'il
// « restait du temps » : un Invader à 10 points pour 12 min de détour passait.
const DETOUR_CAP_FRACTION = 0.08;
const maxDetourMin = (budgetMin) => Math.max(4, budgetMin * DETOUR_CAP_FRACTION);
// Nettoyage final : une étape dont le rendement (valeur ÷ minutes qu'elle coûte)
// tombe sous ce ratio de la médiane de la chasse, ET qui coûte au moins ce
// temps, est un « éperon » — un aller-retour isolé loin du reste du parcours.
// Seuil RELATIF à chaque chasse, donc valable aussi bien dans le Marais dense
// qu'en périphérie, et sur 30 min comme sur 3 h.
const OUTLIER_RATIO = 0.25;
const OUTLIER_MIN_MIN = 6;
const DEBOUNCE_MS = 300;

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── Planification de la chasse ─────────────────────────────────────────────
// Objectif : attraper un max d'Invaders (pondérés par points) dans un budget
// temps donné — variante du « voyageur de commerce avec profits » (NP-difficile).
// Approche pragmatique en 3 temps, 100 % locale (distances à vol d'oiseau) :
//   1. Glouton : à chaque pas, l'Invader au meilleur ratio points / temps.
//   2. 2-opt   : on dénoue les croisements pour raccourcir la boucle.
//   3. Re-remplissage : le temps gagné sert à insérer d'autres Invaders.
// (Le vrai tracé par les rues est calculé ensuite par ORS via multiRoute.)

// Temps total (min) d'une boucle fermée départ → order… → départ (visites incluses).
function tourTotalMin(order, startLat, startLon, speedKmPerMin) {
  let t = 0, curLat = startLat, curLon = startLon;
  for (const inv of order) {
    t += (haversineKm(curLat, curLon, inv.lat, inv.lng) / speedKmPerMin) * STREET_DETOUR + visitMinOf(inv);
    curLat = inv.lat; curLon = inv.lng;
  }
  t += (haversineKm(curLat, curLon, startLat, startLon) / speedKmPerMin) * STREET_DETOUR; // retour
  return t;
}

// Coût d'une boucle. `backtrackW` à 0 rend EXACTEMENT tourTotalMin, sans un
// calcul de plus : le mode par défaut emprunte le chemin de code d'origine, ce
// qui se vérifie dans le diff au lieu de se promettre.
// Unité de la pondération : minutes par demi-tour complet (voir tourGeometry).
function tourCostMin(order, startLat, startLon, speedKmPerMin, backtrackW = 0) {
  const t = tourTotalMin(order, startLat, startLon, speedKmPerMin);
  return backtrackW ? t + backtrackW * backtrackScore(order, startLat, startLon) : t;
}

// Valeur d'une étape pour le nettoyage. Les lieux valent 30, milieu de la plage
// que leur donne stepValue selon l'objectif (15 en Chasse pure → 51 en Visite).
const outlierValue = (step) => (step.isPoi ? 30 : step.points);

// Retire les « éperons » : les étapes dont le retrait libère beaucoup de temps
// pour peu de valeur perdue. Le coût d'une étape est mesuré par son coût
// MARGINAL réel — ce que la boucle gagnerait sans elle — et non par sa distance
// au départ : un point éloigné mais sur le chemin ne coûte presque rien, alors
// qu'un point proche mais à contresens peut coûter très cher.
// Passe locale, sans appel réseau (0,3 ms au pire sur 46 étapes).
function dropOutliers(order, startLat, startLon, speedKmPerMin) {
  let cur = order;
  for (let pass = 0; pass < 6 && cur.length > 3; pass++) {
    const base = tourTotalMin(cur, startLat, startLon, speedKmPerMin);
    const marg = cur.map((step, i) => {
      const without = cur.slice(0, i).concat(cur.slice(i + 1));
      const saved = base - tourTotalMin(without, startLat, startLon, speedKmPerMin);
      return { i, saved, yield: outlierValue(step) / Math.max(saved, 0.1) };
    });
    const sorted = marg.map(m => m.yield).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const bad = marg.filter(m => m.yield < OUTLIER_RATIO * median && m.saved >= OUTLIER_MIN_MIN);
    if (!bad.length) break;
    // Un seul retrait par passe : enlever l'éperon change les coûts marginaux
    // de ses voisins, il faut donc tout recalculer avant d'en retirer un autre.
    const worst = bad.reduce((a, b) => (a.saved > b.saved ? a : b));
    cur = cur.slice(0, worst.i).concat(cur.slice(worst.i + 1));
  }
  return cur;
}

// Points des Invaders voisins (dans DENSITY_RADIUS_KM) pour chaque Invader du pool.
// Sert à favoriser les grappes : un Invader entouré vaut « plus » dans le glouton.
function neighborPointsMap(pool) {
  const m = new Map();
  for (const a of pool) {
    let sum = 0;
    for (const b of pool) {
      if (a === b) continue;
      if (haversineKm(a.lat, a.lng, b.lat, b.lng) <= DENSITY_RADIUS_KM) sum += b.points;
    }
    m.set(a.id, sum);
  }
  return m;
}

// 1. Sélection gloutonne, pondérée par la densité locale (points voisins).
//    score = (points + α × points des voisins) / (temps d'accès + visite).
function greedySelect(startLat, startLon, pool, budgetMin, speedKmPerMin, nbrPoints, maxSteps = MAX_STEPS) {
  const available = pool.slice();
  const selected = [];
  let curLat = startLat, curLon = startLon, timeLeft = budgetMin;

  // MAX_STEPS borne la sélection : l'API d'itinéraires refuse au-delà d'une
  // cinquantaine de points, et rien ne l'appliquait ici. Avec des arrêts d'une
  // minute, une chasse longue en zone dense dépassait couramment la limite et
  // le calcul échouait sur une erreur de l'API.
  while (available.length > 0 && selected.length < maxSteps) {
    let bestIdx = -1, bestScore = -Infinity;
    for (let i = 0; i < available.length; i++) {
      const inv = available[i];
      const tToInv  = (haversineKm(curLat, curLon, inv.lat, inv.lng) / speedKmPerMin) * STREET_DETOUR;
      const tReturn = (haversineKm(inv.lat, inv.lng, startLat, startLon) / speedKmPerMin) * STREET_DETOUR;
      if (tToInv + VISIT_MIN + tReturn <= timeLeft) {
        const weighted = inv.points + DENSITY_ALPHA * (nbrPoints.get(inv.id) ?? 0);
        const score = weighted / (tToInv + VISIT_MIN);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
    }
    if (bestIdx === -1) break;
    const best = available[bestIdx];
    timeLeft -= (haversineKm(curLat, curLon, best.lat, best.lng) / speedKmPerMin) * STREET_DETOUR + VISIT_MIN;
    curLat = best.lat; curLon = best.lng;
    selected.push(best);
    available.splice(bestIdx, 1);
  }
  return selected;
}

// 2. 2-opt : inverse des segments tant que ça raccourcit la boucle (retire les croisements).
function twoOpt(order, startLat, startLon, speedKmPerMin, backtrackW = 0) {
  if (order.length < 3) return order;
  let best = order.slice();
  let bestT = tourCostMin(best, startLat, startLon, speedKmPerMin, backtrackW);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i)
          .concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const t = tourCostMin(cand, startLat, startLon, speedKmPerMin, backtrackW);
        if (t < bestT - 1e-9) { best = cand; bestT = t; improved = true; }
      }
    }
  }
  return best;
}

// 2 bis. Or-opt : retire une étape et la réinsère ailleurs dans l'ordre.
// Le 2-opt sait inverser un segment, mais PAS déplacer un point isolé, il est
// donc structurellement incapable de réparer un éperon, l'étape unique qu'on va
// chercher en aller-retour. C'est exactement le mouvement qui manque.
function orOpt(order, startLat, startLon, speedKmPerMin, backtrackW = 0) {
  if (order.length < 3) return order;
  let best = order.slice();
  let bestC = tourCostMin(best, startLat, startLon, speedKmPerMin, backtrackW);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length; i++) {
      const without = best.slice(0, i).concat(best.slice(i + 1));
      for (let p = 0; p <= without.length; p++) {
        if (p === i) continue;
        const cand = without.slice(0, p).concat(best[i], without.slice(p));
        const c = tourCostMin(cand, startLat, startLon, speedKmPerMin, backtrackW);
        if (c < bestC - 1e-9) { best = cand; bestC = c; improved = true; }
      }
    }
  }
  return best;
}

// 3. Re-remplissage : insère d'autres Invaders là où ça coûte le moins de temps,
//    tant qu'on reste dans le budget (insertion la moins chère, priorité aux points).
function refill(order, remaining, startLat, startLon, budgetMin, speedKmPerMin, maxSteps = MAX_STEPS) {
  let selected = order.slice();
  const pool = remaining.slice();

  while (pool.length > 0 && selected.length < maxSteps) {
    let bestCand = -1, bestPos = -1, bestGain = -Infinity;
    const baseTime = tourTotalMin(selected, startLat, startLon, speedKmPerMin);

    for (let c = 0; c < pool.length; c++) {
      const inv = pool[c];
      // teste chaque position d'insertion (0 = avant le 1er, n = après le dernier)
      for (let p = 0; p <= selected.length; p++) {
        const trial = selected.slice(0, p).concat(inv, selected.slice(p));
        const tTotal = tourTotalMin(trial, startLat, startLon, speedKmPerMin);
        if (tTotal <= budgetMin) {
          const added = tTotal - baseTime;               // temps ajouté par l'insertion
          if (added > maxDetourMin(budgetMin)) continue; // détour disproportionné pour une seule étape
          const gain  = inv.points / Math.max(added, 0.1); // points par minute ajoutée
          if (gain > bestGain) { bestGain = gain; bestCand = c; bestPos = p; }
        }
      }
    }
    if (bestCand === -1) break; // plus rien n'entre dans le budget
    selected = selected.slice(0, bestPos).concat(pool[bestCand], selected.slice(bestPos));
    pool.splice(bestCand, 1);
  }
  return selected;
}

// 4. Insertion des lieux d'intérêt (mode « Chasse & visite »).
//    Les POI n'entrent JAMAIS dans la sélection des Invaders : ils ne s'insèrent
//    qu'ensuite, dans le temps laissé libre, à la place la moins coûteuse.
//    Les plus notables et les mieux placés passent en premier.
function insertPois(order, pois, startLat, startLon, budgetMin, speedKmPerMin, alpha) {
  if (!alpha || !pois.length || !order.length) return order;
  let selected = order.slice();
  // Part d'étapes « visite » autorisée : ~20 % en Équilibré, ~40 % en Chasse & visite.
  const maxPois = Math.max(1, Math.round(order.length * alpha * 0.5));
  const pool = pois.slice();
  let added = 0;

  while (pool.length > 0 && added < maxPois && selected.length < MAX_STEPS) {
    let bestCand = -1, bestPos = -1, bestGain = -Infinity;
    const baseTime = tourTotalMin(selected, startLat, startLon, speedKmPerMin);

    for (let c = 0; c < pool.length; c++) {
      const poi = pool[c];
      for (let p = 0; p <= selected.length; p++) {
        const trial = selected.slice(0, p).concat(poi, selected.slice(p));
        const tTotal = tourTotalMin(trial, startLat, startLon, speedKmPerMin);
        if (tTotal <= budgetMin) {
          const addedMin = tTotal - baseTime;
          if (addedMin > maxDetourMin(budgetMin)) continue; // un monument ne vaut pas 30 min de marche
          // notoriété par minute de détour (fame ~ nb de Wikipédias : 18 → 189)
          const gain = (poi.fame ?? 10) / Math.max(addedMin, 0.1);
          if (gain > bestGain) { bestGain = gain; bestCand = c; bestPos = p; }
        }
      }
    }
    if (bestCand === -1) break; // plus aucun lieu n'entre dans le temps restant
    selected = selected.slice(0, bestPos).concat(pool[bestCand], selected.slice(bestPos));
    pool.splice(bestCand, 1);
    added++;
  }
  return selected;
}

// Orchestrateur : glouton → 2-opt → re-remplissage → 2-opt → lieux d'intérêt.
// `alpha` (0 · 0,4 · 0,8) = curseur Chasse ↔ Balade.
function planHunt(startLon, startLat, candidates, budgetMin, speedKmh, opts = {}) {
  const { pois = [], alpha = 0, spillCandidates = [], backtrackW = 0 } = opts;
  const speedKmPerMin = speedKmh / 60;
  // Rayon d'admission. L'ancienne formule — (budget × vitesse) / 2 — autorisait
  // des points dont le SEUL aller-retour dépassait le budget entier : 2,5 km pour
  // une heure de marche, soit 72 min rien qu'en trajet, détour de rues compris.
  // On ne consacre donc que la moitié du budget à l'éloignement, et on paie le
  // détour : l'autre moitié reste pour la boucle et les visites.
  const maxRadiusKm = (budgetMin * 0.5 * speedKmPerMin) / (2 * STREET_DETOUR);
  const pool = candidates.filter(inv =>
    inv.status !== 'destroyed' &&
    haversineKm(startLat, startLon, inv.lat, inv.lng) <= maxRadiusKm
  );

  // On réserve une part du budget aux visites, sinon le refill le consomme entièrement
  // et plus aucun lieu ne peut s'insérer. Les Invaders gardent toujours la majeure part.
  const invaderBudget = budgetMin * (1 - alpha * 0.25);

  // Place réservée aux lieux dans les MAX_STEPS points admis par l'API : sans
  // cela, une chasse longue remplissait les 46 places d'Invaders et « Chasse &
  // visite » ne pouvait plus insérer un seul lieu.
  const invaderSteps = Math.max(1, Math.floor(MAX_STEPS / (1 + alpha * 0.5)));

  const nbrPoints = neighborPointsMap(pool);
  let selected = greedySelect(startLat, startLon, pool, invaderBudget, speedKmPerMin, nbrPoints, invaderSteps);
  selected = twoOpt(selected, startLat, startLon, speedKmPerMin, backtrackW);
  // Débordement : les Invaders des arrondissements limitrophes n'entrent QUE
  // dans le remplissage, jamais dans le glouton. L'arrondissement choisi est
  // donc toujours ratissé en premier et jusqu'au bout ; les voisins ne servent
  // qu'à convertir le temps qui resterait sinon inutilisé. Et comme refill
  // insère par détour croissant, il pioche naturellement le long de la
  // frontière plutôt qu'au fond de l'arrondissement d'à côté.
  const spillPool = spillCandidates.filter(inv =>
    inv.status !== 'destroyed' &&
    haversineKm(startLat, startLon, inv.lat, inv.lng) <= maxRadiusKm
  );
  const remaining = [...pool.filter(inv => !selected.includes(inv)), ...spillPool];
  selected = refill(selected, remaining, startLat, startLon, invaderBudget, speedKmPerMin, invaderSteps);
  selected = twoOpt(selected, startLat, startLon, speedKmPerMin, backtrackW);
  // Or-opt UNIQUEMENT quand la pénalité est active. Seul, il ne gagne que
  // 0,6 min sur 83 et 5 points de demi-tours, pas de quoi payer son coût
  // quadratique à chaque génération pour tout le monde.
  if (backtrackW) selected = orOpt(selected, startLat, startLon, speedKmPerMin, backtrackW);

  if (alpha > 0 && pois.length) {
    const nearPois = pois
      .filter(p => haversineKm(startLat, startLon, p.lat, p.lng) <= maxRadiusKm)
      .map(p => ({ ...p, isPoi: true }));
    selected = insertPois(selected, nearPois, startLat, startLon, budgetMin, speedKmPerMin, alpha);
  }

  // Dernier mot : on retire les éperons. Le plafond ci-dessus protège le
  // remplissage, mais pas le glouton initial, qui peut partir loin dès son
  // premier choix. Cette passe voit la boucle entière et ne peut jamais tout
  // vider (elle s'arrête à 3 étapes).
  return dropOutliers(selected, startLat, startLon, speedKmPerMin);
}

// Tolérance de dépassement acceptée (le budget est une cible, pas une limite dure).
const BUDGET_TOLERANCE_MIN = 10;
// Plafond d'appels ORS par génération (respecte le quota).
const MAX_ROUTE_CALLS = 4;
// Retrait max par passe (évite de s'effondrer si le 1er trajet dépasse énormément).
const MAX_TRIM_FRACTION = 0.45;

// Route la boucle avec ORS, puis — si la VRAIE durée de marche dépasse trop le
// budget — retire les Invaders les moins rentables et re-route, borné à quelques
// appels. Le modèle interne (haversine) sous-estime les rues (parcs, sens uniques) :
// on calibre donc le détour sur la durée réelle ORS pour élaguer juste ce qu'il faut.
// Renvoie { sel, coords, walkMin }.
// Valeur d'une étape pour l'élagage. Les Invaders rapportent 10 à 100 points
// (27,5 en moyenne) ; les lieux n'en rapportent aucun. Sans valeur explicite,
// `inv.points` valait `undefined` pour un lieu, le ratio devenait NaN, et le tri
// « les moins rentables d'abord » plaçait les lieux à une position arbitraire :
// ils étaient sacrifiés au hasard. « Chasse & visite » en insérant davantage en
// perdait donc plus qu'« Équilibré ». On leur donne une valeur qui suit
// l'objectif choisi : au-dessus de l'Invader moyen en mode visite.
function stepValue(step, alpha) {
  return step.isPoi ? 15 + alpha * 45 : step.points;
}

async function routeWithinBudget(sel, startLon, startLat, budgetMin, speedKmPerMin, profile, alpha = 0) {
  const build = (list) => [
    [startLon, startLat],
    ...list.map(inv => [inv.lng, inv.lat]),
    [startLon, startLat],
  ];
  // Marche « à vol d'oiseau » de la boucle (min) — sert à calibrer le détour réel.
  const straightWalkMin = (list) => {
    let d = 0, pLat = startLat, pLon = startLon;
    for (const inv of list) { d += haversineKm(pLat, pLon, inv.lat, inv.lng); pLat = inv.lat; pLon = inv.lng; }
    d += haversineKm(pLat, pLon, startLat, startLon);
    return d / speedKmPerMin;
  };

  let route = await multiRoute(build(sel), profile);
  let calls = 1;

  while (
    calls < MAX_ROUTE_CALLS &&
    sel.length > 1 &&
    route.durationMin + visitTotalMin(sel) > budgetMin + BUDGET_TOLERANCE_MIN
  ) {
    const over = (route.durationMin + visitTotalMin(sel)) - budgetMin;
    const legs = route.legsMin; // [start→0, 0→1, …, n-1→start]
    if (!legs || legs.length !== sel.length + 1) break; // pas de détail fiable → on s'arrête

    // Détour réel calibré sur ce trajet (routes/parc) → estimation d'élagage fidèle.
    const detour = Math.max(1, route.durationMin / Math.max(straightWalkMin(sel), 0.1));

    // Pour chaque Invader, estime le temps gagné en le retirant (2 legs réels
    // remplacés par un tronçon direct approché) + sa visite. On retire en priorité
    // les moins « rentables » (peu de points par minute gagnée) jusqu'à couvrir l'excès.
    const scored = sel.map((inv, i) => {
      const prev = i === 0 ? [startLat, startLon] : [sel[i - 1].lat, sel[i - 1].lng];
      const next = i === sel.length - 1 ? [startLat, startLon] : [sel[i + 1].lat, sel[i + 1].lng];
      const directMin = (haversineKm(prev[0], prev[1], next[0], next[1]) / speedKmPerMin) * detour;
      const saved = Math.max(0, legs[i] + legs[i + 1] - directMin) + visitMinOf(inv);
      return { i, saved, ratio: stepValue(inv, alpha) / Math.max(saved, 0.1) };
    });
    scored.sort((a, b) => a.ratio - b.ratio); // les moins rentables d'abord

    const maxRemove = Math.max(1, Math.floor(sel.length * MAX_TRIM_FRACTION));
    const remove = new Set();
    let shed = 0;
    for (const s of scored) {
      if (shed >= over || remove.size >= maxRemove || sel.length - remove.size <= 1) break;
      remove.add(s.i);
      shed += s.saved;
    }
    if (remove.size === 0) break;

    sel = sel.filter((_, i) => !remove.has(i));
    sel = twoOpt(sel, startLat, startLon, speedKmPerMin); // resserre l'ordre après retrait
    route = await multiRoute(build(sel), profile);
    calls += 1;
  }

  return { sel, coords: route.coords, walkMin: route.durationMin };
}

// ─── Formatage ────────────────────────────────────────────────────────────────

// L'arrondi se fait ICI, en entrée, et non chez l'appelant : la durée d'un
// résultat vaut marche + visites, et chaque étape coûte 1,5 min — un nombre
// impair d'étapes donne donc un total à virgule. On affichait « 2 h 31.5 »,
// et « 45.5 min » sous l'heure.
//
// L'ordre compte : arrondir AVANT de comparer à 60, sinon 59,7 min resterait
// sous le seuil et s'afficherait « 60 min » au lieu de « 1 h ».
function formatBudget(min) {
  const total = Math.round(min ?? 0);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

// ─── Cache de styles thémés ───────────────────────────────────────────────────

let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const s = makeStyles(theme);
  _styleCache = { theme, styles: s };
  return s;
}

// ─── Ligne de résultat ────────────────────────────────────────────────────────

// Une fois flashée, la ligne s'éteint : pastille grise, ✓ à la place du rang.
// On la garde en place plutôt que de la retirer — voir ce qu'on a accompli fait
// partie du plaisir, et la numérotation reste alignée avec celle de la carte.
function HuntRow({ inv, index, isFlashed, statusColors, onPress }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <TouchableOpacity
      style={styles.huntRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}. ${inv.id}, ${inv.points} ${t('common.pts')}`}
      accessibilityState={{ checked: isFlashed }}
    >
      <View style={[styles.orderBadge, isFlashed && styles.orderBadgeDone]}>
        <Text style={[styles.orderNum, isFlashed && styles.orderNumDone]}>
          {isFlashed ? '✓' : index + 1}
        </Text>
      </View>
      <View style={[
        styles.huntDot,
        { backgroundColor: isFlashed ? theme.textSecondary : (statusColors[inv.status] ?? STATUS_COLOR[inv.status]) },
      ]} />
      <Text style={[styles.huntId, isFlashed && styles.huntTextDone]}>{inv.id}</Text>
      <Text style={[styles.huntPts, isFlashed && styles.huntTextDone]}>{inv.points} {t('common.pts')}</Text>
      {isFlashed && (
        <View style={styles.flashedBadge}>
          <Text style={styles.flashedBadgeText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Une entrée de légende : le repère tel qu'il apparaît sur la carte, et son sens.
// Les styles sont passés en paramètre — ils dépendent du thème, construit dans
// l'écran.
function LegendRow({ children, label, styles }) {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendIcon}>{children}</View>
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

// ─── Écran Chasse ─────────────────────────────────────────────────────────────

export default function ChasseScreen({ route }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const gpsRef = useRef(null);
  const quartierInputRef = useRef(null);
  const debounce = useRef(null);
  const locationSub = useRef(null);

  const { invaders, flashed, statusColors, currentCityCode, toggleFlash, mapsApp, isChangingCity, poiPrefs, setPoiPref, explorer } = useAppContext();
  const city = CITIES[currentCityCode] ?? CITIES.PA;
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const styles = getStyles(theme);
  // Biais de recherche Mapbox : proximité = GPS, pays = ville courante, langue UI
  const geoOpts = { country: countryCodeOf(city), language: i18n.language };

  // Enregistreur de session (distance via le watch GPS de la navigation)
  const recorder = useSessionRecorder();
  const { recordSession } = useGamification();

  // ─── GPS ──────────────────────────────────────────────────────────────────
  const [gpsReady, setGpsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      gpsRef.current = [loc.coords.longitude, loc.coords.latitude];
      setGpsReady(true);

      // Recentre la carte sur l'utilisateur s'il est dans la zone de la ville (comme l'écran Carte).
      // On ne recentre pas si un preset d'arrondissement (depuis Palmarès) est en cours.
      if (route?.params?.arPreset) return;
      const { latitude, longitude } = loc.coords;
      const b = city.bbox;
      const nearCity = latitude >= b.minLat && latitude <= b.maxLat &&
                       longitude >= b.minLng && longitude <= b.maxLng;
      if (nearCity) {
        mapRef.current?.animateToRegion(
          { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          800
        );
      }
    })();
  }, []);

  // ─── Formulaire ───────────────────────────────────────────────────────────
  const [mode, setMode] = useState('around');
  const [qText, setQText] = useState('');
  const [qCoords, setQCoords] = useState(null);
  const [qSugg, setQSugg] = useState([]);
  const [qSearching, setQSearching] = useState(false);
  const [qFocused, setQFocused] = useState(false);
  const [qResolving, setQResolving] = useState(false);

  const [budgetMin, setBudgetMin] = useState(60);
  const [profile, setProfile] = useState('foot-walking');
  const [unflashedOnly, setUnflashedOnly] = useState(true);
  const [legendOpen,    setLegendOpen]    = useState(false);
  // Objectif : chasse pure ↔ chasse & visite (0 = aucun lieu d'intérêt).
  // Lu dans le contexte, PAS en état local : c'est le même réglage que sur la
  // Carte et le Trajet. Le garder ici en local faisait qu'un choix fait dans le
  // Trajet n'était pas repris par la Chasse, alors que le libellé est le même.
  const objective = poiPrefs.objective;
  const setObjective = (key) => setPoiPref({ objective: key });
  const poiEnabled = hasPois(currentCityCode);
  const POI_ALPHA = { pure: 0, balanced: 0.4, visit: 0.8 };
  // Arrondissements sélectionnés (Set de c_ar 1-20). Mode quartier des villes à
  // arrondissements (Paris). Les villes sans arrondissement gardent l'adresse.
  const [selectedArs, setSelectedArs] = useState(() => new Set());
  const hasDistricts = !!city.subdivisionsKey;
  // Recalcul en cours après acceptation du débordement, et refus de la
  // proposition. Le refus est local au parcours affiché : une nouvelle chasse
  // repose la question, parce que la réponse portait sur celle-là et non sur le
  // principe. Ce n'est donc pas une préférence à mémoriser.
  // Numéro de génération, porté par le résultat : il sert de clé de remontage
  // aux enfants de la carte (voir le Fragment du rendu). Un compteur plutôt
  // qu'un horodatage, qui collisionnerait sur deux générations rapprochées.
  const runIdRef = useRef(0);
  const [spilling, setSpilling] = useState(false);
  const [explorerSheet, setExplorerSheet] = useState(false);
  const [spillDismissed, setSpillDismissed] = useState(false);

  // UN SEUL arrondissement à la fois. La multi-sélection produisait des chasses
  // vides ou dégradées, parce que le point de départ est le centroïde des zones
  // choisies : sur deux arrondissements non limitrophes, il tombe entre les deux
  // et le rayon d'admission (≈1 km pour une heure) n'atteint plus rien. Mesuré
  // sur les données réelles : 19e + 7e → 0 Invader retenu sur 80 disponibles,
  // 16e + 20e → 0 sur 142. Même en limitrophe, le multi nuisait : 11e seul donne
  // 18 Invaders, 11e + 12e en donne 12, le centroïde tombant dans le 20e.
  //
  // On garde un Set plutôt qu'un scalaire : le filtre `arSet.has(...)` et le
  // calcul du centroïde restent inchangés, et le mode « quartier » des villes
  // sans arrondissement n'est pas touché.
  function toggleAr(ar) {
    setSelectedArs(prev => (prev.has(ar) ? new Set() : new Set([ar])));
  }

  // ─── Résultat + navigation ─────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedInv, setSelectedInv] = useState(null);
  const [selectedPoi, setSelectedPoi] = useState(null); // fiche « lieu d'intérêt »
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [following, setFollowing] = useState(false);
  // Écran maintenu allumé pendant le suivi : sans ça, iOS suspend l'app dès
  // l'extinction de l'écran et la distance parcourue cesse d'être enregistrée.
  //
  // APRÈS la déclaration de `following`, et pas avant : l'appel vivait 80 lignes
  // plus haut, dans la zone morte temporelle. Hermes ne la vérifie pas, donc
  // aucun plantage, le hook recevait simplement `undefined` à chaque rendu et
  // l'écran s'éteignait en pleine navigation. Une panne muette.
  useKeepScreenOn(following);
  const [drifted, setDrifted] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [userHeading, setUserHeading] = useState(null);
  const headingSub = useRef(null);

  // ─── Preset depuis Palmarès ───────────────────────────────────────────────
  useEffect(() => {
    const preset = route?.params?.arPreset;
    if (!preset) return;
    setMode('quartier');
    setQText(preset.label);
    setQCoords([preset.lon, preset.lat]);
    setSelectedArs(new Set([preset.ar]));
    setResult(null);
    setSelectedInv(null);
    setError(null);
    setInputCollapsed(false);
    setFollowing(false);
    setDrifted(false);
    setTimeout(() => {
      mapRef.current?.animateToRegion(
        { latitude: preset.lat, longitude: preset.lon, latitudeDelta: 0.028, longitudeDelta: 0.028 },
        600
      );
    }, 300);
  }, [route?.params?.arPreset?._ts]); // _ts change à chaque tap → déclenche même arr. deux fois

  // ─── Cadrage carte après génération ──────────────────────────────────────
  useEffect(() => {
    if (!result) return;
    const coords = [
      { latitude: result.startLat, longitude: result.startLon },
      ...result.polyline,
    ];
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 60, right: 40, bottom: 260, left: 40 },
      animated: true,
    });
  }, [result]);

  // ─── Suivi de position (mode navigation) ──────────────────────────────────
  useEffect(() => {
    if (!following || !result) {
      locationSub.current?.remove();
      locationSub.current = null;
      setUserPos(null);
      return;
    }
    let cancelled = false;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      loc => {
        recorder.addPoint(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy);
        setUserPos({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          heading: loc.coords.heading,
        });
      }
    ).then(sub => {
      if (cancelled) sub.remove();
      else locationSub.current = sub;
    }).catch(() => {});
    Location.watchHeadingAsync(({ trueHeading, magHeading }) => {
      const h = trueHeading >= 0 ? trueHeading : magHeading;
      if (h >= 0) setUserHeading(h);
    }).then(sub => {
      if (cancelled) sub.remove();
      else headingSub.current = sub;
    }).catch(() => {});

    return () => {
      cancelled = true;
      locationSub.current?.remove();
      locationSub.current = null;
      headingSub.current?.remove();
      headingSub.current = null;
    };
  }, [following, result]);

  // ─── Caméra orientée heading ──────────────────────────────────────────────
  useEffect(() => {
    if (!following || drifted || !userPos) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: userPos.latitude, longitude: userPos.longitude },
        heading: userPos.heading >= 0 ? userPos.heading : 0,
        zoom: 17,
      },
      { duration: 500 }
    );
  }, [userPos, following, drifted]);

  // ─── Invaders croisés en chemin, hors chasse ────────────────────────────
  //
  // La carte de la Chasse ne montrait QUE les étapes du parcours. Croiser un
  // Invader qui n'en faisait pas partie obligeait donc à passer par l'onglet
  // Carte pour le flasher, alors qu'on l'avait sous les yeux — et le plus
  // souvent on ne le voyait même pas.
  //
  // On affiche donc ceux qui bordent l'itinéraire, avec le marqueur de la Carte :
  // aucun langage visuel nouveau à apprendre, et ils se distinguent d'eux-mêmes
  // des pastilles numérotées du parcours.
  //
  // 200 m : à 120 m on ratait encore des Invaders pourtant visibles depuis la
  // rue empruntée. C'est à peu près la portée du regard dans une rue parisienne,
  // façades comprises. Le Trajet n'a pas besoin de l'équivalent, sa largeur de
  // couloir étant déjà réglable par l'utilisateur.
  const VOISINS_KM = 0.20;
  const voisins = useMemo(() => {
    // Les voisins sont des Invaders NON FLASHÉS par construction : c'est la
    // fuite la plus directe de l'écran, et elle n'a aucune place ici.
    if (explorer) return [];
    if (!result?.routeCoords || result.routeCoords.length < 2) return [];
    const dansLaChasse = new Set(result.invaders.filter(s => !s.isPoi).map(s => s.id));
    // Invaders déjà flashés AU MOMENT du calcul : ils n'appartiennent pas à
    // l'histoire de cette sortie, et le planificateur les a écartés du parcours
    // pour exactement la même raison. Sans ce filtre, un voisin flashé l'an
    // dernier s'affichait d'emblée avec son ✓, là où le ✓ d'une étape signale
    // une prise du jour — deux sens pour un même signe.
    //
    // La photographie est prise ici et ne bouge plus : les dépendances du memo
    // excluent volontairement `flashed`, sinon un voisin flashé EN COURS de
    // chasse sortirait de la liste au lieu de s'éteindre avec son ✓.
    const dejaFlashes = unflashedOnly ? new Set(flashed) : null;
    // Le périmètre s'applique aussi aux voisins. Sur une boucle du 7e, 10 des 11
    // voisins affichés étaient hors du 7e, des pastilles d'Invaders de l'autre
    // rive, tout autour d'un parcours censé ne pas quitter l'arrondissement.
    // Le parcours, lui, était juste : c'est l'affichage qui démentait la promesse.
    const arSet = result?.ars ? new Set([...result.ars, ...(result.spillArs ?? [])]) : null;
    try {
      const line = turf.lineString(result.routeCoords);
      // Pré-filtre par boîte englobante avant la mesure exacte : sans lui, on
      // projetterait les ~1 600 Invaders de Paris sur une ligne de 400 points.
      const [mnLng, mnLat, mxLng, mxLat] = turf.bbox(line);
      const padLat = VOISINS_KM / 111;
      const padLng = VOISINS_KM / (111 * Math.cos((((mnLat + mxLat) / 2) * Math.PI) / 180));
      const proches = invaders.filter(inv =>
        !dansLaChasse.has(inv.id) &&
        !dejaFlashes?.has(inv.id) &&
        inv.status !== 'destroyed' &&
        (arSet === null || arSet.has(INVADER_DISTRICT.get(inv.id))) &&
        inv.lng >= mnLng - padLng && inv.lng <= mxLng + padLng &&
        inv.lat >= mnLat - padLat && inv.lat <= mxLat + padLat
      );
      const out = [];
      for (const inv of proches) {
        const near = turf.nearestPointOnLine(line, turf.point([inv.lng, inv.lat]), { units: 'kilometers' });
        if (near.properties.dist <= VOISINS_KM) out.push(inv);
      }
      __DEV__ && console.log(`[Chasse] Voisins : ${proches.length} candidats (bbox) → ${out.length} retenus`);
      return out;
    } catch {
      return [];
    }
    // `flashed` et `unflashedOnly` sont lus à dessein sans figurer en dépendance :
    // ils servent de photographie à l'instant du calcul (voir dejaFlashes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, invaders, explorer]);

  // Tracé DESSINÉ. En mode explorateur, on le simplifie à ~25 m : les petits
  // décrochages dentés qui quittent l'axe de la rue pour toucher la façade exacte
  // désignent l'Invader aussi sûrement qu'une épingle, et à cette distance
  // quelqu'un d'attentif l'identifie sans avoir besoin du crochet. La rue reste
  // la même, le parcours réel et la navigation ne changent pas, seul le dessin
  // cesse d'être au mètre près. C'est le seul endroit où le tracé en disait trop.
  const drawnPolyline = useMemo(() => {
    if (!explorer || !result?.routeCoords || result.routeCoords.length < 3) return null;
    try {
      const simple = turf.simplify(turf.lineString(result.routeCoords), {
        tolerance: 0.00025, highQuality: true, mutate: false,
      });
      return simple.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
    } catch { return null; }
  }, [explorer, result]);

  // Contours à dessiner. Avant génération, ils suivent la sélection en cours ,
  // on voit la zone qu'on est en train de choisir. Après, ils suivent le
  // parcours affiché, qui peut avoir été calculé sur un autre arrondissement.
  const districtRings = useMemo(() => {
    const live = mode === 'quartier' && hasDistricts;
    const core  = result?.ars ?? (live ? [...selectedArs] : []);
    const spill = result?.spillArs ?? [];
    return [
      ...core.map(ar => ({ ar, spill: false, ring: districtRing(ar) })),
      ...spill.map(ar => ({ ar, spill: true, ring: districtRing(ar) })),
    ].filter(r => r.ring);
  }, [result, mode, hasDistricts, selectedArs]);

  // ─── Portion déjà parcourue (gris) vs restante (orange) ──────────────────
  const { walkedPolyline, remainingPolyline } = useMemo(() => {
    if (!result?.polyline || !result?.routeCoords || !following || !userPos) {
      return { walkedPolyline: null, remainingPolyline: result?.polyline ?? null };
    }
    try {
      const line = turf.lineString(result.routeCoords);
      const nearest = turf.nearestPointOnLine(line, turf.point([userPos.longitude, userPos.latitude]));
      const idx = nearest.properties.index ?? 0;
      const split = nearest.geometry.coordinates;
      const toLl = ([lng, lat]) => ({ latitude: lat, longitude: lng });
      const walked = [...result.routeCoords.slice(0, idx + 1).map(toLl), { latitude: split[1], longitude: split[0] }];
      const remaining = [{ latitude: split[1], longitude: split[0] }, ...result.routeCoords.slice(idx + 1).map(toLl)];
      return {
        walkedPolyline: walked.length >= 2 ? walked : null,
        remainingPolyline: remaining.length >= 2 ? remaining : result.polyline,
      };
    } catch {
      return { walkedPolyline: null, remainingPolyline: result.polyline };
    }
  }, [result, userPos, following]);

  // ─── Autocomplétion quartier ──────────────────────────────────────────────
  function onQChange(text) {
    setQText(text);
    setQCoords(null);
    clearTimeout(debounce.current);
    if (text.length >= 3) {
      setQSearching(true);
      setQSugg([]);
      debounce.current = setTimeout(async () => {
        const sugg = await autocomplete(text, gpsRef.current, geoOpts);
        setQSugg(sugg);
        setQSearching(false);
      }, DEBOUNCE_MS);
    } else {
      setQSugg([]);
      setQSearching(false);
    }
  }

  function selectQ(s) {
    setQText(s.label);
    setQCoords(s.coords);
    setQSugg([]);
    setQSearching(false);
    setQFocused(false);
    Keyboard.dismiss();
  }

  function onQBlur() {
    setTimeout(() => { setQSugg([]); setQSearching(false); setQFocused(false); }, 150);
  }

  async function onQFallback() {
    setQSugg([]);
    setQSearching(false);
    setQResolving(true);
    try {
      const r = await geocode(qText, { focus: gpsRef.current, ...geoOpts });
      setQText(r.label);
      setQCoords(r.coords);
    } catch {
      // conserve le texte saisi
    } finally {
      setQResolving(false);
      setQFocused(false);
      Keyboard.dismiss();
    }
  }

  // ─── Génération ───────────────────────────────────────────────────────────
  // Prêt si : autour de moi → GPS ; quartier (Paris) → ≥1 arrondissement ;
  // quartier (autres villes) → adresse résolue.
  const startReady =
    mode === 'around'
      ? gpsReady
      : hasDistricts
        ? selectedArs.size > 0
        : (qCoords !== null && !qResolving);

  // `spill` : relance demandée par la proposition de débordement (voir spillOffer).
  // Ce n'est délibérément PAS un réglage du panneau. L'utilisateur ne peut pas
  // savoir d'avance qu'il ne lui reste que 28 Invaders dans le 7e ; l'information
  // n'existe qu'une fois la chasse calculée. Un interrupteur en amont aurait donc
  // été affiché dans tous les cas pour servir dans une minorité, au milieu de six
  // réglages déjà présents.
  async function generate({ spill = false } = {}) {
    Keyboard.dismiss();
    // Portail d'autorisation (v2 : abonnement + quotas). Aujourd'hui : toujours allowed.
    const access = await canUseFeature(FEATURES.CHASSE);
    if (!access.allowed) { /* TODO v2: afficher paywall */ return; }
    setError(null);
    setSpillDismissed(false);
    // En cas de débordement, le parcours actuel RESTE affiché pendant le
    // recalcul. Le vider ferait disparaître le panneau qui porte le bouton
    // qu'on vient de toucher : plus de bouton, plus d'indicateur, et
    // l'impression que rien ne se passe. Le remplacement se fait quand le
    // nouveau parcours arrive, ou jamais si le calcul échoue.
    if (spill) setSpilling(true); else setResult(null);
    setSelectedInv(null);
    setFollowing(false);
    setDrifted(false);
    setLoading(true);
    try {
      // Point de départ + restriction selon le mode
      let startLon, startLat;
      let arSet = null;    // null = pas de restriction par arrondissement
      let spillArs = null; // arrondissements limitrophes ouverts au remplissage
      if (mode === 'around') {
        [startLon, startLat] = gpsRef.current;
      } else if (hasDistricts) {
        arSet = selectedArs;
        spillArs = spill ? new Set(neighborsOf(selectedArs)) : null;
        // Les Invaders arrivés depuis la dernière version embarquée n'ont pas
        // encore d'arrondissement : sans ça, ils sont écartés sans un mot.
        ensureDistricts(invaders);
        // Départ = centroïde moyen des arrondissements choisis
        const centers = [...selectedArs].map(ar => ARRONDISSEMENT_CENTERS.get(ar)).filter(Boolean);
        startLon = centers.reduce((s, c) => s + c.lon, 0) / centers.length;
        startLat = centers.reduce((s, c) => s + c.lat, 0) / centers.length;
      } else {
        [startLon, startLat] = qCoords;
      }

      const candidates = invaders.filter(inv =>
        inv.status !== 'destroyed' &&
        (!unflashedOnly || !flashed.has(inv.id)) &&
        (arSet === null || arSet.has(INVADER_DISTRICT.get(inv.id)))
      );

      const alpha = poiEnabled ? (POI_ALPHA[objective] ?? 0) : 0;
      const selected = planHunt(startLon, startLat, candidates, budgetMin, SPEEDS[profile], {
        // `remote` : lieux consultables sur la carte mais impossibles à intégrer à
        // un parcours à pied (île, calanque lointaine). Sans ce filtre, un budget
        // généreux pouvait insérer le château d'If dans une chasse, et le calcul
        // d'itinéraire ORS échouait sur la traversée maritime.
        // Le périmètre vaut pour les lieux comme pour les Invaders. Sans ce filtre,
        // une chasse dans le 7e piochait dans les 689 lieux de Paris, le rayon
        // d'admission de planHunt vaut 6,25 km à 2 h de vélo, soit la ville
        // entière, et insérait le Louvre ou les Beaux-Arts. Les seuls arrêts
        // réellement hors zone venaient de là : le budget non consommé par les
        // Invaders se convertissait en visites de l'autre côté de la Seine.
        pois: alpha > 0
          ? getPois(currentCityCode).filter(p =>
              !p.remote &&
              poiPrefs.families.has(familyOf(p)) &&
              (arSet === null || arSet.has(poiDistrict(p)) || !!spillArs?.has(poiDistrict(p)))
            )
          : [],
        spillCandidates: spillArs
          ? invaders.filter(inv =>
              (!unflashedOnly || !flashed.has(inv.id)) &&
              spillArs.has(INVADER_DISTRICT.get(inv.id))
            )
          : [],
        alpha,
        backtrackW: BACKTRACK_W,
      });

      if (selected.length === 0) {
        // Échec « produit » le plus parlant : les réglages ne donnent rien ici.
        // Trop fréquent = le filtre « non flashés » ou le budget sont trop stricts.
        track('plan_failed', { source: 'hunt', reason: 'no_invaders', budget: budgetMin, objective: poiPrefs.objective });
        setError(t('hunt.error.noInvadersReachable'));
        return;
      }

      // Route la boucle puis l'ajuste au budget en se calant sur la VRAIE durée de
      // marche ORS (le modèle interne haversine sous-estime les rues / détours de parc).
      const speedKmPerMin = SPEEDS[profile] / 60;
      const { sel, coords, walkMin } = await routeWithinBudget(
        selected, startLon, startLat, budgetMin, speedKmPerMin, profile, alpha
      );
      // Durée AFFICHÉE = marche réelle (ORS) + temps passé à chaque étape
      // (2 min pour flasher un Invader, 1,5 min pour une pause devant un lieu).
      const totalDurationMin = walkMin + visitTotalMin(sel);

      setResult({
        runId: ++runIdRef.current,
        invaders: sel,
        routeCoords: coords,
        polyline: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
        durationMin: totalDurationMin,
        // Les lieux d'intérêt ne rapportent aucun point : le score reste 100 % Invaders.
        totalPts: sel.reduce((s, x) => s + (x.isPoi ? 0 : x.points), 0),
        invaderCount: sel.filter(x => !x.isPoi).length,
        poiCount: sel.filter(x => x.isPoi).length,
        startLat,
        startLon,
        // Périmètre retenu pour CE parcours, figé avec lui : la carte et les
        // voisins doivent obéir au réglage qui a produit le résultat affiché,
        // pas à celui que l'utilisateur est en train de modifier au-dessus.
        ars: arSet ? [...arSet] : null,
        spillArs: spillArs ? [...spillArs] : null,
        spillOffer: spillOffer(arSet, spillArs, candidates, sel, totalDurationMin, budgetMin),
      });
      setInputCollapsed(true);
      // Complète le tunnel EN AMONT de run_start : l'écart entre les deux mesure
      // combien de chasses sont calculées puis jamais démarrées.
      track('plan_generated', {
        source: 'hunt', budget: budgetMin, objective: poiPrefs.objective, mode: profile,
        steps: sel.length, invaders: sel.filter(x => !x.isPoi).length,
        durationMin: Math.round(totalDurationMin),
      });
    } catch (e) {
      track('plan_failed', { source: 'hunt', reason: failureReason(e), budget: budgetMin });
      setError(e.message ?? t('hunt.error.generation'));
    } finally {
      setLoading(false);
      setSpilling(false);
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  async function startFollowing() {
    // Sans permission, watchPositionAsync échoue et son .catch() avale l'erreur :
    // le suivi était mort en silence et la session enregistrait 0 km. On le dit.
    const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (perm && !perm.granted) {
      Alert.alert(t('session.noGps.title'), t('session.noGps.body'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('session.noGps.settings'), onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
      track('run_start_blocked', { source: 'hunt', reason: 'no_gps' });
      return;
    }
    setFollowing(true);
    setDrifted(false);
    // Démarre l'enregistrement de session (distance + trajet)
    // `profile` fixe le plafond de vraisemblance de la distance : un cycliste
    // atteint 30 km/h en pointe, un marcheur jamais.
    recorder.begin({
      source: 'hunt', city: currentCityCode, routeCoords: result?.routeCoords, profile,
      // Lieux prévus : l'enregistreur retiendra ceux dont on est réellement
      // passé près, pour alimenter le compteur « lieux découverts ».
      pois: (result?.invaders ?? []).filter(s => s.isPoi).map(s => ({ id: s.id, lat: s.lat, lng: s.lng })),
    });
    track('run_start', {
      source: 'hunt', city: currentCityCode,
      objective: poiPrefs.objective, budgetMin, steps: result?.invaders?.length ?? 0,
    });
    if (gpsRef.current) {
      recorder.addPoint(gpsRef.current[1], gpsRef.current[0]);
      mapRef.current?.animateCamera(
        { center: { latitude: gpsRef.current[1], longitude: gpsRef.current[0] }, zoom: 17 },
        { duration: 500 }
      );
    }
  }

  function stopFollowing() {
    setFollowing(false);
    setDrifted(false);
    // Clôt la session → récap + check badges (ignorée si rien ne s'est passé)
    const draft = recorder.end();
    track('run_stop', {
      source: 'hunt',
      distanceKm: draft ? Math.round((draft.distanceKm ?? 0) * 10) / 10 : 0,
      durationMin: draft ? Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 60000) : 0,
    });
    if (draft) recordSession(draft, { skipIfEmpty: true });
  }

  // Réinitialise la chasse : efface le résultat, rouvre le panneau du haut,
  // recentre la carte et abandonne une éventuelle session en cours (pas de récap).
  // Le bouton de recalcul reste accessible PENDANT un parcours, et il détruit la
  // session sans récap ni carte. C'est la seule perte réelle du parcours : elle
  // mérite une confirmation, contrairement à « Terminer » qui, lui, produit la carte.
  function askResetHunt() {
    if (!recorder.isActive()) { resetHunt(); return; }
    Alert.alert(t('session.reset.title'), t('session.reset.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('session.reset.confirm'), style: 'destructive',
        onPress: () => { track('run_discard', { source: 'hunt' }); resetHunt(); } },
    ]);
  }

  function resetHunt() {
    recorder.cancel();
    setResult(null);
    setSelectedInv(null);
    setFollowing(false);
    setDrifted(false);
    setError(null);
    setInputCollapsed(false); // rouvre le panneau du haut
    // recentre sur l'utilisateur (ou la ville courante à défaut)
    if (gpsRef.current) {
      mapRef.current?.animateToRegion(
        { latitude: gpsRef.current[1], longitude: gpsRef.current[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500,
      );
    } else {
      mapRef.current?.animateToRegion(
        { latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta },
        500,
      );
    }
  }

  async function recenter() {
    if (following) { setDrifted(false); return; }
    try {
      // Dernier fix connu du système (tenu à jour par le point bleu actif) : quasi
      // instantané ET frais — contrairement à un nouveau fix (lent sur Android) ou au
      // gpsRef figé au démarrage. Replis : fix courant, puis gpsRef en dernier recours.
      let loc = await Location.getLastKnownPositionAsync();
      if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = loc
        ? { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
        : (gpsRef.current ? { latitude: gpsRef.current[1], longitude: gpsRef.current[0] } : null);
      if (coords) {
        mapRef.current?.animateToRegion(
          { ...coords, latitudeDelta: 0.003, longitudeDelta: 0.003 },
          400
        );
      }
    } catch {}
  }

  function selectInvader(inv) {
    // Mode explorateur : la fiche zoome la carte sur la position exacte, et
    // porte l'indice de localisation. Toucher une ligne de la liste dévoilait
    // donc tout ce que le masquage des épingles venait de cacher, la fuite la
    // plus facile à emprunter, puisque la liste, elle, reste affichée.
    if (explorer && !flashed.has(inv.id)) return;
    const deselect = selectedInv?.id === inv.id;
    setSelectedInv(deselect ? null : inv);
    // En mode navigation : pause la caméra pour laisser l'utilisateur interagir avec le panel
    if (following && !deselect) setDrifted(true);
    mapRef.current?.animateToRegion(
      { latitude: inv.lat, longitude: inv.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 },
      400
    );
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  const qShowEmpty = mode === 'quartier' && qFocused && qText.length >= 3 && !qSearching && qSugg.length === 0 && !qCoords;
  const showQDropdown = mode === 'quartier' && qFocused && (qSearching || qSugg.length > 0 || qShowEmpty);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            mapType={Platform.OS === 'android' ? 'standard' : 'mutedStandard'}
            userInterfaceStyle={isDark ? 'dark' : 'light'}
            customMapStyle={Platform.OS === 'android' ? (isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE) : undefined}
            loadingEnabled={Platform.OS === 'android'}
            loadingBackgroundColor={theme.bg}
            loadingIndicatorColor={theme.accent}
            showsCompass={false}
            showsTraffic={false}
            showsPointsOfInterest={false}
            showsUserLocation={gpsReady}
            showsMyLocationButton={false}
            initialRegion={{ latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta }}
            onPress={() => Keyboard.dismiss()}
            onPanDrag={() => { if (following) setDrifted(true); }}
          >
            {/* Contours d'arrondissement, sous tout le reste.
                Sans eux, rien ne distingue « le parcours sort de la zone » de
                « le parcours longe la frontière », et 12 des 28 Invaders du 7e
                sont à moins de 150 m de la limite, quais et Champ-de-Mars
                obligent. Le tracé d'un itinéraire réel repassera toujours par
                l'arrondissement voisin ; la seule réponse honnête est de montrer
                la limite plutôt que de prétendre ne jamais la franchir.

                Tiretés gris et JAMAIS la couleur d'accent : le tracé de la
                chasse la porte déjà, et deux lignes de la même couleur sur la
                même carte se lisent comme une seule chose. Une frontière
                administrative n'est pas un itinéraire, elle ne doit pas lui
                ressembler. Le débordement est plus fin et plus effacé que
                l'arrondissement choisi. */}
            {districtRings.map(r => (
              <Polygon
                key={`ar-${r.ar}`}
                coordinates={r.ring}
                strokeColor={r.spill ? theme.border : theme.textSecondary}
                strokeWidth={r.spill ? 1 : 1.5}
                lineDashPattern={r.spill ? [3, 7] : [6, 5]}
                fillColor="transparent"
                zIndex={0}
              />
            ))}
            {/* La clé de génération remonte TOUS les enfants de la carte à chaque
                nouveau parcours. Indispensable depuis que la relance par
                débordement garde le résultat affiché au lieu de le vider : c'est
                le seul chemin de l'app qui réconcilie les enfants de la MapView
                en place, et sur Apple Maps la présence d'une annotation dépend
                entièrement du montage React de l'enfant (AIRMap.m, insert/remove
                ReactSubview → add/removeAnnotation). Réconcilier 42 enfants en 76,
                en changeant au passage le rang des 40 étapes, en escamotait 14.
                Remonter coûte une recapture ; ne pas remonter coûte des marqueurs
                absents. */}
            {result && (
              <Fragment key={result.runId}>
                {/* Tracé — gris derrière, orange devant */}
                {walkedPolyline && (
                  <Polyline coordinates={walkedPolyline} strokeColor={theme.textSecondary} strokeWidth={4} lineCap="round" />
                )}
                <Polyline
                  coordinates={remainingPolyline ?? drawnPolyline ?? result.polyline}
                  strokeColor={theme.accent}
                  strokeWidth={4}
                  lineCap="round"
                />
                {/* Point de départ (masqué en mode navigation : on est dessus) */}
                {!following && (
                  <PinMarker key="hunt-start" coordinate={{ latitude: result.startLat, longitude: result.startLon }}
                    anchor={{ x: 0.5, y: 0.5 }}>
                    <View style={styles.pinStart}>
                      <Ionicons name="locate" size={16} color="#fff" />
                    </View>
                  </PinMarker>
                )}
                {/* Rendus AVANT les étapes du parcours pour passer dessous :
                    la chasse doit rester lisible, ces marqueurs sont un bonus. */}
                {voisins.map(inv => {
                  const flash = flashed.has(inv.id);
                  const selv  = selectedInv?.id === inv.id;
                  return (
                    <PinMarker
                      key={`v-${inv.id}`}
                      stateKey={`v-${inv.id}|${flash}|${selv}`}
                      coordinate={{ latitude: inv.lat, longitude: inv.lng }}
                      anchor={{ x: 0.5, y: 0.5 }}
                      onPress={() => selectInvader(inv)}
                      redrawKey={`${flash}|${selv}`}
                      stopPropagation
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={`${inv.id}, ${t(`common.status.${inv.status}`)}, ${t(flash ? 'map.a11y.flashed' : 'map.a11y.todo')}`}
                      accessibilityHint={t('map.a11y.invaderHint')}
                    >
                      <View style={[styles.nearMarker, flash && styles.nearMarkerDone, selv && styles.nearMarkerSel]}>
                        {flash && <Text style={styles.nearMarkerCheck}>✓</Text>}
                      </View>
                    </PinMarker>
                  );
                })}
                {result.invaders.map((inv, i) => {
                  // Mode explorateur : pas d'épingle sur un Invader qu'on n'a pas
                  // encore. Les lieux restent, et un Invader flashé EN COURS de
                  // chasse apparaît, c'est la récompense, et il n'y a plus rien
                  // à révéler. La liste du bas, elle, continue de tout dire :
                  // le mode masque les positions, pas les objectifs.
                  if (explorer && !inv.isPoi && !flashed.has(inv.id)) return null;
                  // Un Invader flashé s'éteint : pastille grise et ✓ au lieu du rang.
                  // `done` DOIT entrer dans redrawKey, sinon le bitmap du marqueur
                  // n'est jamais recapturé et le changement reste invisible.
                  const done = !inv.isPoi && flashed.has(inv.id);
                  const sel  = selectedInv?.id === inv.id || selectedPoi?.id === inv.id;
                  return (
                  <PinMarker key={inv.id} stateKey={`${inv.id}|${done}|${sel}|${i}`}
                    coordinate={{ latitude: inv.lat, longitude: inv.lng }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    onPress={() => (inv.isPoi ? (setSelectedPoi(inv), track('poi_open', { from: 'hunt', theme: inv.theme, lang: i18n.language })) : selectInvader(inv))}
                    redrawKey={`${sel}|${done}|${i}`}>
                    {inv.isPoi ? (
                      // Lieu d'intérêt : losange doré, impossible à confondre avec un alien
                      <View style={styles.poiMarkerWrap}>
                        <View style={[styles.poiMarker, selectedPoi?.id === inv.id && styles.poiMarkerSel]} />
                        {/* Le rang d'un lieu est un rang GLOBAL : deux lieux
                            numérotés 24 et 31 annoncent six Invaders entre eux.
                            Le losange suffit à situer, et le tracé donne l'ordre. */}
                        {!explorer && <Text style={styles.poiMarkerNum}>{i + 1}</Text>}
                      </View>
                    ) : (
                      <View style={[styles.huntMarker, done && styles.huntMarkerDone, sel && styles.huntMarkerSel]}>
                        <Text style={[styles.huntMarkerNum, done && styles.huntMarkerNumDone]}>
                          {done ? '✓' : i + 1}
                        </Text>
                      </View>
                    )}
                  </PinMarker>
                  );
                })}
              </Fragment>
            )}
            {!isChangingCity && <HeadingCone userLocation={userPos} heading={userHeading} />}
          </MapView>
          {isChangingCity && <View style={[StyleSheet.absoluteFillObject, styles.cityTransitionOverlay]} />}

          {/* ── Carte flottante formulaire (masquée en navigation) ── */}
          {!isChangingCity && !following && (
            <View style={[styles.inputCard, { top: insets.top + 8 }]}>
              {!inputCollapsed && (
                <ScrollView
                  contentContainerStyle={styles.inputContent}
                  keyboardShouldPersistTaps="handled"
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Sélecteur de mode */}
                  <View style={styles.modeRow}>
                    {[
                      { key: 'around',   label: t('hunt.aroundMe'),     icon: 'locate-outline' },
                      { key: 'quartier', label: t('hunt.neighborhood'),  icon: 'map-outline' },
                    ].map(m => (
                      <TouchableOpacity key={m.key}
                        style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
                        onPress={() => { setMode(m.key); if (m.key === 'around') setSelectedArs(new Set()); }}
                      >
                        <Ionicons name={m.icon} size={13} color={mode === m.key ? theme.bg : theme.textSecondary} />
                        <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Quartier — villes À arrondissements : un seul à la fois */}
                  {mode === 'quartier' && hasDistricts && (
                    <View style={styles.arSection}>
                      <Text style={styles.arHint}>
                        {selectedArs.size === 0
                          ? t('hunt.pickDistrict')
                          : t('hunt.districtSelected', { ar: [...selectedArs][0] })}
                      </Text>
                      <View style={styles.arGrid} accessibilityRole="radiogroup">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(ar => {
                          const on = selectedArs.has(ar);
                          return (
                            <TouchableOpacity
                              key={ar}
                              style={[styles.arChip, on && styles.arChipActive]}
                              onPress={() => toggleAr(ar)}
                              activeOpacity={0.7}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={t('hunt.districtSelected', { ar })}
                            >
                              <Text style={[styles.arChipText, on && styles.arChipTextActive]}>{ar}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Quartier — villes SANS arrondissement : adresse */}
                  {mode === 'quartier' && !hasDistricts && (
                    <View style={styles.qWrap}>
                      <View style={styles.qRow}>
                        <Ionicons name="location-outline" size={15} color={theme.textSecondary} style={styles.qIcon} />
                        <TextInput
                          ref={quartierInputRef}
                          style={styles.qField}
                          placeholder={t('hunt.neighborhoodPlaceholder')}
                          placeholderTextColor="#C7C7CC"
                          value={qText}
                          onChangeText={onQChange}
                          onFocus={() => setQFocused(true)}
                          onBlur={onQBlur}
                          returnKeyType="done"
                          clearButtonMode="while-editing"
                          autoCorrect={false}
                          autoCapitalize="sentences"
                        />
                        {qResolving && <ActivityIndicator size="small" color={theme.textSecondary} />}
                        {qCoords && !qResolving && (
                          <Ionicons name="checkmark-circle" size={17} color={theme.statusOk} />
                        )}
                        {qSearching && !qResolving && <ActivityIndicator size="small" color={theme.textSecondary} />}
                      </View>
                      {showQDropdown && (
                        <View style={styles.suggestions}>
                          {qSearching ? (
                            <View style={styles.suggState}>
                              <ActivityIndicator size="small" color={theme.textSecondary} />
                              <Text style={styles.suggStateText}>{t('common.searching')}</Text>
                            </View>
                          ) : qSugg.length > 0 ? (
                            qSugg.map((s, i) => (
                              <TouchableOpacity key={i}
                                style={[styles.suggItem, i > 0 && styles.suggBorder]}
                                onPress={() => selectQ(s)}
                              >
                                <Text style={styles.suggText} numberOfLines={1}>{s.label}</Text>
                              </TouchableOpacity>
                            ))
                          ) : qShowEmpty ? (
                            <>
                              <View style={styles.suggState}>
                                <Text style={styles.suggStateText}>{t('common.noResults')}</Text>
                              </View>
                              <TouchableOpacity style={[styles.suggItem, styles.suggBorder]} onPress={onQFallback}>
                                {qResolving
                                  ? <ActivityIndicator size="small" color={theme.accent} />
                                  : <Text style={styles.suggFallbackText} numberOfLines={1}>
                                      {t('hunt.useAddress', { text: qText })}
                                    </Text>
                                }
                              </TouchableOpacity>
                            </>
                          ) : null}
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.divider} />

                  {/* Transport d'abord : c'est lui qui donne son sens au temps.
                      Une heure ne veut pas dire la même chose à pied qu'à vélo,
                      et on choisissait la durée avant de savoir comment on se
                      déplaçait. L'intitulé passe au-dessus de ses options, comme
                      « Tu es plutôt… » — les réglages se lisent alors tous de la
                      même façon : un titre, puis ses choix sur toute la largeur. */}
                  <Text style={styles.fieldLabel}>{t('hunt.transport')}</Text>
                  <View style={styles.segmented}>
                    {[
                      { key: 'foot-walking',    label: t('hunt.walking'),  icon: 'walk-outline' },
                      { key: 'cycling-regular', label: t('hunt.cycling'),  icon: 'bicycle-outline' },
                    ].map(p => (
                      <TouchableOpacity key={p.key}
                        style={[styles.segBtn, profile === p.key && styles.segBtnActive]}
                        onPress={() => setProfile(p.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: profile === p.key }}
                        accessibilityLabel={p.label}
                      >
                        <Ionicons name={p.icon} size={15} color={profile === p.key ? theme.bg : theme.textSecondary} />
                        <Text style={[styles.segBtnText, profile === p.key && styles.segBtnTextActive]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Budget temps. Intitulé en capitales, valeur en casse normale :
                      sans cette séparation, « TEMPS : 1 H » mettait l'unité en
                      majuscule. */}
                  <View style={[styles.labelRow, { marginTop: 14 }]}>
                    <Text style={styles.fieldLabel}>{t('hunt.timeLabelBare')}</Text>
                    <Text style={styles.labelValue}>{formatBudget(budgetMin)}</Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={12}
                    step={1}
                    value={budgetMin / 15}
                    onValueChange={v => setBudgetMin(Math.round(v) * 15)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />

                  {/* Objectif : chasse pure ↔ chasse & visite (villes avec lieux d'intérêt).
                      Hors Paris, le bloc disparaissait sans un mot : quelqu'un venu pour
                      les lieux racontés croyait à une panne. On le dit. */}
                  {!poiEnabled && (
                    <Text style={styles.poiUnavailable}>
                      {t('hunt.poiUnavailable', { city: city.name })}
                    </Text>
                  )}
                  {poiEnabled && (
                    <View style={styles.objectiveBlock}>
                      <ObjectivePicker value={objective} onChange={setObjective} style={{ marginTop: 0 }} />

                      {/* Les sept pastilles de familles pesaient autant que le budget
                          temps pour un filtre secondaire. Une ligne récapitulative les
                          remplace : elle allège le panneau tout en gardant le réglage
                          VISIBLE, ce que leur simple suppression aurait perdu. */}
                      {objective !== 'pure' && <PoiFamiliesRow style={{ marginTop: 12 }} />}
                    </View>
                  )}

                  {/* Toggle */}
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{t('hunt.unflashedOnly')}</Text>
                    <Switch
                      value={unflashedOnly}
                      onValueChange={setUnflashedOnly}
                      trackColor={{ false: theme.border, true: theme.accent }}
                      thumbColor={theme.bg}
                    />
                  </View>

                  {/* Bouton générer. Enveloppé dans une flèche : onPress passe
                      l'événement de pression en premier argument, qui tiendrait
                      sinon lieu de sac d'options. */}
                  <TouchableOpacity
                    style={[styles.genBtn, (!startReady || loading) && styles.genBtnDisabled]}
                    onPress={() => generate()}
                    disabled={!startReady || loading}
                  >
                    {loading
                      ? (
                        <View style={styles.genBtnLoading}>
                          <ActivityIndicator color={theme.bg} />
                          <Text style={styles.genBtnText}>{t('hunt.generating')}</Text>
                        </View>
                      )
                      : <Text style={styles.genBtnText}>{t('hunt.generate')}</Text>
                    }
                  </TouchableOpacity>

                  {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : mode === 'around' && !gpsReady ? (
                    <Text style={styles.hintText}>{t('hunt.waitingGps')}</Text>
                  ) : null}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.collapseBtn} onPress={() => setInputCollapsed(v => !v)}>
                <Ionicons name={inputCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Zone basse : boutons + panel empilés (boutons toujours au-dessus) ── */}
          {!isChangingCity && <View style={styles.bottomZone} pointerEvents="box-none">

            {/* Le bénéfice de « Démarrer » est invisible au moment du choix : on
                l'annonce, sinon personne ne devine qu'il prépare la carte de fin. */}
            {result && (
              <View style={styles.overlayRow} pointerEvents="box-none">
                {following ? (
                  <TouchableOpacity style={styles.stopBtn} onPress={stopFollowing}>
                    <Ionicons name="flag-outline" size={18} color="#fff" />
                    <Text style={styles.trackBtnText}>{t('hunt.quit')}</Text>
                  </TouchableOpacity>
                ) : (
                  // Le bénéfice est DANS le bouton, pas au-dessus. Une pastille
                  // flottante n'était reliée à lui que par la proximité, et on ne
                  // faisait pas le lien. Un « i » aurait été pire : cette phrase
                  // existe pour donner envie d'appuyer sur Démarrer, la cacher
                  // derrière une icône la rend invisible à ceux qu'elle vise.
                  <TouchableOpacity
                    style={styles.startBtn}
                    onPress={startFollowing}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('hunt.start')}. ${t('hunt.startSub')}`}
                  >
                    <Text style={styles.startBtnText}>{t('hunt.start')}</Text>
                    <Text style={styles.startBtnSub}>{t('hunt.startSub')}</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.rightControls}>
                  {/* Report depuis la Chasse. C'est ICI qu'on trouve les Invaders :
                      obliger à revenir sur la Carte pour en marquer un cassait la
                      sortie en deux à chaque trouvaille. Le bouton n'apparaît
                      qu'en mode explorateur, où les épingles masquées privent de
                      tout autre moyen de flasher. */}
                  {explorer && (
                    <TouchableOpacity
                      style={[styles.recenterBtn, { borderColor: theme.accent, borderWidth: StyleSheet.hairlineWidth }]}
                      onPress={() => setExplorerSheet(true)}
                      accessibilityRole="button"
                      accessibilityLabel={t('explorer.badge')}
                      accessibilityHint={t('explorer.badgeHint')}
                    >
                      <Ionicons name="eye-off-outline" size={20} color={theme.accent} />
                    </TouchableOpacity>
                  )}
                  {(!following || drifted) && (
                    <TouchableOpacity style={styles.recenterBtn} onPress={recenter}>
                      <Ionicons name="locate-outline" size={22} color={theme.accent} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.recenterBtn} onPress={askResetHunt} accessibilityLabel={t('common.reset')}>
                    <Ionicons name="refresh" size={20} color={theme.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {selectedInv && (
              <InvaderPanel
                invader={selectedInv}
                onToggleFlash={(id) => { if (!flashed.has(id)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); toggleFlash(id); }}
                onNavigate={(lat, lng) => openNavigationApp(mapsApp ?? 'apple', lat, lng)}
                onClose={(opts) => {
                  setSelectedInv(null);
                  // Pas de reprise du suivi auto après un FLASH (marquage en série).
                  if (following && !opts?.fromFlash) setDrifted(false);
                }}
                autoCloseOnAction={following}
              />
            )}
          </View>}
        </View>

        {/* Volet de report, hors de tout conditionnel : il porte sa propre
            visibilité. Pas d'animation ici (l'écran n'a pas d'overlay de flash),
            mais un retour haptique, et la pastille de l'étape s'allume aussitôt. */}
        <ExplorerSheet
          visible={explorerSheet}
          onClose={() => setExplorerSheet(false)}
          onFlash={(id) => {
            toggleFlash(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }}
        />

        {/* ── Panneau résultat (masqué en navigation ET quand le formulaire est ouvert) ── */}
        {!isChangingCity && result && !following && inputCollapsed && (
          <View style={styles.resultPanel}>
            <View style={styles.resultHeader}>
              <View style={styles.resultHeaderRow}>
                <Text style={[styles.resultSummary, { flex: 1 }]}>
                  {t('hunt.resultCount', { count: result.invaderCount ?? result.invaders.length })}
                  {result.poiCount > 0 && (
                    <Text style={{ color: theme.accentScore }}>
                      {' · '}{t('hunt.poiCount', { count: result.poiCount })}
                    </Text>
                  )}
                  {' · '}{result.totalPts} {t('common.pts')}{' · '}~{formatBudget(result.durationMin)}
                </Text>
                {/* Repliée par défaut : la carte reste l'écran principal, la
                    légende n'est utile qu'à la première rencontre d'un symbole. */}
                <TouchableOpacity
                  onPress={() => setLegendOpen(o => !o)}
                  style={styles.legendToggle}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: legendOpen }}
                  accessibilityLabel={t('hunt.legend.title')}
                >
                  <Ionicons name={legendOpen ? 'chevron-up' : 'information-circle-outline'} size={16} color={theme.textSecondary} />
                  <Text style={styles.legendToggleText}>{t('hunt.legend.title')}</Text>
                </TouchableOpacity>
              </View>
              {/* Proposition de débordement. N'apparaît que quand elle est VRAIE :
                  plus un seul Invader à prendre dans l'arrondissement, et une part
                  franche du budget encore sur la table. Accepter relance un calcul
                  d'itinéraire, d'où la mesure : on ne le propose pas à la légère. */}
              {result.spillOffer && !spillDismissed && (
                <View style={styles.spillBox}>
                  <Text style={styles.spillText}>
                    {t('hunt.spillOffer.text', {
                      count: result.spillOffer.count,
                      left: result.spillOffer.leftoverMin,
                    })}
                  </Text>
                  {/* Pendant le recalcul, les deux réponses cèdent la place à
                      l'état d'avancement, au même endroit et à la même hauteur :
                      le bloc ne bouge pas sous le doigt qui vient de toucher. */}
                  {spilling ? (
                    <View style={[styles.spillBtn, styles.spillBtnBusy]}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={styles.spillBtnText}>{t('hunt.spillOffer.working')}</Text>
                    </View>
                  ) : (
                    <View style={styles.spillActions}>
                      <TouchableOpacity
                        style={[styles.spillBtn, styles.spillBtnGhost]}
                        onPress={() => setSpillDismissed(true)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                      >
                        <Text style={styles.spillBtnGhostText}>{t('hunt.spillOffer.decline')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.spillBtn}
                        onPress={() => generate({ spill: true })}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                      >
                        <Text style={styles.spillBtnText}>{t('hunt.spillOffer.accept')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              {legendOpen && (
                <View style={styles.legendBox}>
                  <LegendRow label={t('hunt.legend.step')} styles={styles}>
                    <View style={styles.legendStep}><Text style={styles.legendStepNum}>1</Text></View>
                  </LegendRow>
                  <LegendRow label={t('hunt.legend.poi')} styles={styles}>
                    <View style={styles.legendPoiWrap}>
                      <View style={styles.legendPoi} />
                      <Text style={styles.legendPoiNum}>2</Text>
                    </View>
                  </LegendRow>
                  <LegendRow label={t('hunt.legend.near')} styles={styles}>
                    <View style={styles.nearMarker} />
                  </LegendRow>
                  <LegendRow label={t('hunt.legend.done')} styles={styles}>
                    <View style={[styles.nearMarker, styles.nearMarkerDone]}>
                      <Text style={styles.nearMarkerCheck}>✓</Text>
                    </View>
                  </LegendRow>
                </View>
              )}
            </View>
            <FlatList
              data={result.invaders}
              keyExtractor={inv => inv.id}
              // Sans extraData, une ligne déjà rendue ne se rafraîchit pas quand
              // `flashed` change : le ✓ n'apparaîtrait qu'au prochain recyclage.
              extraData={flashed}
              style={styles.resultList}
              renderItem={({ item: inv, index }) =>
                inv.isPoi ? (
                  <TouchableOpacity style={styles.poiRow} onPress={() => { setSelectedPoi(inv); track('poi_open', { from: 'hunt_list', theme: inv.theme, lang: i18n.language }); }} activeOpacity={0.7}>
                    <View style={styles.poiRowDiamond} />
                    <Text style={styles.poiRowNum}>{index + 1}</Text>
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Text style={styles.poiRowName} numberOfLines={1}>{inv.name}</Text>
                      <Text style={styles.poiRowSub} numberOfLines={1}>{t('hunt.poiBadge')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
                  </TouchableOpacity>
                ) : (
                  <HuntRow
                    inv={inv}
                    index={index}
                    isFlashed={flashed.has(inv.id)}
                    statusColors={statusColors}
                    onPress={() => selectInvader(inv)}
                  />
                )
              }
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        )}

        {/* ── Fiche « lieu d'intérêt » ── */}
        {selectedPoi && (
          <View style={styles.poiSheet}>
            {selectedPoi.photo && (
              <View style={styles.poiPhotoWrap}>
                <Image
                  source={{ uri: selectedPoi.photo }}
                  style={styles.poiPhoto}
                  contentFit="cover"
                  cachePolicy="disk"
                  transition={150}
                />
                {selectedPoi.photoBy && (
                  <Text style={styles.poiPhotoCredit} numberOfLines={1}>
                    {selectedPoi.photoBy} · {selectedPoi.photoLic}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.poiSheetHead}>
              <View style={styles.poiSheetDiamond} />
              <Text style={styles.poiSheetTitle} numberOfLines={2}>{selectedPoi.name}</Text>
              <TouchableOpacity onPress={() => setSelectedPoi(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.poiSheetChip}>{t(`hunt.poiTheme.${selectedPoi.theme}`)}</Text>
            <Text style={styles.poiSheetText}>{summaryOf(selectedPoi)}</Text>
            <View style={styles.poiSheetActions}>
              <TouchableOpacity
                style={styles.poiSheetBtnPrimary}
                onPress={() => openNavigationApp(mapsApp ?? 'apple', selectedPoi.lat, selectedPoi.lng)}
                activeOpacity={0.85}
              >
                <Text style={styles.poiSheetBtnPrimaryText}>{t('map.panel.navigate')}</Text>
              </TouchableOpacity>
              {wikiUrl(selectedPoi) && (
                <TouchableOpacity
                  style={styles.poiSheetBtn}
                  onPress={() => Linking.openURL(wikiUrl(selectedPoi)).catch(() => {})}
                  activeOpacity={0.85}
                >
                  <Text style={styles.poiSheetBtnText}>{t('hunt.poiMore')} ↗</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.poiSheetCredit}>{t('hunt.poiCredit')}</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles thémés ───────────────────────────────────────────────────────────

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1 },
    mapContainer: { flex: 1 },
    map: { flex: 1 },
    cityTransitionOverlay: { backgroundColor: t.bg },

    // ── Carte flottante ──────────────────────────────────────────────────────
    inputCard: {
      position: 'absolute', left: 12, right: 12,
      backgroundColor: t.surface,
      borderRadius: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25, shadowRadius: 14, elevation: 10, zIndex: 20,
    },
    inputContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
    collapseBtn: {
      alignItems: 'center', paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },

    // ── Sélecteur de mode ────────────────────────────────────────────────────
    modeRow: { flexDirection: 'row', gap: 8 },
    modeBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: t.surfaceHigh,
    },
    modeBtnActive: { backgroundColor: t.accent },
    modeBtnText: { fontSize: 13, fontWeight: '500', color: t.textSecondary },
    modeBtnTextActive: { color: t.bg },

    // ── Champ quartier ───────────────────────────────────────────────────────
    qWrap: { marginTop: 10 },
    qRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qIcon: { width: 20, textAlign: 'center' },
    qField: { flex: 1, fontSize: 15, color: t.textPrimary, paddingVertical: 8 },

    // ── Dropdown ─────────────────────────────────────────────────────────────
    suggestions: {
      backgroundColor: t.surface, borderRadius: 8, marginTop: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15, shadowRadius: 6, elevation: 6, overflow: 'hidden',
    },
    suggItem: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: t.surface },
    suggBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    suggText: { fontSize: 14, color: t.textPrimary },
    suggState: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
    suggStateText: { fontSize: 14, color: t.textSecondary },
    suggFallbackText: { fontSize: 14, color: t.accent, fontStyle: 'italic' },

    // ── Champs formulaire ────────────────────────────────────────────────────
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 10 },
    fieldLabel: { ...typography.fieldLabel, color: t.textSecondary },
    // Intitulé + valeur sur une ligne : la valeur garde sa casse et se détache
    // en couleur pleine, l'intitulé reste discret.
    labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
    labelValue: { fontSize: 13, fontWeight: '700', color: t.textPrimary },
    slider: { width: '100%', height: 32, marginBottom: 2 },

    // Les deux modes occupent toute la largeur, comme les trois segments
    // d'objectif : un réglage n'a pas de raison d'être serré à droite quand son
    // voisin s'étale. `flex: 1` sur chaque bouton, pas de largeur fixe.
    segmented: { flexDirection: 'row', gap: 6, marginTop: 8 },
    segBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 10,
      borderRadius: 10, backgroundColor: t.surfaceHigh,
    },
    segBtnActive: { backgroundColor: t.accent },
    segBtnText: { fontSize: 13, fontWeight: '500', color: t.textSecondary },
    segBtnTextActive: { color: t.bg },

    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    toggleLabel: { fontSize: 13, color: t.textPrimary },

    // Proposition de débordement : teintée d'accent pour se distinguer du
    // récapitulatif, sans crier, c'est une suggestion, pas une alerte.
    spillBox: {
      marginTop: 10, padding: 11, borderRadius: 11,
      backgroundColor: t.accentDim, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    spillText: { fontSize: 12.5, color: t.textPrimary, lineHeight: 17 },
    // Les deux réponses ont la même largeur : ni l'une ni l'autre n'est le
    // choix « par défaut », rester sur son parcours est aussi légitime.
    spillActions: { flexDirection: 'row', gap: 8 },
    spillBtn: {
      flex: 1, marginTop: 9,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      paddingVertical: 9, paddingHorizontal: 8, borderRadius: 9,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.accent,
    },
    spillBtnGhost: { borderColor: t.border },
    spillBtnBusy: { borderColor: t.border },
    spillBtnText: { fontSize: 12.5, fontWeight: '600', color: t.accent, textAlign: 'center' },
    spillBtnGhostText: { fontSize: 12.5, fontWeight: '600', color: t.textSecondary, textAlign: 'center' },

    genBtn: {
      // Même rayon que « Calculer l'itinéraire » et que les segments d'objectif,
      // pour que les deux écrans parlent la même langue graphique.
      marginTop: 16, backgroundColor: t.accent,
      borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    },
    genBtnDisabled: { opacity: 0.45 },
    genBtnLoading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    genBtnText: { ...typography.actionLabel, color: t.bg },
    errorText: { fontSize: 13, color: t.destructive, marginTop: 8, textAlign: 'center' },
    hintText: { fontSize: 12, color: t.textSecondary, marginTop: 6, textAlign: 'center' },

    // ── Sélecteur d'arrondissements (mode quartier, Paris) ───────────────────
    arSection: { marginTop: 4 },
    arHint: { ...typography.fieldLabel, color: t.textSecondary, marginBottom: 10 },
    arGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // Pastilles RONDES et non carrées : un carré aligné en grille se lit comme
    // une case à cocher — « prends-en autant que tu veux » —, un cercle comme un
    // bouton radio. La sélection étant désormais unique, la forme doit le dire
    // avant qu'on ait touché quoi que ce soit.
    arChip: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.surfaceHigh,
      borderWidth: 1.5, borderColor: t.border,
    },
    arChipActive: { backgroundColor: t.accent, borderColor: t.accent },
    arChipText: { fontSize: 15, fontWeight: '600', color: t.textPrimary },
    // Le choix retenu passe en gras : sur vingt pastilles, la seule couleur ne
    // suffit pas à le retrouver du coin de l'œil.
    arChipTextActive: { color: t.bg, fontWeight: '800' },

    // ── Zone basse : conteneur qui empile boutons puis panel ────────────────
    bottomZone: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
    },
    overlayRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
      paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8,
    },
    rightControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    startBtn: {
      // Colonne et non rangée : le bouton porte un titre et son bénéfice.
      alignItems: 'flex-start', backgroundColor: t.accent, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 9,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    stopBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.surfaceHigh, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    trackBtnText: { color: t.textPrimary, fontWeight: '600', fontSize: 14 },
    startBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
    // Même encre que le titre, atténuée : un gris franc sur fond vif se lit mal.
    startBtnSub: { color: '#000', opacity: 0.68, fontSize: 11, marginTop: 1 },
    recenterBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },

    // ── Marqueurs carte ──────────────────────────────────────────────────────
    pinStart: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
    },
    huntMarker: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
    },
    huntMarkerSel: { backgroundColor: t.textPrimary, borderColor: t.accent },
    // Flashé : la pastille s'éteint sans disparaître. Bordure conservée pour
    // rester lisible sur un fond de carte clair comme sur un fond sombre.
    huntMarkerDone: { backgroundColor: t.textSecondary, borderColor: t.surface, opacity: 0.75 },
    huntMarkerNum: { color: t.bg, fontSize: 11, fontWeight: '700' },
    huntMarkerNumDone: { color: t.surface, fontSize: 13 },

    // ── Invaders hors parcours ────────────────────────────────────────────
    // Même famille que les pastilles d'étape — un sprite alien au milieu de
    // pastilles numérotées faisait deux langages sur la même carte — mais sans
    // rang et deux fois plus petites : elles situent ce qu'il y a autour sans
    // entrer dans la lecture du parcours.
    //
    // Un voisin flashé reprend le langage d'une étape faite — gris plein, ✓,
    // opacité réduite — plutôt que de disparaître : deux réactions différentes
    // au même geste sur la même carte n'avaient aucune justification, sinon la
    // mienne, erronée, qu'un ✓ serait illisible à cette taille. Vérifié à
    // l'échelle de l'écran : il l'est dès 15 pt, confortablement à 17.
    // L'anneau creux (à trouver) partage cette taille : même objet, même gabarit,
    // et une cible tactile un peu plus sûre qu'à 15.
    nearMarker: {
      width: 17, height: 17, borderRadius: 9,
      borderWidth: 2.5, borderColor: t.textSecondary, backgroundColor: t.surface,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2,
    },
    // Mêmes valeurs que huntMarkerDone : la pastille s'éteint sans disparaître.
    nearMarkerDone:  { backgroundColor: t.textSecondary, borderColor: t.surface, opacity: 0.75 },
    nearMarkerCheck: { color: t.surface, fontSize: 10, fontWeight: '700', lineHeight: 12 },
    nearMarkerSel:   { borderColor: t.accent, backgroundColor: t.textPrimary },

    // ── Lieux d'intérêt (or, jamais vert : on ne confond pas avec un Invader) ──
    poiMarkerWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    poiMarker: {
      position: 'absolute', width: 24, height: 24, borderRadius: 6,
      backgroundColor: t.accentScore, borderWidth: 2, borderColor: '#fff',
      transform: [{ rotate: '45deg' }],
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2,
    },
    poiMarkerSel: { backgroundColor: t.textPrimary, borderColor: t.accentScore },
    poiMarkerNum: { color: '#221A00', fontSize: 11, fontWeight: '800' },

    objectiveBlock: { marginTop: 14 },
    poiUnavailable: { marginTop: 14, fontSize: 12, lineHeight: 17, color: t.textSecondary },

    poiRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 52 },
    poiRowDiamond: {
      position: 'absolute', left: 14, width: 22, height: 22, borderRadius: 5,
      backgroundColor: t.accentScore, transform: [{ rotate: '45deg' }],
    },
    poiRowNum: { width: 22, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#221A00' },
    poiRowName: { fontSize: 14, fontWeight: '700', color: t.accentScore },
    poiRowSub: { fontSize: 11, color: t.textSecondary, marginTop: 1 },

    poiSheet: {
      position: 'absolute', left: 12, right: 12, bottom: 16,
      backgroundColor: t.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: t.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 10,
    },
    poiPhotoWrap: {
      height: 132, borderRadius: 11, overflow: 'hidden', marginBottom: 13,
      backgroundColor: t.surfaceHigh,
    },
    poiPhoto: { width: '100%', height: '100%' },
    poiPhotoCredit: {
      position: 'absolute', right: 7, bottom: 5,
      fontSize: 9, color: 'rgba(255,255,255,0.85)',
      backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
    },
    poiSheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    poiSheetDiamond: {
      width: 15, height: 15, borderRadius: 4, backgroundColor: t.accentScore,
      transform: [{ rotate: '45deg' }],
    },
    poiSheetTitle: { flex: 1, ...typography.arcadeHeading, fontSize: 15, color: t.textPrimary },
    poiSheetChip: {
      alignSelf: 'flex-start', marginTop: 9, fontSize: 10, fontWeight: '800', letterSpacing: 0.4,
      color: t.accentScore, borderWidth: 1, borderColor: t.accentScore, borderRadius: 999,
      paddingHorizontal: 8, paddingVertical: 2, textTransform: 'uppercase',
    },
    poiSheetText: { marginTop: 11, fontSize: 13.5, lineHeight: 19, color: t.textPrimary },
    poiSheetActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    poiSheetBtnPrimary: {
      flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: t.accentScore,
    },
    poiSheetBtnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#221A00' },
    poiSheetBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10,
      backgroundColor: t.surfaceHigh, borderWidth: 1, borderColor: t.border,
    },
    poiSheetBtnText: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
    poiSheetCredit: { fontSize: 10, color: t.textSecondary, textAlign: 'center', marginTop: 10 },

    // ── Panneau résultat ─────────────────────────────────────────────────────
    resultPanel: {
      height: 220, backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },
    resultHeader: {
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    resultSummary: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
    resultHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    legendToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingLeft: 6 },
    legendToggleText: { fontSize: 12, color: t.textSecondary },
    legendBox: { marginTop: 10, gap: 8 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    legendIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
    legendLabel: { fontSize: 12, color: t.textSecondary, flex: 1 },
    legendStep: {
      width: 20, height: 20, borderRadius: 10, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff',
    },
    legendStepNum: { color: t.bg, fontSize: 9, fontWeight: '700' },
    legendPoiWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
    legendPoi: {
      position: 'absolute', width: 17, height: 17, borderRadius: 4,
      backgroundColor: t.accentScore, borderWidth: 1.5, borderColor: '#fff',
      transform: [{ rotate: '45deg' }],
    },
    legendPoiNum: { color: '#221A00', fontSize: 9, fontWeight: '800' },
    resultList: { flex: 1 },

    huntRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, gap: 10 },
    orderBadge: {
      width: 22, height: 22, borderRadius: 11, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    orderNum: { color: t.bg, fontSize: 11, fontWeight: '700' },
    orderBadgeDone: { backgroundColor: t.textSecondary },
    orderNumDone: { color: t.surface, fontSize: 12 },
    huntTextDone: { color: t.textSecondary, textDecorationLine: 'line-through' },
    huntDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    huntId: { fontWeight: '600', fontSize: 14, color: t.textPrimary, width: 80 },
    huntPts: { fontSize: 13, color: t.textSecondary, flex: 1 },
    flashedBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: t.accentDim },
    flashedBadgeText: { fontSize: 12, fontWeight: '600', color: t.statusOk },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 16 },
  });
}
