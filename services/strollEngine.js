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
import { Platform } from 'react-native';
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
  __DEV__ && console.log('[Stroll] expo-task-manager indisponible (Expo Go) :', e?.message);
}
const ENGINE_AVAILABLE = !!TaskManager;

export // Son de l'alerte de proximité — NOTRE choix, pas celui de l'utilisateur.
//
// Lui décide s'il veut du son ou non (réglage `son` du Mode balade) ; nous
// décidons lequel, parce que c'est une question d'identité et non de préférence.
// Huit candidats sont embarqués : écrire ici un autre nom de fichier suffit à
// changer d'avis, et ce changement-là passe PAR-DESSUS LES AIRS.
//
// Le FICHIER, lui, ne peut pas arriver par OTA : le plugin expo-notifications le
// recopie dans le paquet de l'application au moment de la construction
// (copyFileSync). D'où huit candidats plutôt qu'un seul.
const SON_ALERTE = 'alerte_arcade_grave.wav';

// Canal Android. Un canal fige son son et sa vibration à la création : pour en
// changer il faut un IDENTIFIANT DIFFÉRENT, sinon Android ignore la mise à jour
// en silence. On le dérive donc des réglages. iOS n'a pas de canaux : la
// notification y part sans déclencheur.
async function canalAndroid(avecSon, avecVibration) {
  if (Platform.OS !== 'android') return null;
  const id = `stroll-${avecSon ? 'son' : 'muet'}-${avecVibration ? 'vib' : 'sansvib'}`;
  try {
    await Notifications.setNotificationChannelAsync(id, {
      name: 'Alertes de proximité',
      importance: Notifications.AndroidImportance.HIGH,
      sound: avecSon ? SON_ALERTE : null,
      enableVibrate: avecVibration,
      vibrationPattern: avecVibration ? [0, 220, 120, 220] : null,
    });
    return id;
  } catch {
    return null;   // au pire, le canal par défaut : mieux que pas d'alerte
  }
}

const GEOFENCE_TASK = 'invaderquest-stroll-geofencing';

// Clés AsyncStorage (lues aussi par la tâche de fond, hors contexte React)
const KEY_SETTINGS   = '@invader_stroll';        // {enabled, radius, vibration, notification, unflashedOnly}
const KEY_CANDIDATES = '@stroll_candidates';     // [{id, lat, lng}] (non flashés, non détruits)
const KEY_NOTIF      = '@stroll_notif';          // {title, body} localisés ({id} = placeholder)
const KEY_ALERTS     = '@stroll_last_alerts';    // { [id]: epochMs } anti-répétition par Invader
const KEY_LAST_ALERT = '@stroll_last_alert_at';  // epochMs — espacement global (un à la fois)
// Mode explorateur, écrit par AppContext. Lu ICI, à chaque alerte, et non passé
// au moteur au démarrage : la tâche de fond s'exécute dans un processus réveillé
// par le système, souvent tout neuf, qui n'a jamais vu le contexte React. Une
// valeur capturée au dernier lancement serait périmée dès que l'utilisateur
// change de mode sans rouvrir l'app.
const KEY_EXPLORER   = '@invader_explorer';

// Réglages du moteur
const MAX_REGIONS     = 20;                       // limite iOS (region monitoring)
const INVADER_REGIONS = MAX_REGIONS - 1;          // 19 Invaders + 1 périmètre
const PER_ID_COOLDOWN = 2 * 60 * 60 * 1000;       // même Invader : pas de ré-alerte avant 2 h
const GLOBAL_GAP      = 10 * 1000;                // un à la fois : 10 s entre deux alertes
const MAX_SPEED_MPS   = 8;                        // > ~29 km/h → en véhicule → on n'alerte pas
const PERIMETER_ID    = 'perimeter';
const INV_PREFIX      = 'inv:';

// Anti-doublon SYNCHRONE en mémoire (même contexte JS) : la vérification de
// proximité immédiate et l'événement geofence iOS peuvent appeler handleEnter
// quasi simultanément pour le même Invader → ces gardes empêchent la double notif.
const inFlight = new Set();          // ids en cours de traitement
const memAlerts = new Map();         // id -> dernier alerte (ms)
let memLastGlobal = 0;               // dernière alerte, tous Invaders

