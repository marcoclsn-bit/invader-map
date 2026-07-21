import { useMemo, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { CITIES } from '../cities/registry';
import { computeHunterProfile, computeXpLevel, computeArchetype } from '../utils/hunterProfile';
import { useGamification } from '../context/GamificationContext';
import { completedCityCodes } from '../data/badges';
import LevelPath from '../components/profile/LevelPath';
import ProfileHeader from '../components/profile/ProfileHeader';
import HunterSlider from '../components/profile/HunterSlider';
import SegmentDonut from '../components/profile/SegmentDonut';
import AreaChart from '../components/profile/AreaChart';
import BarChart from '../components/profile/BarChart';
import BadgeGallery from '../components/profile/BadgeGallery';

// ─── Utilitaires de date (cartes « high scores » conservées) ────────────────────
function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function startOfWeek(d) {
  const r = startOfDay(d);
  const day = (r.getDay() + 6) % 7; // lundi = 0
  r.setDate(r.getDate() - day);
  return r;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function isoDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function extractCityCode(id) { const i = id.lastIndexOf('_'); return i > 0 ? id.substring(0, i) : id; }

// Cartes d'activité / série / record / rythme (inchangées dans l'esprit)
function computeStats({ flashHistory, invaders, currentCityCode }) {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const weekStart = startOfWeek(now).getTime();
  const monthStart = startOfMonth(now).getTime();
  const todayKey = isoDateKey(now);
  const yestKey = isoDateKey(new Date(now.getTime() - 86400000));

  const dated = flashHistory
    .filter(f => f.flashedAt != null)
    .map(f => ({ id: f.id, ts: new Date(f.flashedAt).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  let todayCount = 0, weekCount = 0, monthCount = 0;
  for (const f of dated) {
    if (f.ts >= todayStart) todayCount++;
    if (f.ts >= weekStart) weekCount++;
    if (f.ts >= monthStart) monthCount++;
  }

  const daySet = new Set(dated.map(f => isoDateKey(new Date(f.ts))));
  const days = Array.from(daySet).sort();
  let curRun = days.length > 0 ? 1 : 0;
  let maxRun = curRun;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86400000);
    curRun = diff === 1 ? curRun + 1 : 1;
    if (curRun > maxRun) maxRun = curRun;
  }
  const lastDay = days[days.length - 1] ?? '';
  const streak = (lastDay === todayKey || lastDay === yestKey) ? curRun : 0;

  const byDay = new Map();
  for (const f of dated) {
    const k = isoDateKey(new Date(f.ts));
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  let bestDay = null, bestDayCount = 0;
  for (const [day, count] of byDay) {
    if (count > bestDayCount) { bestDayCount = count; bestDay = day; }
  }

  const fourWeeksAgo = startOfWeek(now).getTime() - 4 * 7 * 86400000;
  const weeklyRate = dated.filter(f => f.ts >= fourWeeksAgo).length / 4;

  let projectionMonths = null;
  const cityFlashedHere = flashHistory.filter(f => extractCityCode(f.id) === currentCityCode).length;
  // Formule unifiée (cf. Palmarès) : un détruit jamais flashé ne compte pas contre
  // toi, mais un détruit que TU avais flashé reste acquis → jamais plus de 100 %.
  const flashedIds = new Set(flashHistory.map(f => f.id));
  const cityFlashable = invaders.filter(inv => inv.status !== 'destroyed' || flashedIds.has(inv.id)).length;
  if (weeklyRate > 0 && cityFlashable > 0) {
    const remaining = Math.max(0, cityFlashable - cityFlashedHere);
    projectionMonths = remaining === 0 ? 0 : Math.ceil(remaining / weeklyRate / 4.33);
  }

  return {
    total: flashHistory.length, datedCount: dated.length,
    todayCount, weekCount, monthCount,
    streak, record: maxRun, bestDay, bestDayCount,
    weeklyRate, projectionMonths, cityFlashedHere, cityFlashable,
  };
}

// ─── Composants UI réutilisables ──────────────────────────────────────────────

function Card({ title, children, theme }) {
  return (
    <View style={[cardStyles.wrap, { backgroundColor: theme.surface }]}>
      {title ? <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text> : null}
      {children}
    </View>
  );
}
const cardStyles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  title: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, marginBottom: 12 },
});

function BigStat({ label, value, accent, textSec }) {
  return (
    <View style={bigStatSt.wrap}>
      <Text style={[typography.arcadeScore, bigStatSt.value, { color: accent }]}>{value}</Text>
      <Text style={[bigStatSt.label, { color: textSec }]}>{label}</Text>
    </View>
  );
}
const bigStatSt = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1, paddingVertical: 4 },
  value: { fontSize: 22, lineHeight: 30 },
  label: { fontSize: 11, marginTop: 6 },
});

