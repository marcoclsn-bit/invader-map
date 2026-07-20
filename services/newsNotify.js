// services/newsNotify.js
//
// Notifications d'actualité, 100 % LOCALES (aucun backend) :
//   - une tâche de fond (expo-background-task) se déclenche quand iOS/Android le
//     permet (~1×/jour, l'OS décide) ;
//   - elle télécharge news.json, compte les nouveautés (filtrées par villes suivies)
//     depuis la dernière notification, et déclenche une notification locale.
//
// Respecte : le réglage utilisateur (@invader_news_notify), les villes suivies
// (@invader_news_cities), un plafond de 1 notification/jour.
//
// NB : la tâche s'exécute en contexte « headless » → on lit AsyncStorage
// directement (pas d'état React) et on garde tout défensif (jamais d'exception).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import i18n from '../i18n';

const NEWS_TASK = 'invader-news-check';
const NEWS_URL = 'https://raw.githubusercontent.com/marcoclsn-bit/invader-map/main/data/news.json';

const KEY_ENABLED   = '@invader_news_notify';       // '1' | '0' (réglage utilisateur)
const KEY_CITIES    = '@invader_news_cities';        // JSON array de codes ville suivis
const KEY_UPTO      = '@invader_news_notified_upto'; // date (YYYY-MM-DD) déjà notifiée
const KEY_LAST_DAY  = '@invader_news_notify_day';    // YYYY-MM-DD de la dernière notif (plafond 1/j)

const todayKey = () => new Date().toISOString().slice(0, 10);

// Cœur : télécharge les news, calcule les nouveautés, notifie si besoin.
// Exporté pour pouvoir le déclencher manuellement (test / au démarrage).
// opts.force (bouton de test) : ignore le plafond 1/jour et notifie même sans
// nouveauté (message de test), sans consommer le suivi des dates.
export async function checkNewsAndNotify(opts = {}) {
  const force = !!opts.force;
  try {
    if (!force && (await AsyncStorage.getItem(KEY_ENABLED)) === '0') return; // désactivé
    // Plafond : une seule notification par jour (ignoré en test).
    if (!force && (await AsyncStorage.getItem(KEY_LAST_DAY)) === todayKey()) return;

    const res = await fetch(NEWS_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) { if (force) await notifyTest(); return; }
    const json = await res.json();
    const events = Array.isArray(json?.events) ? json.events : [];

    // Villes suivies (null/absent = toutes).
    let cities = null;
    try {
      const raw = await AsyncStorage.getItem(KEY_CITIES);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) cities = new Set(arr); }
    } catch {}

    const upTo = (await AsyncStorage.getItem(KEY_UPTO)) || '';
    const latestDate = events.reduce((m, e) => (e?.date && e.date > m ? e.date : m), '');

    // Première fois (pas de ligne de base) : on la POSE, sans notifier le backlog
    // existant — sinon un nouvel utilisateur recevrait « 79 nouveautés » le jour 1.
    if (!upTo) {
      if (latestDate) await AsyncStorage.setItem(KEY_UPTO, latestDate);
      if (force) await notifyTest();
      return;
    }

    // Nouveautés = événements plus récents que la dernière date notifiée, dans les villes suivies.
    const fresh = events.filter((e) =>
      e?.date && e.date > upTo && (!cities || cities.has(e.city))
    );

    if (fresh.length === 0) {
      if (force) await notifyTest(); // en test, on montre quand même quelque chose
      return;
    }

    const count = fresh.length;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('news.notify.title'),
        body: i18n.t(count === 1 ? 'news.notify.body_one' : 'news.notify.body_other', { count }),
        sound: true, data: { type: 'news' },
      },
      trigger: null,
    });

    // En test, on ne consomme pas le suivi (pour pouvoir retester).
    if (!force) await AsyncStorage.multiSet([[KEY_UPTO, latestDate], [KEY_LAST_DAY, todayKey()]]);
  } catch (e) {
    if (__DEV__) console.log('[newsNotify] erreur :', e?.message);
    if (force) { try { await notifyTest(); } catch {} }
  }
}

// Notification de test (aucune nouveauté / hors-ligne) — sert au bouton caché.
async function notifyTest() {
  await Notifications.scheduleNotificationAsync({
    content: { title: i18n.t('news.notify.title'), body: i18n.t('news.notify.test'), sound: true, data: { type: 'news' } },
    trigger: null,
  });
}

// ─── Tâche de fond ──────────────────────────────────────────────────────────────
if (TaskManager) {
  TaskManager.defineTask(NEWS_TASK, async () => {
    await checkNewsAndNotify();
    return BackgroundTask.BackgroundTaskResult?.Success ?? undefined;
  });
}

// Planifie la tâche de fond (sans rien demander à l'utilisateur).
async function registerNewsTask() {
  try {
    await BackgroundTask.registerTaskAsync(NEWS_TASK, { minimumInterval: 60 * 12 }); // minutes (~12 h)
  } catch (e) { if (__DEV__) console.log('[newsNotify] register :', e?.message); }
}

/** Activation EXPLICITE par l'utilisateur : demande la permission notif + planifie. */
export async function enableNewsNotify() {
  await AsyncStorage.setItem(KEY_ENABLED, '1');
  try { await Notifications.requestPermissionsAsync(); } catch {}
  await registerNewsTask();
}

/** Désactivation : retire la tâche + mémorise le choix. */
export async function disableNewsNotify() {
  await AsyncStorage.setItem(KEY_ENABLED, '0');
  try { await BackgroundTask.unregisterTaskAsync(NEWS_TASK); } catch {}
}

/** Au démarrage : (ré)planifie si activé, SANS prompt de permission. */
export async function syncNewsNotify(enabled) {
  if (enabled) await registerNewsTask();
  else { try { await BackgroundTask.unregisterTaskAsync(NEWS_TASK); } catch {} }
}