// File d'attente : sérialise les lectures/écritures de KEY_ALERTS entre plusieurs
// handleEnter concurrents (zone dense = rafale d'événements). Sans elle, chaque
// appel réécrivait TOUT le fichier depuis son instantané → cooldowns perdus →
// re-notifications au prochain lancement de l'app.
let alertsQueue = Promise.resolve();
function withAlertsLock(fn) {
  const run = alertsQueue.then(fn, fn);
  alertsQueue = run.catch(() => {});
  return run;
}

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

// Les N Invaders candidats les plus proches d'une position (avec distance .d)
function nearestCandidates(lat, lng, candidates) {
  return candidates
    .map(c => ({ ...c, d: distM(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, INVADER_REGIONS);
}

// Construit les régions : N Invaders proches + 1 périmètre
function buildRegions(lat, lng, nearest, radius) {
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
  if (!ENGINE_AVAILABLE) { __DEV__ && console.log('[Stroll] geofencing indisponible (dev build requis)'); return false; }
  const settings = await readJSON(KEY_SETTINGS, null);
  if (!settings?.enabled) return false;
  const candidates = await readJSON(KEY_CANDIDATES, []);
  if (!candidates.length) { __DEV__ && console.log('[Stroll] aucun candidat'); return false; }

  let loc = null;
  try { loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); }
  catch { try { loc = await Location.getLastKnownPositionAsync(); } catch {} }
  if (!loc) { __DEV__ && console.log('[Stroll] pas de position'); return false; }

  const { latitude, longitude } = loc.coords;
  const radius = settings.radius ?? 50;
  const nearest = nearestCandidates(latitude, longitude, candidates);
  const regions = buildRegions(latitude, longitude, nearest, radius);
  try {
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    __DEV__ && console.log(`[Stroll] ${regions.length} geofences posées (rayon ${radius} m) @ ${latitude.toFixed(4)},${longitude.toFixed(4)} ; plus proche : ${nearest[0] ? Math.round(nearest[0].d) + ' m' : '—'}`);
  } catch (e) {
    __DEV__ && console.log('[Stroll] startGeofencing erreur :', e?.message);
    return false;
  }

  // Piège geofencing : si on est DÉJÀ dans le rayon d'un Invader au moment où l'on
  // (re)pose les régions, iOS n'émet pas d'« entrée ». On déclenche nous-mêmes.
  if (nearest[0] && nearest[0].d <= Math.max(radius, 20)) {
    __DEV__ && console.log('[Stroll] déjà à proximité au démarrage → alerte immédiate', nearest[0].id);
    await handleEnter(nearest[0].id);
  }
  return true;
}

/** Persiste les candidats (Invaders à cibler) pour la tâche de fond. */
export async function persistCandidates(candidates) {
  await writeJSON(KEY_CANDIDATES, Array.isArray(candidates) ? candidates : []);
}

/**
 * Envoie l'alerte de proximité pour un Invader.
 *
 * Extrait de handleEnter pour que la SIMULATION emprunte exactement le même
 * chemin : un test qui reconstruirait la notification de son côté validerait sa
 * propre copie, pas ce que reçoit l'utilisateur. C'est le comportement au tap
 * qui compte ici, et il dépend entièrement du contenu de `data`.
 */
async function notifyProximity(invId, reglages) {
  // Réglages relus si l'appelant ne les fournit pas : la simulation depuis
  // l'écran n'a pas de raison de les connaître.
  const r = reglages ?? await readJSON(KEY_SETTINGS, {});
  const avecSon = r.son !== false;
  const canal = await canalAndroid(avecSon, r.vibration !== false);
  const tpl = await readJSON(KEY_NOTIF, { title: 'Invader à proximité 👾', bodies: ['{id} est tout près !'] });
  // Mode explorateur : l'alerte devient l'atout du mode plutôt que sa faille.
  // Elle dit qu'il y a quelque chose dans les parages, elle ne nomme pas
  // l'Invader, et le tap ne recentre plus la carte sur lui. On garde le
  // frisson, on retire l'indication. Sans `invId` dans les données, le tap
  // n'ouvre aucune fiche (voir components/StrollEngine).
  //
  // Lu ICI et à chaque alerte : la tâche de fond tourne dans un processus
  // réveillé par le système, qui n'a jamais vu le contexte React.
  let explorer = false;
  try { explorer = (await AsyncStorage.getItem(KEY_EXPLORER)) === '1'; } catch {}

  // Mode explorateur : une PAIRE titre + corps, tirée ensemble. Repli sur
  // l'ancien format (`blindTitle` + `blindBodies`) puis sur une chaîne en dur,
  // pour la fenêtre où la tâche de fond alerte avant que le composant React
  // n'ait réécrit le gabarit après une mise à jour.
  let titre = tpl.title;
  let chosen;
  if (explorer) {
    const paires = Array.isArray(tpl.blindAlerts) && tpl.blindAlerts.length ? tpl.blindAlerts : null;
    if (paires) {
      const p = paires[Math.floor(Math.random() * paires.length)];
      titre = p.title;
      chosen = p.body;
    } else {
      const anciens = Array.isArray(tpl.blindBodies) && tpl.blindBodies.length
        ? tpl.blindBodies : ['Un Invader est tout près.'];
      titre = tpl.blindTitle || tpl.title;
      chosen = anciens[Math.floor(Math.random() * anciens.length)];
    }
  } else {
    // Choix aléatoire d'une variante (compat : ancien champ `body` unique).
    const list = Array.isArray(tpl.bodies) && tpl.bodies.length ? tpl.bodies : [tpl.body || '{id}'];
    chosen = list[Math.floor(Math.random() * list.length)];
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: titre,
        body: explorer ? chosen : chosen.replace('{id}', invId),
        // `false` coupe le son sans supprimer la notification : c'est la
        // distinction que réclamait Marco — voir passer l'alerte sans qu'elle
        // sonne. Sur Android c'est le canal qui tranche, d'où les deux.
        sound: avecSon ? SON_ALERTE : false,
        // PAS de `interruptionLevel: 'timeSensitive'`, et c'est un choix.
        //
        // Je l'avais ajouté en le présentant comme gratuit et comme « le droit de
        // percer les modes Concentration ». Marco a retourné l'argument, et il
        // avait raison : quelqu'un qui active Concentration DIT qu'il ne veut pas
        // être dérangé. Traiter ce réglage comme un obstacle à contourner est
        // exactement ce que font les applications qu'on désinstalle. Et s'il veut
        // ses alertes malgré tout, iOS lui offre déjà la réponse — autoriser
        // InvaderQuest dans ce mode précis, sans aucun entitlement.
        //
        // Il restait un bénéfice réel mais mince : échapper au résumé programmé,
        // qui retiendrait une alerte de proximité jusqu'au soir — inutile et
        // déroutante. Cette fonction n'est pas active par défaut ; le bénéfice
        // touche une minorité, l'objection touche tout le monde.
        //
        // Ça coûtait en plus une capacité à activer chez Apple et un profil de
        // provisionnement à régénérer : le premier build 1.4.0 a échoué là-dessus.
        data: explorer ? { type: 'stroll' } : { type: 'stroll', invId },
      },
      // Android : le canal porte le son et la vibration, on le désigne ici.
      // iOS : pas de canaux, `null` signifie « tout de suite ».
      trigger: canal ? { channelId: canal } : null,
    });
  } catch (e) { __DEV__ && console.log('[Stroll] notif erreur :', e?.message); }
}

