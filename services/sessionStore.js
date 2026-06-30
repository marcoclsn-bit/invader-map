// services/sessionStore.js — persistance locale des sessions de chasse.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_SESSIONS = '@invader_sessions';
const CAP = 100; // on ne garde que les N dernières

export async function loadSessions() {
  try {
    const raw = await AsyncStorage.getItem(KEY_SESSIONS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export async function saveSessions(sessions) {
  try {
    await AsyncStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions.slice(0, CAP)));
  } catch (_) {}
}

/** Ajoute une session en tête, plafonne, persiste. Renvoie la liste à jour. */
export async function addSession(session) {
  const prev = await loadSessions();
  const next = [session, ...prev].slice(0, CAP);
  await saveSessions(next);
  return next;
}
