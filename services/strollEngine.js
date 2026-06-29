/**
 * services/strollEngine.js — Moteur de proximité du « Mode balade ».
 *
 * Principe : GEOFENCING GLISSANT (économe en batterie, pas de GPS continu).
 *   - On enregistre les ~19 Invaders non flashés les plus proches comme régions
 *     « entrée » + 1 région « périmètre » (sortie) centrée sur l'utilisateur.
 *   - À l'ENTRÉE d'une région Invader → alerte (notif locale + vibration).
 *   - À la SORTIE du périmètre → l'utilisateur s'est déplacé → on recalcule les
 *     19 plus proches et on repositionne les geofences (le « glissement »).
 *
 * Tout passe par une tâche de fond (expo-task-manager) → fonctionne app fermée
 * si l'autorisation « Toujours » est accordée.
 *
 * ⚠️ Geofencing/tâches de fond ne fonctionnent PAS dans Expo Go → uniquement
 * en dev build. Les appels sont protégés pour ne pas casser Expo Go.
 */

import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ expo-task-manager n'a PAS de module natif dans Expo Go → son chargement y
// lève « Cannot find native module 'ExpoTaskManager' ». On protège le require :
// s'il échoue (Expo Go), le moteur reste inactif (l'UI/les réglages marchent ;
// les alertes nécessitent un dev/prod build).
let TaskManager = null;
try {
  TaskManager = require('expo-task-manager');
} catch (e) {
  console.log('[Stroll] expo-task-manager indisponible (Expo Go) :', e?.message);
}
const ENGINE_AVAILABLE = !!TaskManager;

export const GEOFENCE_TASK = 'invaderquest-stroll-geofencing';

// Clés AsyncStorage (lues aussi par la tâche de fond, hors contexte React)
const KEY_SETTINGS   = '@invader_stroll';        // {enabled, radius, vibration, notification, unflashedOnly}
const KEY_CANDIDATES = '@stroll_candidates';     // [{id, lat, lng}] (non flashés, non détruits)
const KEY_NOTIF      = '@stroll_notif';          // {title, body} localisés ({id} = placeholder)
const KEY_ALERTS     = '@stroll_last_alerts';    // { [id]: epochMs } anti-répétition par Invader
const KEY_LAST_ALERT = '@stroll_last_alert_at';  // epochMs — espacement global (un à la fois)

