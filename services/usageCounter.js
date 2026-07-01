/**
 * services/usageCounter.js — Compteur d'usage hebdomadaire par fonctionnalité.
 *
 * ⚠️ BRIQUE PRÊTE À L'EMPLOI, NON BRANCHÉE. Rien ne l'appelle aujourd'hui.
 *    Aucune incidence sur le comportement actuel.
 *
 * Semaine calée au LUNDI (le plus simple à raisonner : la clé de semaine est la
 * date du lundi, ex. "2026-06-29"). Quand la clé de semaine change, le compteur
 * repart de 0 automatiquement à la lecture/incrément suivant.
 *
 * Stockage AsyncStorage sous '@invader_usage' :
 *   { [feature]: { weekKey: 'YYYY-MM-DD', count: number } }
 *
 * ── Comment on l'activera en v2 ──────────────────────────────────────────────
 *   1. Dans services/featureAccess.js → canUseFeature(), lire getUsage(feature)
 *      et comparer à la limite (voir le bloc commenté v2 de ce fichier).
 *   2. APRÈS un usage réussi de la fonctionnalité (ex. itinéraire calculé,
 *      chasse générée, balade activée), appeler incrementUsage(feature).
 *      → à placer juste après le point de succès dans chaque écran.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_USAGE = '@invader_usage';

/** Clé de la semaine en cours = date du lundi (YYYY-MM-DD, heure locale). */
export function currentWeekKey(d = new Date()) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = (r.getDay() + 6) % 7; // lundi = 0
  r.setDate(r.getDate() - dow);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY_USAGE);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

async function writeAll(obj) {
  try { await AsyncStorage.setItem(KEY_USAGE, JSON.stringify(obj)); } catch (_) {}
}

/**
 * Lit le compteur de la semaine en cours pour une fonctionnalité.
 * Si la semaine stockée est révolue, renvoie 0 (remise à zéro implicite).
 * @returns {Promise<{count: number, weekKey: string}>}
 */
export async function getUsage(feature) {
  const week = currentWeekKey();
  const all = await readAll();
  const entry = all[feature];
  if (!entry || entry.weekKey !== week) return { count: 0, weekKey: week };
  return { count: entry.count ?? 0, weekKey: week };
}

/**
 * Incrémente le compteur de la semaine en cours (repart de 0 si nouvelle semaine).
 * @returns {Promise<{count: number, weekKey: string}>} nouvelle valeur
 */
export async function incrementUsage(feature) {
  const week = currentWeekKey();
  const all = await readAll();
  const entry = all[feature];
  const base = entry && entry.weekKey === week ? (entry.count ?? 0) : 0;
  const next = { weekKey: week, count: base + 1 };
  all[feature] = next;
  await writeAll(all);
  return next;
}

/** Réinitialise le compteur d'une fonctionnalité (utile pour tests/support). */
export async function resetUsage(feature) {
  const all = await readAll();
  delete all[feature];
  await writeAll(all);
}
