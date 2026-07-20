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
import { INVADER_DISTRICT } from '../utils/arrondissement';
import { CITIES } from '../cities/registry';
import { countryCodeOf } from '../cities/countries';

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

// ── Anti-catalogage ─────────────────────────────────────────────────────────────
// Sur le terrain on MARCHE entre deux mosaïques (minutes d'écart) ; cocher sa
// collection depuis la Liste produit des flashs espacés de quelques secondes.
// Pour les trophées de vitesse/combo, les flashs à moins de 2 min d'écart ne
// comptent que pour 1 : le catalogage ne débloque pas les exploits de terrain.
const MIN_COMBO_GAP_MS = 2 * 60 * 1000;

function collapseBursts(tsSorted) {
  const out = [];
  for (const t of tsSorted) {
    if (!out.length || t - out[out.length - 1] >= MIN_COMBO_GAP_MS) out.push(t);
  }
  return out;
}

// Nombre max de flashs datés dans une fenêtre glissante de `minutes`.
// Permet aux combos de se déclencher depuis N'IMPORTE QUEL flash (Carte incluse),
// sans exiger une « session » formelle (Chasse/Balade). Rafales fusionnées.
function maxFlashesInWindow(flashHistory, minutes) {
  const ts = collapseBursts(datedFlashes(flashHistory).map((f) => f.ts).sort((a, b) => a - b));
  const win = minutes * 60 * 1000;
  let best = 0, j = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > win) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

// Flashs d'une session comptés avec la même règle d'espacement (sinon on pourrait
// lancer une Chasse puis tout cocher depuis la Liste). Sans flashHistory fourni
// (tests / robustesse), on retombe sur le compte brut.
function sessionComboCount(ctx) {
  if (!ctx.session) return 0;
  if (ctx.flashHistory == null) return sessionCount(ctx);
  const dates = new Map(
    ctx.flashHistory
      .filter((f) => f.flashedAt != null)
      .map((f) => [f.id, new Date(f.flashedAt).getTime()])
  );
  const ts = ctx.session.invaderIds
    .map((id) => dates.get(id))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  return collapseBursts(ts).length;
}

// Combo atteint via une session OU via une rafale de flashs dans la fenêtre.
const combo = (ctx, n, minutes) => sessionComboCount(ctx) >= n || maxFlashesInWindow(ctx.flashHistory, minutes) >= n;

// ─── Helpers du ctx étendu (invaders ville active, registre villes, actus…) ─────
// Tous défensifs : un champ absent → false, jamais d'exception.

const flashedSet = (ctx) => new Set((ctx.flashHistory ?? []).map((f) => f.id));

// Points cumulés : somme du registre par ville (exact pour toute ville visitée).
const totalPoints = (ctx) =>
  Object.values(ctx.cityProgress ?? {}).reduce((s, e) => s + (e?.flashedPts ?? 0), 0);

// Villes terminées : registre (exact) + approximation index pour les villes à flashs
// sans entrée de registre (même règle que le Palmarès pour les villes non actives).
function completedCityCodes(ctx) {
  const out = new Set();
  const progress = ctx.cityProgress ?? {};
  for (const [code, e] of Object.entries(progress)) {
    if (e?.completed) out.add(code);
  }
  const byCity = new Map();
  for (const f of ctx.flashHistory ?? []) {
    const c = extractCityCode(f.id);
    byCity.set(c, (byCity.get(c) ?? 0) + 1);
  }
  for (const [code, flashedHere] of byCity) {
    if (out.has(code) || progress[code]) continue; // registre = source de vérité
    const info = (ctx.cityIndex ?? []).find((c) => c.code === code);
    if (!info) continue;
    const flashables = Math.max(0, (info.count ?? 0) - (info.destroyed ?? 0));
    if (flashables > 0 && flashedHere >= flashables) out.add(code);
  }
  return out;
}

// Taille (posés) d'une ville terminée — registre puis index.
function completedCitySizes(ctx) {
  const sizes = [];
  const progress = ctx.cityProgress ?? {};
  for (const code of completedCityCodes(ctx)) {
    const posed = progress[code]?.posed
      ?? (ctx.cityIndex ?? []).find((c) => c.code === code)?.count ?? 0;
    sizes.push({ code, posed });
  }
  return sizes;
}

const distinctCountries = (ctx) => {
  const codes = new Set();
  for (const f of ctx.flashHistory ?? []) {
    const cc = countryCodeOf(CITIES[extractCityCode(f.id)]);
    if (cc) codes.add(cc);
  }
  return codes.size;
};