/**
 * Simule une alerte, pour vérifier sur un vrai téléphone ce que donne le tap.
 *
 * Prend un Invader parmi les candidats déjà persistés, donc un vrai, non
 * flashé, de la ville courante, sans quoi le mode normal n'aurait rien à
 * ouvrir. Court-circuite les anti-répétitions : c'est un test, il doit pouvoir
 * être relancé d'affilée.
 *
 * @returns l'identifiant utilisé, ou null si aucun candidat n'est disponible
 */
export async function simulateProximityAlert(position) {
  const candidates = await readJSON(KEY_CANDIDATES, []);
  if (!candidates.length) return null;
  // LE PLUS PROCHE, pas un au hasard. Le tirage portait sur toute la ville, soit
  // environ 1 500 Invaders à Paris : l'alerte annonçait « tout près » un Invader
  // qui était à des kilomètres, et le test ne testait donc pas ce qu'il prétend.
  let pick = candidates[0];
  if (position) {
    let meilleure = Infinity;
    for (const c of candidates) {
      const dy = (c.lat - position.latitude) * 110540;
      const dx = (c.lng - position.longitude) * Math.cos((position.latitude * Math.PI) / 180) * 111320;
      const d = dx * dx + dy * dy;
      if (d < meilleure) { meilleure = d; pick = c; }
    }
  }
  await notifyProximity(pick.id);
  return pick.id;
}

/** Persiste les textes localisés de notification : titre + variantes de corps
 *  ({id} = placeholder remplacé par l'id de l'Invader à l'alerte), plus les
 *  paires titre/corps du mode explorateur, qui ne nomment aucun Invader. */
