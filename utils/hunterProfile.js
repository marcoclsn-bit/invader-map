/**
 * utils/hunterProfile.js — Calcul du « Profil de chasseur » (écran Statistiques).
 *
 * Helper PUR : pas de React, pas d'UI, pas d'i18n. Il renvoie des nombres et des
 * énums (ex. side: 'collector' | 'sniper'). C'est l'UI qui traduit/colore.
 * Donc 100 % testable et réutilisable.
 *
 * Entrées :
 *   flashHistory   : [{ id, flashedAt }]  (getFlashHistory() du AppContext)
 *   invaders       : Invaders de la ville COURANTE (points connus seulement ici)
 *   cityIndex      : [{ code, name, count }] (pour les totaux par ville)
 *   currentCityCode: string
 *
 * Sortie : voir computeHunterProfile() — structure documentée en bas du fichier.
 */

import { CITIES } from '../cities/registry';
import { INVADER_DISTRICT, arLabel } from './arrondissement';

// ─── Seuils de maturité des données (états vides / « pas assez de données ») ─────
export const THRESHOLDS = {
  CHARTS: 3,     // points minimum pour tracer la courbe cumulative
  DAYNIGHT: 5,   // flashs datés minimum pour le donut Jour/Nuit
  RARITY: 5,     // flashs (à points connus) minimum pour le slider Rareté
  GEO: 3,        // flashs minimum pour le slider/donut Géographie
  ASSIDUITY: 3,  // jours actifs distincts minimum pour le slider Assiduité
};

// ─── Petits utilitaires de date (auto-contenus) ─────────────────────────────────
function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function startOfWeek(d) {
  const r = startOfDay(d);
  const day = (r.getDay() + 6) % 7; // lundi = 0
  r.setDate(r.getDate() - day);
  return r;
}
function isoDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoWeekKey(d) {
  const t = startOfWeek(d);
  return isoDateKey(t);
}
function extractCityCode(id) { const i = id.lastIndexOf('_'); return i > 0 ? id.substring(0, i) : id; }

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ─── Jour / Nuit ────────────────────────────────────────────────────────────────
// Jour = 06h01 → 21h00 (minute du jour 361..1260) ; Nuit = le reste.
export function isDaytime(ts) {
  const d = new Date(ts);
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 361 && m <= 1260;
}

// ─── Niveau de chasseur (XP) ────────────────────────────────────────────────────
// XP = flashs ×10 + points ÷10 + trophées ×50. Seuil cumulé du niveau n :
// T(n) = 8n² + 30n — étalonné pour qu'un « finisseur de Paris » soit ~Nv 45+
// et que le cap (50) demande une collection Space Master. L'import d'historique
// compte : c'est ta vraie collection.
export const MAX_LEVEL = 50;
const xpForLevel = (n) => 8 * n * n + 30 * n;

export function computeXpLevel({ flashes = 0, points = 0, trophies = 0 } = {}) {
  const xp = Math.round(flashes * 10 + points / 10 + trophies * 50);
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  const cur = xpForLevel(level);
  const next = level >= MAX_LEVEL ? cur : xpForLevel(level + 1);
  const progress = level >= MAX_LEVEL ? 1 : (xp - cur) / Math.max(1, next - cur);
  // Titre honorifique aligné sur le niveau (clé i18n stats.profile.titles.<key>)
  const titleKey =
    level >= 47 ? 'legend' :
    level >= 40 ? 'master' :
    level >= 30 ? 'veteran' :
    level >= 20 ? 'hunter' :
    level >= 10 ? 'scout' : 'novice';
  return {
    xp, level,
    progress: clamp(progress * 100) / 100, // 0..1
    xpRemaining: level >= MAX_LEVEL ? 0 : next - xp,
    isMax: level >= MAX_LEVEL,
    titleKey,
  };
}

// ─── Archétype de chasseur ──────────────────────────────────────────────────────
// Croise les curseurs (Rareté / Géographie / Assiduité) + Jour/Nuit pour nommer
// un style de jeu. Clé i18n : stats.profile.archetypes.<key>.{name,flavor}.
export function computeArchetype(profile) {
  if (!profile || (profile.total ?? 0) < 10) return 'recrue';
  const { rarity: r, geography: g, assiduity: a } = profile.sliders;
  const dn = profile.dayNight;
  const sniper = r.available && r.side === 'high';
  const collector = r.available && r.side === 'low';
  const explorer = g.available && g.side === 'high';
  const local = g.available && g.side === 'low';
  const assidu = a.available && a.side === 'high';

  if (dn.available && dn.nightPct >= 50) return 'noctambule';
  if (sniper && explorer) return 'mercenaire';
  if (sniper && local) return 'tireur';
  if (collector && assidu && local) return 'gardien';
  if (collector && explorer) return 'cartographe';
  if (explorer && assidu) return 'globetrotteur';
  if (assidu) return 'infatigable';
  if (sniper) return 'sniper';
  if (collector) return 'collectionneur';
  if (explorer) return 'aventurier';
  return 'chasseur';
}