// Semaines consécutives (lundi) avec ≥ 1 flash daté.
function maxConsecutiveWeeks(flashHistory) {
  const weeks = Array.from(new Set(datedFlashes(flashHistory).map((f) => weekStartMs(f.ts)))).sort((a, b) => a - b);
  let run = weeks.length ? 1 : 0, max = run;
  const WEEK = 7 * 86400000;
  for (let i = 1; i < weeks.length; i++) {
    run = weeks[i] - weeks[i - 1] === WEEK ? run + 1 : 1;
    if (run > max) max = run;
  }
  return max;
}

// Saisons distinctes couvertes (hémisphère nord).
function distinctSeasons(flashHistory) {
  const seasons = new Set();
  for (const f of datedFlashes(flashHistory)) {
    const m = new Date(f.ts).getMonth() + 1;
    seasons.add(m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn');
  }
  return seasons.size;
}

const distinctMonthsOfYear = (flashHistory) =>
  new Set(datedFlashes(flashHistory).map((f) => new Date(f.ts).getMonth())).size;

const anyFlashMatching = (flashHistory, fn) =>
  datedFlashes(flashHistory).some((f) => { try { return fn(new Date(f.ts)); } catch { return false; } });

// Flashé un Invader de la ville ACTIVE vérifiant un prédicat (statut, points…).
const anyActiveFlashed = (ctx, fn) => {
  const fs = flashedSet(ctx);
  return (ctx.invaders ?? []).some((inv) => fs.has(inv.id) && fn(inv));
};

const countActiveFlashed = (ctx, fn) => {
  const fs = flashedSet(ctx);
  let n = 0;
  for (const inv of ctx.invaders ?? []) if (fs.has(inv.id) && fn(inv)) n++;
  return n;
};

// Un arrondissement parisien entièrement terminé (formule « juste » du Palmarès).
function anyParisDistrictComplete(ctx) {
  if (ctx.currentCityCode !== 'PA' || !(ctx.invaders ?? []).length) return false;
  const fs = flashedSet(ctx);
  const byAr = new Map();
  for (const inv of ctx.invaders) {
    const ar = INVADER_DISTRICT.get(inv.id);
    if (!ar) continue;
    const z = byAr.get(ar) ?? { flashed: 0, denom: 0 };
    const isDestroyed = inv.status === 'destroyed';
    const isFlashed = fs.has(inv.id);
    if (!isDestroyed || isFlashed) z.denom++;
    if (isFlashed) z.flashed++;
    byAr.set(ar, z);
  }
  for (const z of byAr.values()) if (z.denom > 0 && z.flashed >= z.denom) return true;
  return false;
}

// Flash daté dans les N jours suivant l'apparition de l'Invader dans les Actus.
function flashedFreshFromNews(ctx, days) {
  const events = ctx.news?.events ?? [];
  if (!events.length) return false;
  const addedAt = new Map(); // id → ts d'ajout le plus ancien
  for (const e of events) {
    if (e?.type !== 'added' || !e.id || !e.date) continue;
    const ts = new Date(e.date).getTime();
    if (!Number.isFinite(ts)) continue;
    if (!addedAt.has(e.id) || ts < addedAt.get(e.id)) addedAt.set(e.id, ts);
  }
  const win = days * 86400000;
  return datedFlashes(ctx.flashHistory).some((f) => {
    const t0 = addedAt.get(f.id);
    return t0 != null && f.ts >= t0 && f.ts - t0 <= win;
  });
}

const totalSessionKm = (ctx) =>
  (ctx.sessions ?? []).reduce((s, x) => s + (x?.distanceKm ?? 0), 0);

// ─── Définitions ────────────────────────────────────────────────────────────────

export const BADGES = [
  // ── Collection (totaux — l'import d'historique compte : c'est ta vraie collection)
  { id: 'first1', category: 'collection', iconName: 'sparkles',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 1 },
  { id: 'squad25', category: 'collection', iconName: 'people',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 25 },
  { id: 'centurion', category: 'collection', iconName: 'ribbon',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 100 },
  { id: 'battalion250', category: 'collection', iconName: 'shield',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 250 },
  { id: 'army500', category: 'collection', iconName: 'rocket',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 500 },
  { id: 'legend1000', category: 'collection', iconName: 'planet',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 1000 },
  { id: 'spacemaster2000', category: 'collection', iconName: 'infinite',
    predicate: (ctx) => (ctx.flashHistory?.length ?? 0) >= 2000 },

  // ── Points (cumulés via le registre par ville ; unitaires via la ville active)
  { id: 'loot500', category: 'points', iconName: 'cash',
    predicate: (ctx) => totalPoints(ctx) >= 500 },
  { id: 'treasurer2500', category: 'points', iconName: 'wallet',
    predicate: (ctx) => totalPoints(ctx) >= 2500 },
  { id: 'vault10000', category: 'points', iconName: 'briefcase',
    predicate: (ctx) => totalPoints(ctx) >= 10000 },
  { id: 'jackpot25000', category: 'points', iconName: 'diamond',
    predicate: (ctx) => totalPoints(ctx) >= 25000 },
  { id: 'bounty100', category: 'points', iconName: 'skull',
    predicate: (ctx) => anyActiveFlashed(ctx, (inv) => (inv.points ?? 0) >= 100) },
  { id: 'sniper10x50', category: 'points', iconName: 'locate',
    predicate: (ctx) => countActiveFlashed(ctx, (inv) => (inv.points ?? 0) >= 50) >= 10 },

  // ── Sessions & combos — via une session OU une rafale de flashs datés
  // (fonctionne donc aussi en flashant depuis la Carte, sans mode Chasse).
  { id: 'speedrunner', category: 'combo', iconName: 'flash',
    // 5 flashs en ≤ 30 min (session courte OU 5 flashs datés dans 30 min)
    predicate: (ctx) =>
      (!!ctx.session && sessionComboCount(ctx) >= 5 && ctx.session.durationSec > 0 && ctx.session.durationSec <= 1800)
      || maxFlashesInWindow(ctx.flashHistory, 30) >= 5 },
  { id: 'eclair', category: 'combo', iconName: 'thunderstorm',
    // 10 flashs en ≤ 45 min
    predicate: (ctx) =>
      (!!ctx.session && sessionComboCount(ctx) >= 10 && ctx.session.durationSec > 0 && ctx.session.durationSec <= 2700)
      || maxFlashesInWindow(ctx.flashHistory, 45) >= 10 },
  { id: 'combo10', category: 'combo', iconName: 'albums',
    predicate: (ctx) => combo(ctx, 10, 60) },
  { id: 'combo15', category: 'combo', iconName: 'layers',
    predicate: (ctx) => combo(ctx, 15, 90) },
  { id: 'combo30', category: 'combo', iconName: 'flame',
    predicate: (ctx) => combo(ctx, 30, 180) },
  { id: 'combo50', category: 'combo', iconName: 'nuclear',
    predicate: (ctx) => combo(ctx, 50, 240) },
  { id: 'marathon', category: 'combo', iconName: 'walk',
    predicate: (ctx) => !!ctx.session && (ctx.session.distanceKm ?? 0) >= 10 },
  { id: 'semi21', category: 'combo', iconName: 'fitness',
    predicate: (ctx) => !!ctx.session && (ctx.session.distanceKm ?? 0) >= 21 },
  { id: 'pelerin100', category: 'combo', iconName: 'trail-sign',
    predicate: (ctx) => totalSessionKm(ctx) >= 100 },
  { id: 'habitue10', category: 'combo', iconName: 'checkmark-done',
    predicate: (ctx) => (ctx.sessions?.length ?? 0) >= 10 },

  // ── Exploration
  { id: 'explorer', category: 'exploration', iconName: 'compass',
    predicate: (ctx) => distinctCities(ctx.flashHistory) >= 3 },
  { id: 'globetrotter', category: 'exploration', iconName: 'earth',
    predicate: (ctx) => distinctCities(ctx.flashHistory) >= 5 },
  { id: 'nomade10', category: 'exploration', iconName: 'map',
    predicate: (ctx) => distinctCities(ctx.flashHistory) >= 10 },
  { id: 'conquerant20', category: 'exploration', iconName: 'flag',
    predicate: (ctx) => distinctCities(ctx.flashHistory) >= 20 },
  { id: 'sansfrontieres', category: 'exploration', iconName: 'airplane',
    predicate: (ctx) => distinctCountries(ctx) >= 2 },
  { id: 'international4', category: 'exploration', iconName: 'boat',
    predicate: (ctx) => distinctCountries(ctx) >= 4 },
  { id: 'touristeparis', category: 'exploration', iconName: 'business',
    // ≥ 1 flash dans chacun des 20 arrondissements
    predicate: (ctx) => {
      const ars = new Set();
      for (const f of ctx.flashHistory ?? []) {
        const ar = INVADER_DISTRICT.get(f.id);
        if (ar) ars.add(ar);
      }
      return ars.size >= 20;
    } },
  { id: 'quartiermaitre', category: 'exploration', iconName: 'grid',
    predicate: (ctx) => anyParisDistrictComplete(ctx) },

  // ── Villes terminées (formule « juste » : détruits jamais flashés hors calcul)
  { id: 'conquete1', category: 'cities', iconName: 'trophy',
    predicate: (ctx) => completedCityCodes(ctx).size >= 1 },
  { id: 'triple3', category: 'cities', iconName: 'medal',
    predicate: (ctx) => completedCityCodes(ctx).size >= 3 },
  { id: 'pantheon5', category: 'cities', iconName: 'podium',
    predicate: (ctx) => completedCityCodes(ctx).size >= 5 },
  { id: 'hegemonie10', category: 'cities', iconName: 'key',
    predicate: (ctx) => completedCityCodes(ctx).size >= 10 },
  { id: 'metropole', category: 'cities', iconName: 'apps',
    // Terminer une GRANDE ville (≥ 100 Invaders posés) — LA, Londres, NY, HK, Tokyo…
    predicate: (ctx) => completedCitySizes(ctx).some((c) => c.posed >= 100 && c.code !== 'PA') },
  { id: 'roideparis', category: 'cities', iconName: 'star',
    // Le légendaire : Paris terminée (~1 400 flashables)
    predicate: (ctx) => completedCityCodes(ctx).has('PA') },

  // ── Régularité
  { id: 'weekstreak', category: 'streak', iconName: 'calendar',
    predicate: (ctx) => maxConsecutiveDays(ctx.flashHistory) >= 7 },
  { id: 'month30', category: 'streak', iconName: 'calendar-clear',
    predicate: (ctx) => maxConsecutiveDays(ctx.flashHistory) >= 30 },
  { id: 'sundayritual', category: 'streak', iconName: 'repeat',
    predicate: (ctx) => maxConsecutiveWeekends(ctx.flashHistory) >= 4 },
  { id: 'metronome12', category: 'streak', iconName: 'timer',
    predicate: (ctx) => maxConsecutiveWeeks(ctx.flashHistory) >= 12 },
  { id: 'seasons4', category: 'streak', iconName: 'partly-sunny',
    predicate: (ctx) => distinctSeasons(ctx.flashHistory) >= 4 },
  { id: 'yearfull12', category: 'streak', iconName: 'today',
    predicate: (ctx) => distinctMonthsOfYear(ctx.flashHistory) >= 12 },

  // ── Secrets & timing (masqués « ??? » tant que verrouillés)
  { id: 'nightowl', category: 'secret', iconName: 'moon',
    predicate: (ctx) => anyFlashInHourRange(ctx.flashHistory, 0, 4) },
  { id: 'earlybird', category: 'secret', iconName: 'sunny',
    predicate: (ctx) => anyFlashInHourRange(ctx.flashHistory, 5, 7) },
  { id: 'lastmetro', category: 'secret', iconName: 'subway',
    predicate: (ctx) => anyFlashInHourRange(ctx.flashHistory, 23, 24) },
  { id: 'lunchbreak', category: 'secret', iconName: 'restaurant',
    // Un flash en semaine entre 12h et 14h
    predicate: (ctx) => anyFlashMatching(ctx.flashHistory, (d) => {
      const dow = d.getDay();
      return dow >= 1 && dow <= 5 && d.getHours() >= 12 && d.getHours() < 14;
    }) },
  { id: 'newyear', category: 'secret', iconName: 'gift',
    predicate: (ctx) => anyFlashMatching(ctx.flashHistory, (d) => d.getMonth() === 0 && d.getDate() === 1) },
  { id: 'fresh7', category: 'secret', iconName: 'leaf',
    predicate: (ctx) => flashedFreshFromNews(ctx, 7) },
  { id: 'savior', category: 'secret', iconName: 'bandage',
    predicate: (ctx) => anyActiveFlashed(ctx, (inv) => inv.status === 'damaged') },
  { id: 'extreme', category: 'secret', iconName: 'hourglass',
    // Flashé un Invader aujourd'hui détruit : tu l'as eu avant sa disparition
    predicate: (ctx) => anyActiveFlashed(ctx, (inv) => inv.status === 'destroyed') },
];

export const BADGE_CATEGORIES = ['collection', 'points', 'combo', 'exploration', 'cities', 'streak', 'secret'];

// Exposés pour l'UI (grille des villes terminées dans la galerie).
export { completedCityCodes };

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