export async function persistNotifStrings(title, bodies, blindAlerts) {
  const list = (Array.isArray(bodies) ? bodies : [bodies]).filter(Boolean);
  const paires = (Array.isArray(blindAlerts) ? blindAlerts : [])
    .filter((p) => p && p.title && p.body);
  await writeJSON(KEY_NOTIF, { title, bodies: list, blindAlerts: paires });
}

export async function startStroll() { return refreshGeofences(); }

export async function stopStroll() {
  if (!ENGINE_AVAILABLE) return;
  try {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (started) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
      __DEV__ && console.log('[Stroll] geofencing arrêté');
    }
  } catch (e) { __DEV__ && console.log('[Stroll] stop erreur :', e?.message); }
}

// ─── Tâche de fond (geofencing) ────────────────────────────────────────────────

if (TaskManager) {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    if (error) { __DEV__ && console.log('[Stroll] task error :', error.message); return; }
    const { eventType, region } = data || {};
    if (!region) return;
    try {
      if (eventType === Location.GeofencingEventType.Exit && region.identifier === PERIMETER_ID) {
        __DEV__ && console.log('[Stroll] sortie périmètre → recalcul');
        await refreshGeofences();
        return;
      }
      if (eventType === Location.GeofencingEventType.Enter && region.identifier.startsWith(INV_PREFIX)) {
        await handleEnter(region.identifier.slice(INV_PREFIX.length));
      }
    } catch (e) { __DEV__ && console.log('[Stroll] handle error :', e?.message); }
  });
}

async function handleEnter(invId) {
  // ── Verrou synchrone : bloque tout appel concurrent pour le même Invader ──
  // (avant le moindre await → un seul handleEnter passe à la fois)
  if (inFlight.has(invId)) { __DEV__ && console.log('[Stroll] skip (déjà en cours)', invId); return; }
  const now = Date.now();
  if (memLastGlobal && now - memLastGlobal < GLOBAL_GAP) { __DEV__ && console.log('[Stroll] skip (gap global)'); return; }
  if (memAlerts.has(invId) && now - memAlerts.get(invId) < PER_ID_COOLDOWN) { __DEV__ && console.log('[Stroll] skip (déjà alerté)', invId); return; }
  inFlight.add(invId);

  try {
    const settings = await readJSON(KEY_SETTINGS, null);
    if (!settings?.enabled) return;

    // Gap global PERSISTANT : au relancement de l'app, iOS ré-émet « Enter » pour
    // toutes les zones où l'on se trouve déjà → sans relire le disque, memLastGlobal
    // vaut 0 et toute la rafale passait d'un coup.
    if (!memLastGlobal) {
      const last = await readJSON(KEY_LAST_ALERT, 0);
      if (last && now - last < GLOBAL_GAP) { memLastGlobal = last; __DEV__ && console.log('[Stroll] skip (gap global, disque)'); return; }
    }

    // Filtre de vitesse : pas d'alerte si l'utilisateur va trop vite (véhicule)
    try {
      const loc = await Location.getLastKnownPositionAsync();
      const sp = loc?.coords?.speed;
      if (typeof sp === 'number' && sp > MAX_SPEED_MPS) { __DEV__ && console.log('[Stroll] skip (vitesse)', sp.toFixed(1)); return; }
    } catch {}

    // Cooldown persistant : lecture + réservation + écriture SÉRIALISÉES (section
    // critique) → plus d'écritures concurrentes qui se perdent mutuellement.
    const allowed = await withAlertsLock(async () => {
      const alerts = await readJSON(KEY_ALERTS, {});
      if (alerts[invId] && now - alerts[invId] < PER_ID_COOLDOWN) return false;
      alerts[invId] = now;
      // Ménage : purge les entrées de plus de 7 jours (fichier borné)
      for (const k of Object.keys(alerts)) {
        if (now - alerts[k] > 7 * 86400000) delete alerts[k];
      }
      await writeJSON(KEY_ALERTS, alerts);
      await writeJSON(KEY_LAST_ALERT, now);
      return true;
    });
    if (!allowed) { __DEV__ && console.log('[Stroll] skip (déjà alerté, disque)', invId); return; }

    // Réserve aussi les gardes mémoire AVANT de notifier
    memAlerts.set(invId, now);
    memLastGlobal = now;

    // Déclenche selon les réglages
    if (settings.vibration) {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
    if (settings.notification) await notifyProximity(invId, settings);

    __DEV__ && console.log('[Stroll] ALERTE', invId);
  } finally {
    inFlight.delete(invId);
  }
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