function ActivityCell({ label, count, theme }) {
  return (
    <View style={actSt.cell}>
      <Text style={[typography.arcadeHeading, actSt.count, { color: theme.accent }]}>{count}</Text>
      <Text style={[actSt.label, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}
const actSt = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  count: { fontSize: 20, lineHeight: 26 },
  label: { fontSize: 11, marginTop: 4, textAlign: 'center' },
});

function ProgressBar({ pct, theme }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${Math.min(pct, 100)}%`, height: 6, borderRadius: 3, backgroundColor: theme.accent }} />
    </View>
  );
}

function Divider({ horizontal, theme }) {
  return horizontal
    ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
    : <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />;
}

function Legend({ items, theme }) {
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: it.color, marginRight: 8 }} />
          <Text style={{ flex: 1, fontSize: 13, color: theme.textPrimary }} numberOfLines={1}>{it.label}</Text>
          <Text style={{ fontSize: 12, color: theme.textSecondary }}>{it.count} · {it.pct}%</Text>
        </View>
      ))}
    </View>
  );
}

function Hint({ children, theme }) {
  return <Text style={[st.hint, { color: theme.textSecondary }]}>{children}</Text>;
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function StatsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const { flashed, flashedDates, getFlashHistory, invaders, currentCityCode, cityIndex, cityProgress } = useAppContext();
  const { badges, unlockedCount } = useGamification();
  const [chartMode, setChartMode] = useState('daily');
  const [tab, setTab] = useState('profile'); // 'profile' | 'stats'
  const [showObjInfo, setShowObjInfo] = useState(false);

  const flashHistory = useMemo(() => getFlashHistory(), [flashed, flashedDates]);

  const stats = useMemo(
    () => computeStats({ flashHistory, invaders, currentCityCode }),
    [flashHistory, invaders, currentCityCode]
  );
  const profile = useMemo(
    () => computeHunterProfile({ flashHistory, invaders, cityIndex, currentCityCode, cityProgress }),
    [flashHistory, invaders, cityIndex, currentCityCode, cityProgress]
  );

  // ── Statistiques GLOBALES (toutes villes) — ce sont TES stats de joueur,
  // pas celles de la carte affichée.
  const globalStats = useMemo(() => {
    // Flashs par ville (préfixe de l'id)
    const byCity = new Map();
    for (const f of flashHistory) {
      const i = f.id.lastIndexOf('_');
      const code = i > 0 ? f.id.slice(0, i) : f.id;
      byCity.set(code, (byCity.get(code) ?? 0) + 1);
    }
    let totalPts = 0;
    for (const e of Object.values(cityProgress)) totalPts += e?.flashedPts ?? 0;
    // Progression sur les villes COMMENCÉES (formule « juste » : registre exact,
    // sinon approximation via l'index comme au Palmarès)
    let sumFlashed = 0, sumDenom = 0;
    for (const [code, flashedHere] of byCity) {
      const reg = cityProgress[code];
      if (reg?.denominator > 0) {
        sumFlashed += reg.flashedCount;
        sumDenom += reg.denominator;
      } else {
        const info = cityIndex.find((c) => c.code === code);
        const flashables = info ? Math.max(0, (info.count ?? 0) - (info.destroyed ?? 0)) : 0;
        sumFlashed += flashedHere;
        sumDenom += Math.max(flashables, flashedHere);
      }
    }
    return { totalPts, sumFlashed, sumDenom, citiesStarted: byCity.size };
  }, [flashHistory, cityProgress, cityIndex]);

  // ── Flashs par jour — semaine glissante (7 derniers jours, flashs datés)
  const dailyBars = useMemo(() => {
    const counts = new Map();
    for (const f of flashHistory) {
      if (!f.flashedAt) continue;
      const d = new Date(f.flashedAt);
      if (Number.isNaN(d.getTime())) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const lang = i18n.language || 'fr';
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({
        label: d.toLocaleDateString(lang, { weekday: 'short' }).replace('.', ''),
        value: counts.get(k) ?? 0,
      });
    }
    return out;
  }, [flashHistory, i18n.language]);

  // ── Niveau (XP) + archétype de chasseur
  const hunterLevel = useMemo(
    () => computeXpLevel({ flashes: stats.total, points: globalStats.totalPts, trophies: unlockedCount }),
    [stats.total, globalStats.totalPts, unlockedCount]
  );
  const archetype = useMemo(() => computeArchetype(profile), [profile]);

  // ── Faits d'armes (highlights auto-générés, uniquement ceux qui ont des données)
  const highlights = useMemo(() => {
    const lang = i18n.language || 'fr';
    const fmt = (d) => new Date(d).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    const out = [];
    // Plus grosse journée
    if (stats.bestDayCount > 0 && stats.bestDay) {
      out.push({ icon: 'flame', label: t('stats.highlights.bestDay'),
        value: t('stats.highlights.bestDayValue', { count: stats.bestDayCount, date: fmt(stats.bestDay) }) });
    }
    // Ville fétiche
    const byCity = new Map();
    for (const f of flashHistory) {
      const i2 = f.id.lastIndexOf('_');
      const code = i2 > 0 ? f.id.slice(0, i2) : f.id;
      byCity.set(code, (byCity.get(code) ?? 0) + 1);
    }
    let favCode = null, favCount = 0;
    for (const [code, n] of byCity) if (n > favCount) { favCode = code; favCount = n; }
    if (favCode) {
      out.push({ icon: 'heart', label: t('stats.highlights.favCity'),
        value: t('stats.highlights.favCityValue', { city: CITIES[favCode]?.name ?? favCode, count: favCount }) });
    }
    // Première capture (datée)
    const datedTs = flashHistory
      .filter((f) => f.flashedAt).map((f) => new Date(f.flashedAt).getTime())
      .filter(Number.isFinite);
    if (datedTs.length) {
      out.push({ icon: 'sparkles', label: t('stats.highlights.first'), value: fmt(Math.min(...datedTs)) });
    }
    // Tendance jour/nuit
    const dn = profile.dayNight;
    if (dn.available) {
      out.push({ icon: dn.dayPct >= dn.nightPct ? 'sunny' : 'moon', label: t('stats.highlights.trend'),
        value: dn.dayPct >= dn.nightPct
          ? t('stats.highlights.trendDay', { pct: dn.dayPct })
          : t('stats.highlights.trendNight', { pct: dn.nightPct }) });
    }
    // Dernier trophée
    const last = badges.filter((b) => b.unlockedAt).sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))[0];
    if (last) {
      out.push({ icon: 'trophy', label: t('stats.highlights.lastTrophy'),
        value: t('stats.highlights.lastTrophyValue', { title: t(`badges.${last.id}.title`), date: fmt(last.unlockedAt) }) });
    }
    return out;
  }, [stats, flashHistory, profile, badges, i18n.language, t]);

  // ── Prochains objectifs : les cibles atteignables les plus proches.
  // Ville : formule « juste » (registre) + pertinence (ville active OU activité
  // < 30 jours) — pas d'objectif frustrant sur une ville de vacances.
  const objectives = useMemo(() => {
    const out = [];
    const nextTier = (tiers, cur) => tiers.find(([v]) => cur < v);
    // label = nom du trophée (motivant) ; sub = sa condition (compréhensible)
    const push = (icon, label, cur, target, sub) =>
      out.push({ icon, label, sub, pct: Math.min(1, cur / target), valueText: `${cur}/${target}` });

    if (!hunterLevel.isMax) {
      out.push({
        icon: 'star', label: t('stats.objectives.level', { level: hunterLevel.level + 1 }),
        pct: hunterLevel.progress, valueText: t('stats.objectives.xpLeft', { count: hunterLevel.xpRemaining }),
      });
    }
    const badgeText = (id) => ({ title: t(`badges.${id}.title`), desc: t(`badges.${id}.desc`) });
    const col = nextTier([[25, 'squad25'], [100, 'centurion'], [250, 'battalion250'], [500, 'army500'], [1000, 'legend1000'], [2000, 'spacemaster2000']], stats.total);
    if (col && stats.total > 0) { const b = badgeText(col[1]); push('albums', b.title, stats.total, col[0], b.desc); }
    const pts = nextTier([[500, 'loot500'], [2500, 'treasurer2500'], [10000, 'vault10000'], [25000, 'jackpot25000']], globalStats.totalPts);
    if (pts && globalStats.totalPts > 0) { const b = badgeText(pts[1]); push('cash', b.title, globalStats.totalPts, pts[0], b.desc); }
    const exp = nextTier([[3, 'explorer'], [5, 'globetrotter'], [10, 'nomade10'], [20, 'conquerant20']], profile.distinctCities);
    if (exp && profile.distinctCities > 0) { const b = badgeText(exp[1]); push('compass', b.title, profile.distinctCities, exp[0], b.desc); }
    const doneCount = completedCityCodes({ flashHistory, cityIndex, cityProgress }).size;
    const cd = nextTier([[1, 'conquete1'], [3, 'triple3'], [5, 'pantheon5'], [10, 'hegemonie10']], doneCount);
    if (cd && doneCount > 0) { const b = badgeText(cd[1]); push('trophy', b.title, doneCount, cd[0], b.desc); }

    // Terminer une ville PERTINENTE (active, ou flashée dans les 30 derniers jours)
    const lastByCity = new Map();
    for (const f of flashHistory) {
      if (!f.flashedAt) continue;
      const i2 = f.id.lastIndexOf('_');
      const code = i2 > 0 ? f.id.slice(0, i2) : f.id;
      const ts = Date.parse(f.flashedAt);
      if (Number.isFinite(ts) && ts > (lastByCity.get(code) ?? 0)) lastByCity.set(code, ts);
    }
    const recentSince = Date.now() - 30 * 86400000;
    const cityCandidates = [];
    for (const [code, e] of Object.entries(cityProgress)) {
      if (!e || e.denominator <= 0 || e.completed || e.flashedCount <= 0) continue;
      const relevant = code === currentCityCode || (lastByCity.get(code) ?? 0) >= recentSince;
      if (!relevant) continue;
      cityCandidates.push({ code, pct: e.flashedCount / e.denominator, e });
    }
    cityCandidates.sort((a, b) => b.pct - a.pct);
    const cg = cityCandidates[0];
    if (cg) {
      out.push({
        icon: 'business',
        label: t('stats.objectives.finishCity', { city: CITIES[cg.code]?.name ?? cg.code }),
        pct: cg.pct, valueText: `${cg.e.flashedCount}/${cg.e.denominator}`,
      });
    }

    // Les plus proches d'aboutir d'abord, 4 max
    return out.sort((a, b) => b.pct - a.pct).slice(0, 4);
  }, [hunterLevel, stats.total, globalStats.totalPts, profile.distinctCities, flashHistory, cityIndex, cityProgress, currentCityCode, t]);

  function openDrawer() { navigation.dispatch(DrawerActions.openDrawer()); }

  const cityName = CITIES[currentCityCode]?.name ?? currentCityCode; // projections (carte « rythme »)
  const hasDated = stats.datedCount > 0;
  const chartWidth = width - 64; // marges (16×2) + padding carte (16×2)

  const Header = (
    <View style={[st.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={st.headerLeft}>
        <TouchableOpacity onPress={openDrawer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="menu" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[typography.arcadeTitle, { color: theme.textPrimary }]}>{t('stats.title')}</Text>
      </View>
    </View>
  );

  // ─── État vide global ────────────────────────────────────────────────────────
  if (stats.total === 0) {
    return (
      <View style={[st.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        {Header}
        <View style={st.emptyBody}>
          <Text style={st.emptyEmoji}>👾</Text>
          <Text style={[typography.arcadeTitle, st.emptyTitle, { color: theme.textPrimary }]}>{t('stats.empty.title')}</Text>
          <Text style={[st.emptyDesc, { color: theme.textSecondary }]}>{t('stats.empty.body')}</Text>
        </View>
      </View>
    );
  }

  // ── Donut géographie ──
  const geo = profile.geoBreakdown;
  const GEO_COLORS = [theme.accent, theme.statusOk, theme.accentScore];
  const geoSegs = geo.segments.map((s, i) => ({ ...s, color: GEO_COLORS[i] ?? theme.textSecondary }));
  if (geo.otherCount > 0) {
    geoSegs.push({
      label: t('stats.profile.geo.other'), count: geo.otherCount, color: theme.textSecondary,
      pct: geo.total > 0 ? Math.round((geo.otherCount / geo.total) * 100) : 0,
    });
  }

  // ── Donut jour/nuit ──
  const dn = profile.dayNight;
  const dnDom = dn.day >= dn.night
    ? { pct: dn.dayPct, label: t('stats.profile.dayNight.day') }
    : { pct: dn.nightPct, label: t('stats.profile.dayNight.night') };

  // ── Courbe ──
  const series = profile.series;
  const curvePoints = series.points.map(p => ({ key: p.key, cum: p.cum }));

  const sliderDefs = [
    { k: 'rarity', d: profile.sliders.rarity },
    { k: 'geography', d: profile.sliders.geography },
    { k: 'assiduity', d: profile.sliders.assiduity },
  ];

  return (
    <View style={[st.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {Header}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16, paddingHorizontal: 16 }}>

        {/* Sélecteur de volet : Profil | Stats */}
        <View style={[st.tabRow, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
          {[
            { k: 'profile', label: t('stats.tabs.profile') },
            { k: 'stats', label: t('stats.tabs.stats') },
          ].map(({ k, label }) => (
            <TouchableOpacity
              key={k}
              style={[st.tabBtn, tab === k && { backgroundColor: theme.accentDim, borderColor: theme.accent, borderWidth: 1 }]}
              onPress={() => setTab(k)}
              activeOpacity={0.8}
            >
              <Text style={[st.tabLabel, { color: tab === k ? theme.accent : theme.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'profile' && (
        <>
        {/* En-tête profil (local) : niveau + archétype */}
        <ProfileHeader
          honorific={{ key: hunterLevel.titleKey, explorer: profile.honorific.explorer }}
          total={stats.total}
          level={hunterLevel}
          archetype={archetype}
        />

        {/* Parcours du chasseur : le niveau comme un chemin à travers les rangs */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.path.title').toUpperCase()}</Text>
          <LevelPath level={hunterLevel} />
        </View>

        {/* Prochains objectifs : les cibles atteignables les plus proches */}
        {objectives.length > 0 && (
          <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
            <View style={st.objTitleRow}>
              <Text style={[cardStyles.title, { color: theme.textSecondary, marginBottom: 0 }]}>{t('stats.objectives.title').toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setShowObjInfo(!showObjInfo)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons
                  name={showObjInfo ? 'information-circle' : 'information-circle-outline'}
                  size={16}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {showObjInfo && (
              <View style={[st.objInfoBox, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
                <Text style={[st.objInfoText, { color: theme.textSecondary }]}>{t('stats.objectives.info')}</Text>
              </View>
            )}
            {objectives.map((o, i) => (
              <View key={i} style={[st.objRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={st.objTop}>
                  <View style={[st.hlIcon, { backgroundColor: theme.accentDim }]}>
                    <Ionicons name={o.icon} size={15} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.objLabel, { color: theme.textPrimary }]} numberOfLines={1}>{o.label}</Text>
                    {o.sub ? <Text style={[st.objSub, { color: theme.textSecondary }]} numberOfLines={1}>{o.sub}</Text> : null}
                  </View>
                  <Text style={[st.objValue, { color: theme.textSecondary }]}>{o.valueText}</Text>
                </View>
                <ProgressBar pct={o.pct * 100} theme={theme} />
              </View>
            ))}
          </View>
        )}

        {/* Profil de chasseur — sliders */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.profile.sectionTitle').toUpperCase()}</Text>
          {profile.maturity.hasSliders ? (
            sliderDefs.map(({ k, d }) => (
              <HunterSlider
                key={k}
                label={t(`stats.profile.sliders.${k}.label`)}
                value={d.value}
                available={d.available}
                lowLabel={t(`stats.profile.sliders.${k}.low`)}
                highLabel={t(`stats.profile.sliders.${k}.high`)}
                lockedHint={t('stats.profile.locked')}
                info={t(`stats.profile.sliders.${k}.info`)}
              />
            ))
          ) : (
            <Hint theme={theme}>{t('stats.profile.empty.sliders')}</Hint>
          )}
        </View>

        {/* Faits d'armes */}
        {highlights.length > 0 && (
          <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
            <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.highlights.title').toUpperCase()}</Text>
            {highlights.map((h, i) => (
              <View key={i} style={[st.hlRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={[st.hlIcon, { backgroundColor: theme.accentDim }]}>
                  <Ionicons name={h.icon} size={15} color={theme.accent} />
                </View>
                <Text style={[st.hlLabel, { color: theme.textSecondary }]}>{h.label}</Text>
                <Text style={[st.hlValue, { color: theme.textPrimary }]} numberOfLines={1}>{h.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Galerie de trophées */}
        <BadgeGallery />
        </>
        )}

        {tab === 'stats' && (
        <>
        {/* Résumé global */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <View style={st.summaryRow}>
            <BigStat label={t('stats.activity.total')} value={stats.total} accent={theme.accent} textSec={theme.textSecondary} />
            <View style={[st.vDivider, { backgroundColor: theme.border }]} />
            <BigStat label={t('stats.pointsLabel')} value={globalStats.totalPts} accent={theme.accentScore} textSec={theme.textSecondary} />
          </View>
          {globalStats.sumDenom > 0 && (
            <>
              <ProgressBar pct={Math.min(100, (globalStats.sumFlashed / globalStats.sumDenom) * 100)} theme={theme} />
              <Text style={[st.progressSub, { color: theme.textSecondary }]}>
                {t(globalStats.citiesStarted === 1 ? 'stats.globalProgress_one' : 'stats.globalProgress_other', {
                  flashed: globalStats.sumFlashed, total: globalStats.sumDenom, count: globalStats.citiesStarted,
                })}
              </Text>
            </>
          )}
        </View>

        {/* Donut géographie */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.profile.geo.title').toUpperCase()}</Text>
          {geo.available ? (
            <>
              <View style={{ alignItems: 'center' }}>
                <SegmentDonut
                  segments={geoSegs.map(s => ({ value: s.count, color: s.color }))}
                  size={140} stroke={18} trackColor={theme.border}
                  centerLabel={String(profile.geoBreakdown.total)} centerSub={t('stats.profile.geo.center')}
                  textColor={theme.textPrimary} subColor={theme.textSecondary}
                />
              </View>
              <Legend items={geoSegs} theme={theme} />
            </>
          ) : (
            <Hint theme={theme}>{t('stats.profile.empty.geo')}</Hint>
          )}
        </View>

        {/* Donut jour / nuit */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.profile.dayNight.title').toUpperCase()}</Text>
          {dn.available ? (
            <>
              <View style={{ alignItems: 'center' }}>
                <SegmentDonut
                  segments={[
                    { value: dn.day, color: theme.accentScore },
                    { value: dn.night, color: theme.night },
                  ]}
                  size={140} stroke={18} trackColor={theme.border}
                  centerLabel={`${dnDom.pct}%`} centerSub={dnDom.label}
                  textColor={theme.textPrimary} subColor={theme.textSecondary}
                />
              </View>
              <Legend
                items={[
                  { label: t('stats.profile.dayNight.day'), count: dn.day, pct: dn.dayPct, color: theme.accentScore },
                  { label: t('stats.profile.dayNight.night'), count: dn.night, pct: dn.nightPct, color: theme.night },
                ]}
                theme={theme}
              />
              {/* Les flashs sans date (« Tout flasher ») ne peuvent pas être classés jour/nuit */}
              {dn.total < stats.total && (
                <Text style={{ fontSize: 11.5, color: theme.textSecondary, fontStyle: 'italic', marginTop: 10, textAlign: 'center' }}>
                  {t('stats.profile.dayNight.basedOn', { count: dn.total })}
                </Text>
              )}
            </>
          ) : (
            <Hint theme={theme}>{t('stats.profile.empty.dayNight')}</Hint>
          )}
        </View>

        {/* Progression : barres par jour (7 j glissants) + cumul long terme */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.profile.curve.title').toUpperCase()}</Text>
          {hasDated ? (
            <>
              <View style={st.toggleRow}>
                {[
                  { key: 'daily', label: t('stats.chart.toggleDaily') },
                  { key: 'cum', label: t('stats.chart.toggleCum') },
                ].map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={[st.toggleBtn, { borderColor: theme.border, backgroundColor: chartMode === key ? theme.accentDim : 'transparent' }]}
                    onPress={() => setChartMode(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.toggleLabel, { color: chartMode === key ? theme.accent : theme.textSecondary }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {chartMode === 'daily' ? (
                <BarChart
                  bars={dailyBars}
                  width={chartWidth}
                  accent={theme.accent}
                  textSec={theme.textSecondary}
                  border={theme.border}
                />
              ) : series.available ? (
                <AreaChart
                  points={curvePoints}
                  width={chartWidth}
                  accent={theme.accent}
                  textSec={theme.textSecondary}
                  border={theme.border}
                  unit={series.unit}
                />
              ) : (
                <Hint theme={theme}>{t('stats.profile.empty.curve')}</Hint>
              )}
            </>
          ) : (
            <Hint theme={theme}>{t('stats.profile.empty.curve')}</Hint>
          )}
        </View>

        {/* Activité récente */}
        {hasDated && (
          <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
            <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.activity.section').toUpperCase()}</Text>
            <View style={[st.grid, { borderColor: theme.border }]}>
              <View style={st.gridRow}>
                <ActivityCell label={t('stats.activity.today')} count={stats.todayCount} theme={theme} />
                <Divider theme={theme} />
                <ActivityCell label={t('stats.activity.week')} count={stats.weekCount} theme={theme} />
              </View>
              <Divider horizontal theme={theme} />
              <View style={st.gridRow}>
                <ActivityCell label={t('stats.activity.month')} count={stats.monthCount} theme={theme} />
                <Divider theme={theme} />
                <ActivityCell label={t('stats.activity.total')} count={stats.total} theme={theme} />
              </View>
            </View>
          </View>
        )}

        {/* Série & record */}
        {hasDated && (
          <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
            <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.streak.section').toUpperCase()}</Text>
            <View style={st.streakRow}>
              <View style={st.streakCell}>
                <Text style={[typography.arcadeScore, st.streakNum, { color: theme.accent }]}>
                  {stats.streak > 0 ? stats.streak : '—'}
                </Text>
                {stats.streak > 0 && (
                  <Text style={[st.streakUnit, { color: theme.textSecondary }]}>
                    {t(stats.streak === 1 ? 'stats.streak.days_one' : 'stats.streak.days_other', { count: stats.streak })}
                  </Text>
                )}
                <Text style={[st.streakLabel, { color: theme.textSecondary }]}>{t('stats.streak.currentLabel')}</Text>
              </View>
              <Divider theme={theme} />
              <View style={st.streakCell}>
                <Text style={[typography.arcadeScore, st.streakNum, { color: theme.accentScore }]}>{stats.record}</Text>
                <Text style={[st.streakUnit, { color: theme.textSecondary }]}>
                  {t(stats.record === 1 ? 'stats.streak.days_one' : 'stats.streak.days_other', { count: stats.record })}
                </Text>
                <Text style={[st.streakLabel, { color: theme.textSecondary }]}>{t('stats.streak.recordLabel')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Meilleure journée */}
        {stats.bestDay && (
          <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
            <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.bestDay.label').toUpperCase()}</Text>
            <View style={st.bestDayRow}>
              <Text style={[typography.arcadeScore, st.bestDayNum, { color: theme.accent }]}>{stats.bestDayCount}</Text>
              <View style={{ marginLeft: 16 }}>
                <Text style={[st.bestDayUnit, { color: theme.textPrimary }]}>
                  {t(stats.bestDayCount === 1 ? 'stats.bestDay.value_one' : 'stats.bestDay.value_other', { count: stats.bestDayCount })}
                </Text>
                <Text style={[st.bestDayDate, { color: theme.textSecondary }]}>
                  {new Date(stats.bestDay + 'T12:00:00').toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Rythme & projection */}
        {stats.weeklyRate > 0 && (
          <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
            <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.rate.section').toUpperCase()}</Text>
            <Text style={[typography.arcadeHeading, st.rateNum, { color: theme.textPrimary }]}>
              {t(Math.round(stats.weeklyRate) <= 1 ? 'stats.rate.weekly_one' : 'stats.rate.weekly_other', { count: Math.round(stats.weeklyRate) })}
            </Text>
            <Text style={[st.projText, { color: theme.textSecondary }]}>
              {stats.projectionMonths === null
                ? t('stats.rate.notEnoughData')
                : stats.projectionMonths === 0
                  ? t('stats.rate.projectionDone', { city: cityName })
                  : stats.projectionMonths === 1
                    ? t('stats.rate.projectionSoon', { city: cityName })
                    : t('stats.rate.projection', { city: cityName, months: stats.projectionMonths })}
            </Text>
          </View>
        )}
        </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },

  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 20 },
  emptyTitle: { textAlign: 'center', marginBottom: 12 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  tabRow: {
    flexDirection: 'row', gap: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 4, marginBottom: 16,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  tabLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  objTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  objInfoBox: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginBottom: 6 },
  objInfoText: { fontSize: 12, lineHeight: 17 },
  objRow: { paddingVertical: 10 },
  objTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  objLabel: { fontSize: 13.5, fontWeight: '700' },
  objSub: { fontSize: 11, marginTop: 1 },
  objValue: { fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },

  hlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  hlIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hlLabel: { fontSize: 12.5, flexShrink: 0 },
  hlValue: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },

  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  vDivider: { width: StyleSheet.hairlineWidth, height: 56, marginHorizontal: 8 },
  progressSub: { fontSize: 11, marginTop: 8, textAlign: 'center' },

  grid: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },

  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  toggleBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  toggleLabel: { fontSize: 12 },

  streakRow: { flexDirection: 'row', alignItems: 'center' },
  streakCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  streakNum: { fontSize: 28, lineHeight: 36 },
  streakUnit: { fontSize: 11, marginTop: 2 },
  streakLabel: { fontSize: 11, marginTop: 8 },

  bestDayRow: { flexDirection: 'row', alignItems: 'center' },
  bestDayNum: { fontSize: 32, lineHeight: 42 },
  bestDayUnit: { fontSize: 15, fontWeight: '600' },
  bestDayDate: { fontSize: 12, marginTop: 3 },

  rateNum: { fontSize: 14, marginBottom: 8 },
  projText: { fontSize: 13, lineHeight: 20 },
  hint: { fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
});
