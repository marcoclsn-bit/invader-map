// services/badgeStore.js — persistance locale de l'état des badges débloqués.
// Format : { [badgeId]: unlockedAtISO }
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BADGES = '@invader_badges';

export async function loadUnlocked() {
  try {
    const raw = await AsyncStorage.getItem(KEY_BADGES);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

export async function saveUnlocked(unlocked) {
  try {
    await AsyncStorage.setItem(KEY_BADGES, JSON.stringify(unlocked));
  } catch (_) {}
}