// Réglages du moteur
const MAX_REGIONS     = 20;                       // limite iOS (region monitoring)
const INVADER_REGIONS = MAX_REGIONS - 1;          // 19 Invaders + 1 périmètre
const PER_ID_COOLDOWN = 6 * 60 * 60 * 1000;       // même Invader : pas de ré-alerte avant 6 h
const GLOBAL_GAP      = 45 * 1000;                // un à la fois : 45 s entre deux alertes
const MAX_SPEED_MPS   = 8;                        // > ~29 km/h → en véhicule → on n'alerte pas
const PERIMETER_ID    = 'perimeter';
const INV_PREFIX      = 'inv:';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function distM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad, dLng = (bLng - aLng) * toRad;
  const la1 = aLat * toRad, la2 = bLat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function readJSON(key, fallback) {
  try { const r = await AsyncStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}
async function writeJSON(key, val) {
  try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Construit les régions autour d'une position : 19 Invaders proches + 1 périmètre
function buildRegions(lat, lng, candidates, radius) {
  const nearest = candidates
    .map(c => ({ ...c, d: distM(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, INVADER_REGIONS);

  const regions = nearest.map(c => ({
    identifier: INV_PREFIX + c.id,
    latitude: c.lat,
    longitude: c.lng,
    radius: Math.max(radius, 20),            // plancher 20 m (fiabilité geofence)
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  // Périmètre : rayon = distance au plus lointain des 19 (min 150 m).
  // Quand l'utilisateur en sort, on sait qu'il faut recalculer.
  const farthest = nearest.length ? nearest[nearest.length - 1].d : 200;
  regions.push({
    identifier: PERIMETER_ID,
    latitude: lat,
    longitude: lng,
    radius: Math.max(farthest, 150),
    notifyOnEnter: false,
    notifyOnExit: true,
  });
  return regions;
}

// ─── API publique (appelée par le bridge React) ────────────────────────────────

/** Demande les autorisations. Retourne { foreground, background }. */
export async function requestStrollPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  let bg = { status: 'undetermined' };
  if (fg.status === 'granted') {
    try { bg = await Location.requestBackgroundPermissionsAsync(); } catch {}
  }
  // Notifications (pour l'alerte locale)
  try { await Notifications.requestPermissionsAsync(); } catch {}
  return { foreground: fg.status === 'granted', background: bg.status === 'granted' };
}

/** (Re)positionne les geofences autour de la position actuelle. */
export async function refreshGeofences() {
  if (!ENGINE_AVAILABLE) { console.log('[Stroll] geofencing indisponible (dev build requis)'); return false; }
  const settings = await readJSON(KEY_SETTINGS, null);
  if (!settings?.enabled) return false;
  const candidates = await readJSON(KEY_CANDIDATES, []);
  if (!candidates.length) { console.log('[Stroll] aucun candidat'); return false; }

  let loc = null;
  try { loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); }
  catch { try { loc = await Location.getLastKnownPositionAsync(); } catch {} }
  if (!loc) { console.log('[Stroll] pas de position'); return false; }

  const { latitude, longitude } = loc.coords;
  const regions = buildRegions(latitude, longitude, candidates, settings.radius ?? 50);
  try {
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    console.log(`[Stroll] ${regions.length} geofences posées (rayon ${settings.radius} m) @ ${latitude.toFixed(4)},${longitude.toFixed(4)}`);
    return true;
  } catch (e) {
    console.log('[Stroll] startGeofencing erreur (Expo Go ?) :', e?.message);
    return false;
  }
}

/** Persiste les candidats (Invaders à cibler) pour la tâche de fond. */
export async function persistCandidates(candidates) {
  await writeJSON(KEY_CANDIDATES, Array.isArray(candidates) ? candidates : []);
}

/** Persiste les textes localisés de notification ({id} = placeholder dans body). */
export async function persistNotifStrings(title, body) {
  await writeJSON(KEY_NOTIF, { title, body });
}

export async function startStroll() { return refreshGeofences(); }

export async function stopStroll() {
  if (!ENGINE_AVAILABLE) return;
  try {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (started) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
      console.log('[Stroll] geofencing arrêté');
    }
  } catch (e) { console.log('[Stroll] stop erreur :', e?.message); }
}

// ─── Tâche de fond (geofencing) ────────────────────────────────────────────────

if (TaskManager) {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    if (error) { console.log('[Stroll] task error :', error.message); return; }
    const { eventType, region } = data || {};
    if (!region) return;
    try {
      if (eventType === Location.GeofencingEventType.Exit && region.identifier === PERIMETER_ID) {
        console.log('[Stroll] sortie périmètre → recalcul');
        await refreshGeofences();
        return;
      }
      if (eventType === Location.GeofencingEventType.Enter && region.identifier.startsWith(INV_PREFIX)) {
        await handleEnter(region.identifier.slice(INV_PREFIX.length));
      }
    } catch (e) { console.log('[Stroll] handle error :', e?.message); }
  });
}

async function handleEnter(invId) {
  const settings = await readJSON(KEY_SETTINGS, null);
  if (!settings?.enabled) return;

  const now = Date.now();

  // Anti-spam global : un à la fois
  const lastGlobal = await readJSON(KEY_LAST_ALERT, 0);
  if (now - lastGlobal < GLOBAL_GAP) { console.log('[Stroll] skip (gap global)'); return; }

  // Anti-spam par Invader
  const alerts = await readJSON(KEY_ALERTS, {});
  if (alerts[invId] && now - alerts[invId] < PER_ID_COOLDOWN) { console.log('[Stroll] skip (déjà alerté)', invId); return; }

  // Filtre de vitesse : pas d'alerte si l'utilisateur va trop vite (véhicule)
  try {
    const loc = await Location.getLastKnownPositionAsync();
    const sp = loc?.coords?.speed;
    if (typeof sp === 'number' && sp > MAX_SPEED_MPS) { console.log('[Stroll] skip (vitesse)', sp.toFixed(1)); return; }
  } catch {}

  // Déclenche selon les réglages
  if (settings.vibration) {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  }
  if (settings.notification) {
    const tpl = await readJSON(KEY_NOTIF, { title: 'Invader à proximité 👾', body: '{id} est tout près !' });
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: tpl.title,
          body: (tpl.body || '{id}').replace('{id}', invId),
          sound: true,
        },
        trigger: null, // immédiat
      });
    } catch (e) { console.log('[Stroll] notif erreur :', e?.message); }
  }

  alerts[invId] = now;
  await writeJSON(KEY_ALERTS, alerts);
  await writeJSON(KEY_LAST_ALERT, now);
  console.log('[Stroll] ALERTE', invId);
}

// ─── Affichage des notifications même app au premier plan ───────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // anciennes versions
    shouldShowBanner: true,  // SDK 54
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
