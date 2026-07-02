/**
 * data/badges.js — Définitions de badges (objets JS simples) + évaluation.
 *
 * Chaque badge : { id, titleKey, descKey, iconName, category, predicate }
 *   category : 'combo' | 'exploration' | 'streak' | 'secret'
 *   predicate(ctx) → boolean         (fonction PURE, jamais d'exception fatale)
 *   ctx = { session, sessions, flashHistory }
 *     session       : la session qui vient de finir (ou null pour un check d'action)
 *     sessions      : toutes les sessions (incluant la nouvelle)
 *     flashHistory  : [{ id, flashedAt }] (du AppContext)
 *
 * Les libellés sont des clés i18n (badges.<id>.title / .desc).
 */

import { extractCityCode } from '../utils/session';

// ─── Helpers d'analyse (purs) ───────────────────────────────────────────────────

function datedFlashes(flashHistory) {
  return (flashHistory ?? [])
    .filter((f) => f.flashedAt != null)
    .map((f) => ({ id: f.id, ts: new Date(f.flashedAt).getTime() }))
    .filter((f) => Number.isFinite(f.ts));
}

function distinctCities(flashHistory) {
  return new Set((flashHistory ?? []).map((f) => extractCityCode(f.id))).size;
}

function anyFlashInHourRange(flashHistory, startH, endH) {
  // vrai si un flash daté tombe dans [startH, endH) en heure locale
  return datedFlashes(flashHistory).some((f) => {
    const h = new Date(f.ts).getHours();
    return h >= startH && h < endH;
  });
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function maxConsecutiveDays(flashHistory) {
  const days = Array.from(new Set(datedFlashes(flashHistory).map((f) => dayKey(f.ts)))).sort();
  let run = days.length ? 1 : 0;
  let max = run;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86400000);
    run = diff === 1 ? run + 1 : 1;
    if (run > max) max = run;
  }
  return max;
}

// Lundi = 0 ; le dimanche appartient à la semaine du lundi précédent
function weekStartMs(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

function maxConsecutiveWeekends(flashHistory) {
  // Semaines (clé = lundi) ayant au moins un flash le samedi OU dimanche
  const weeks = new Set();
  for (const f of datedFlashes(flashHistory)) {
    const dow = new Date(f.ts).getDay(); // 0 = dim, 6 = sam
    if (dow === 0 || dow === 6) weeks.add(weekStartMs(f.ts));
  }
  const sorted = Array.from(weeks).sort((a, b) => a - b);
  let run = sorted.length ? 1 : 0;
  let max = run;
  const WEEK = 7 * 86400000;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] - sorted[i - 1] === WEEK ? run + 1 : 1;
    if (run > max) max = run;
  }
  return max;
}

const sessionCount = (ctx) => (ctx.session ? ctx.session.invaderIds.length : 0);

// Nombre max de flashs datés dans une fenêtre glissante de `minutes`.
// Permet aux combos de se déclencher depuis N'IMPORTE QUEL flash (Carte incluse),
// sans exiger une « session » formelle (Chasse/Balade).
function maxFlashesInWindow(flashHistory, minutes) {
  const ts = datedFlashes(flashHistory).map((f) => f.ts).sort((a, b) => a - b);
  const win = minutes * 60 * 1000;
  let best = 0, j = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > win) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}
// Combo atteint via une session OU via une rafale de flashs dans la fenêtre.
const combo = (ctx, n, minutes) => sessionCount(ctx) >= n || maxFlashesInWindow(ctx.flashHistory, minutes) >= n;

// ─── Définitions ────────────────────────────────────────────────────────────────

export const BADGES = [
  // Combo — via une session OU une rafale de flashs dans une fenêtre glissante
  // (fonctionne donc aussi en flashant depuis la Carte, sans mode Chasse).
  { id: 'speedrunner', category: 'combo', iconName: 'flash',
    // 5 flashs en ≤ 30 min (session courte OU 5 flashs datés dans 30 min)
    predicate: (ctx) =>
      (!!ctx.session && sessionCount(ctx) >= 5 && ctx.session.durationSec > 0 && ctx.session.durationSec <= 1800)
      || maxFlashesInWindow(ctx.flashHistory, 30) >= 5 },
  { id: 'combo10', category: 'combo', iconName: 'albums',
    predicate: (ctx) => combo(ctx, 10, 60) },
  { id: 'combo15', category: 'combo', iconName: 'layers',
    predicate: (ctx) => combo(ctx, 15, 90) },
  { id: 'combo30', category: 'combo', iconName: 'flame',
    predicate: (ctx) => combo(ctx, 30, 180) },

  // Exploration
  { id: 'explorer', category: 'exploration', iconName: 'compass',
    predicate: (ctx) => distinctCities(ctx.flashHistory) >= 3 },
  { id: 'globetrotter', category: 'exploration', iconName: 'earth',
    predicate: (ctx) => distinctCities(ctx.flashHistory) >= 5 },
  { id: 'marathon', category: 'exploration', iconName: 'walk',
    predicate: (ctx) => !!ctx.session && (ctx.session.distanceKm ?? 0) >= 10 },

  // Streak / régularité
  { id: 'weekstreak', category: 'streak', iconName: 'calendar',
    predicate: (ctx) => maxConsecutiveDays(ctx.flashHistory) >= 7 },
  { id: 'sundayritual', category: 'streak', iconName: 'repeat',
    predicate: (ctx) => maxConsecutiveWeekends(ctx.flashHistory) >= 4 },

  // Secret / horaires / paliers
  { id: 'nightowl', category: 'secret', iconName: 'moon',
    predicate: (ctx) => anyFlashInHourRange(ctx.flashHistory, 0, 4) },
  { id: 'earlybird', category: 'secret', iconName: 'sunny',
    predicate: (ctx) => anyFlashInHourRange(ctx.flashHistory, 5, 7) },
  { id: 'centurion', category: 'secret', iconName: 'ribbon',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 100 },
];

export const BADGE_CATEGORIES = ['combo', 'exploration', 'streak', 'secret'];

/**
 * Renvoie les ids des badges nouvellement débloqués.
 * @param ctx        { session, sessions, flashHistory }
 * @param unlocked   { [id]: unlockedAtISO }
 */
export function evaluateBadges(ctx, unlocked = {}) {
  const out = [];
  for (const b of BADGES) {
    if (unlocked[b.id]) continue;
    let ok = false;
    try { ok = !!b.predicate(ctx); } catch (_) { ok = false; }
    if (ok) out.push(b.id);
  }
  return out;
}

export function getBadge(id) {
  return BADGES.find((b) => b.id === id) ?? null;
}