// ─── Calcul principal ───────────────────────────────────────────────────────────
export function computeHunterProfile({ flashHistory = [], invaders = [], cityIndex = [], currentCityCode, cityProgress = {} } = {}) {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const weekStart = startOfWeek(now).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const invPts = new Map(invaders.map((inv) => [inv.id, inv.points ?? 0]));

  const total = flashHistory.length;
  const dated = flashHistory
    .filter((f) => f.flashedAt != null)
    .map((f) => ({ id: f.id, ts: new Date(f.flashedAt).getTime() }))
    .filter((f) => Number.isFinite(f.ts))
    .sort((a, b) => a.ts - b.ts);
  const datedCount = dated.length;

  // ── Activité courte ──
  let todayCount = 0, weekCount = 0, monthCount = 0;
  for (const f of dated) {
    if (f.ts >= todayStart) todayCount++;
    if (f.ts >= weekStart) weekCount++;
    if (f.ts >= monthStart) monthCount++;
  }

  // ── Jours actifs + streak/record ──
  const dayKeys = Array.from(new Set(dated.map((f) => isoDateKey(new Date(f.ts))))).sort();
  const activeDays = dayKeys.length;
  let curRun = activeDays > 0 ? 1 : 0;
  let record = curRun;
  for (let i = 1; i < dayKeys.length; i++) {
    const diff = Math.round((new Date(dayKeys[i]) - new Date(dayKeys[i - 1])) / 86400000);
    curRun = diff === 1 ? curRun + 1 : 1;
    if (curRun > record) record = curRun;
  }
  const todayKey = isoDateKey(now);
  const yestKey = isoDateKey(new Date(now.getTime() - 86400000));
  const lastDay = dayKeys[dayKeys.length - 1] ?? '';
  const streak = (lastDay === todayKey || lastDay === yestKey) ? curRun : 0;

  // ── Meilleure journée ──
  const byDay = new Map();
  for (const f of dated) {
    const k = isoDateKey(new Date(f.ts));
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  let bestDayCount = 0;
  for (const c of byDay.values()) if (c > bestDayCount) bestDayCount = c;

  // ── Géographie : villes & arrondissements distincts ──
  const cityCount = new Map();
  const districtCount = new Map();
  for (const f of flashHistory) {
    const code = extractCityCode(f.id);
    cityCount.set(code, (cityCount.get(code) ?? 0) + 1);
    const ar = INVADER_DISTRICT.get(f.id);
    if (ar) districtCount.set(ar, (districtCount.get(ar) ?? 0) + 1);
  }
  const distinctCities = cityCount.size;
  const distinctDistricts = districtCount.size;

  // ── Points moyens (Rareté) — GLOBAL via le registre par ville (toutes tes
  // villes visitées), pas seulement la ville courante.
  let ptsSum = 0, ptsN = 0;
  for (const e of Object.values(cityProgress)) {
    if (e?.flashedPts > 0 && e?.flashedCount > 0) { ptsSum += e.flashedPts; ptsN += e.flashedCount; }
  }
  // Repli : registre vide (jamais alimenté) → points de la ville courante
  if (ptsN === 0) {
    for (const f of flashHistory) {
      const p = invPts.get(f.id);
      if (p != null && p > 0) { ptsSum += p; ptsN++; }
    }
  }
  const avgPoints = ptsN > 0 ? ptsSum / ptsN : 0;
  // Échelle FIXE du jeu : les Invaders valent de 10 à 100 points.
  const minPts = 10, maxPts = 100;

  // ─── SLIDERS ──────────────────────────────────────────────────────────────
  const sideOf = (v) => (v < 40 ? 'low' : v > 60 ? 'high' : 'mid');

  // Rareté : Collecteur (bas) ↔ Sniper (haut)
  const rarityValue = clamp(((avgPoints - minPts) / (maxPts - minPts)) * 100);
  const rarity = {
    available: ptsN >= THRESHOLDS.RARITY,
    value: Math.round(rarityValue),
    avgPoints: Math.round(avgPoints),
    sampleSize: ptsN,
    side: sideOf(rarityValue), // 'low'=collector, 'high'=sniper
  };

  // Géographie : Local (bas) ↔ Explorateur (haut)
  // Score = villes distinctes (plafond 6) ; bonus léger pour les arrondissements.
  const cityScore = clamp((Math.min(distinctCities, 6) / 6) * 100);
  const districtBonus = distinctCities <= 1 ? clamp((Math.min(distinctDistricts, 10) / 10) * 40, 0, 40) : 0;
  const geoValue = clamp(Math.max(cityScore, districtBonus));
  const geography = {
    available: total >= THRESHOLDS.GEO,
    value: Math.round(geoValue),
    distinctCities,
    distinctDistricts,
    side: sideOf(geoValue), // 'low'=local, 'high'=explorer
  };

  // Assiduité : Occasionnel (bas) ↔ Assidu (haut)
  const spanDays = datedCount > 0
    ? Math.floor((dated[datedCount - 1].ts - dated[0].ts) / 86400000) + 1
    : 0;
  const regularity = spanDays > 0 ? activeDays / spanDays : 0; // 0..1
  const recordFactor = Math.min(record / 14, 1);
  const assiduityValue = clamp((0.6 * regularity + 0.4 * recordFactor) * 100);
  const assiduity = {
    available: activeDays >= THRESHOLDS.ASSIDUITY,
    value: Math.round(assiduityValue),
    activeDays,
    record,
    streak,
    regularity: Math.round(regularity * 100),
    side: sideOf(assiduityValue), // 'low'=casual, 'high'=regular
  };

  // ─── DONUT JOUR / NUIT ────────────────────────────────────────────────────
  let day = 0, night = 0;
  for (const f of dated) { if (isDaytime(f.ts)) day++; else night++; }
  const dnTotal = day + night;
  const dayNight = {
    available: datedCount >= THRESHOLDS.DAYNIGHT,
    day, night, total: dnTotal,
    dayPct: dnTotal > 0 ? Math.round((day / dnTotal) * 100) : 0,
    nightPct: dnTotal > 0 ? Math.round((night / dnTotal) * 100) : 0,
  };

  // ─── DONUT GÉOGRAPHIE (top 3 + « Autre ») ─────────────────────────────────
  // Par villes si ≥ 2 villes, sinon par arrondissements si la ville en a.
  let geoMode = 'cities';
  let entries;
  if (distinctCities >= 2) {
    entries = Array.from(cityCount.entries()).map(([code, count]) => ({
      id: code, label: CITIES[code]?.name ?? code, count,
    }));
  } else if (CITIES[currentCityCode]?.subdivisionsKey && distinctDistricts >= 2) {
    geoMode = 'districts';
    entries = Array.from(districtCount.entries()).map(([ar, count]) => ({
      id: String(ar), label: arLabel(ar), count,
    }));
  } else {
    entries = Array.from(cityCount.entries()).map(([code, count]) => ({
      id: code, label: CITIES[code]?.name ?? code, count,
    }));
  }
  entries.sort((a, b) => b.count - a.count);
  const top = entries.slice(0, 3);
  const otherCount = entries.slice(3).reduce((s, e) => s + e.count, 0);
  const geoTotal = entries.reduce((s, e) => s + e.count, 0);
  const segments = top.map((e) => ({ ...e, pct: geoTotal > 0 ? Math.round((e.count / geoTotal) * 100) : 0 }));
  const geoBreakdown = {
    available: total >= THRESHOLDS.GEO && entries.length > 0,
    mode: geoMode, // 'cities' | 'districts'
    segments,      // [{ id, label, count, pct }]
    otherCount,
    total: geoTotal,
  };

  // ─── COURBE CUMULATIVE ────────────────────────────────────────────────────
  let series = { available: false, unit: 'week', points: [] };
  if (datedCount >= THRESHOLDS.CHARTS) {
    const spanWeeks = (now.getTime() - dated[0].ts) / (7 * 86400000);
    const useMonths = spanWeeks > 16;
    const buckets = new Map();
    for (const f of dated) {
      const d = new Date(f.ts);
      const k = useMonths
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : isoWeekKey(d);
      const b = buckets.get(k) ?? { key: k, count: 0, pts: 0 };
      b.count++;
      b.pts += invPts.get(f.id) ?? 0;
      buckets.set(k, b);
    }
    let cum = 0, cumPts = 0;
    const points = Array.from(buckets.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((b) => { cum += b.count; cumPts += b.pts; return { ...b, cum, cumPts }; });
    series = { available: points.length >= 2, unit: useMonths ? 'month' : 'week', points };
  }

  // ─── TITRE HONORIFIQUE ────────────────────────────────────────────────────
  // Tiers par total flashé ; clé i18n résolue côté UI (stats.profile.titles.<key>).
  const TITLE_TIERS = [
    { min: 1000, key: 'legend' },
    { min: 400, key: 'master' },
    { min: 150, key: 'veteran' },
    { min: 50, key: 'hunter' },
    { min: 10, key: 'scout' },
    { min: 0, key: 'novice' },
  ];
  const tierIdx = TITLE_TIERS.findIndex((t) => total >= t.min);
  const honorific = {
    key: TITLE_TIERS[tierIdx].key,
    tier: TITLE_TIERS.length - 1 - tierIdx, // 0 = novice … 5 = legend
    explorer: distinctCities >= 3,           // drapeau « globe-trotter » pour l'UI
  };

  // ─── MATURITÉ DES DONNÉES (états vides) ───────────────────────────────────
  const maturity = {
    total,
    datedCount,
    undatedCount: total - datedCount,
    hasCharts: datedCount >= THRESHOLDS.CHARTS,
    hasDayNight: datedCount >= THRESHOLDS.DAYNIGHT,
    hasSliders: rarity.available || geography.available || assiduity.available,
    isEmpty: total === 0,
  };

  return {
    // chiffres bruts utiles à l'en-tête / cartes
    total, datedCount, todayCount, weekCount, monthCount,
    activeDays, streak, record, bestDayCount, avgPoints: Math.round(avgPoints),
    distinctCities, distinctDistricts,
    // blocs
    sliders: { rarity, geography, assiduity },
    dayNight,
    geoBreakdown,
    series,
    honorific,
    maturity,
  };
}
