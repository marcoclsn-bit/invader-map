import { useMemo, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Svg, { Polyline, Polygon, Line, Text as SvgText } from 'react-native-svg';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { CITIES } from '../cities/registry';
import { INVADER_DISTRICT, arLabel } from '../utils/arrondissement';

// ─── Noms de mois courts par langue ──────────────────────────────────────────

const MONTHS_SHORT = {
  fr: ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'],
  en: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
  es: ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'],
  it: ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'],
};

// ─── Helpers date (heure locale, pas UTC) ────────────────────────────────────

function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function startOfWeek(d) {
  const r = startOfDay(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function isoDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isoWeekKey(d) {
  const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow  = tmp.getDay() || 7;
  tmp.setDate(tmp.getDate() + 4 - dow);
  const y = tmp.getFullYear();
  const w = Math.ceil(((tmp - new Date(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2,'0')}`;
}
function extractCityCode(id) { const i = id.lastIndexOf('_'); return i > 0 ? id.substring(0, i) : id; }

// ─── Calcul des stats ─────────────────────────────────────────────────────────

function computeStats({ flashHistory, invaders, currentCityCode }) {
  const now        = new Date();
  const todayStart = startOfDay(now).getTime();
  const weekStart  = startOfWeek(now).getTime();
  const monthStart = startOfMonth(now).getTime();
  const todayKey   = isoDateKey(now);
  const yestKey    = isoDateKey(new Date(now.getTime() - 86400000));
  const invPts     = new Map(invaders.map(inv => [inv.id, inv.points ?? 0]));

  const dated = flashHistory
    .filter(f => f.flashedAt != null)
    .map(f => ({ id: f.id, ts: new Date(f.flashedAt).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  // ── Activité ──
  let todayCount = 0, weekCount = 0, monthCount = 0;
  for (const f of dated) {
    if (f.ts >= todayStart) todayCount++;
    if (f.ts >= weekStart)  weekCount++;
    if (f.ts >= monthStart) monthCount++;
  }

  // ── Streak ──
  const daySet = new Set(dated.map(f => isoDateKey(new Date(f.ts))));
  const days   = Array.from(daySet).sort();
  let curRun = days.length > 0 ? 1 : 0;
  let maxRun = curRun;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i-1])) / 86400000);
    curRun = diff === 1 ? curRun + 1 : 1;
    if (curRun > maxRun) maxRun = curRun;
  }
  const lastDay = days[days.length - 1] ?? '';
  const streak  = (lastDay === todayKey || lastDay === yestKey) ? curRun : 0;

  // ── Meilleure journée ──
  const byDay = new Map();
  for (const f of dated) {
    const k = isoDateKey(new Date(f.ts));
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  let bestDay = null, bestDayCount = 0;
  for (const [day, count] of byDay) {
    if (count > bestDayCount) { bestDayCount = count; bestDay = day; }
  }

  // ── Rythme (4 dernières semaines complètes) ──
  const fourWeeksAgo = startOfWeek(now).getTime() - 4 * 7 * 86400000;
  const weeklyRate   = dated.filter(f => f.ts >= fourWeeksAgo).length / 4;

  // ── Projection ville courante ──
  let projectionMonths = null;
  const cityFlashedHere = flashHistory.filter(f => extractCityCode(f.id) === currentCityCode).length;
  const cityFlashable   = invaders.filter(inv => inv.status !== 'destroyed').length;
  if (weeklyRate > 0 && cityFlashable > 0) {
    const remaining = Math.max(0, cityFlashable - cityFlashedHere);
    projectionMonths = remaining === 0 ? 0 : Math.ceil(remaining / weeklyRate / 4.33);
  }

  // ── Chart (cumulatif par semaine ou mois) ──
  let chartData = [];
  if (dated.length >= 3) {
    const spanWeeks = (now.getTime() - dated[0].ts) / (7 * 86400000);
    const useMonths = spanWeeks > 16;
    const buckets   = new Map();
    for (const f of dated) {
      const d = new Date(f.ts);
      const k = useMonths
        ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        : isoWeekKey(d);
      const b = buckets.get(k) ?? { key: k, count: 0, pts: 0, useMonths };
      b.count++;
      b.pts += invPts.get(f.id) ?? 0;
      buckets.set(k, b);
    }
    let cum = 0, cumPts = 0;
    chartData = Array.from(buckets.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(b => { cum += b.count; cumPts += b.pts; return { ...b, cum, cumPts }; });
  }

  // ── Répartition par ville ──
  const cityCount = new Map();
  for (const f of flashHistory) {
    const code = extractCityCode(f.id);
    cityCount.set(code, (cityCount.get(code) ?? 0) + 1);
  }

  return {
    total: flashHistory.length, datedCount: dated.length,
    todayCount, weekCount, monthCount,
    streak, record: maxRun,
    bestDay, bestDayCount,
    weeklyRate, projectionMonths,
    cityFlashedHere, cityFlashable,
    chartData, cityCount,
  };
}

// ─── Graphique SVG ────────────────────────────────────────────────────────────

function LineChart({ data, valueKey, accent, border, textSec, lang }) {
  const { width: screenW } = useWindowDimensions(); // hook avant tout early return
  if (data.length < 2) return null;

  const width   = screenW - 64; // 16 marges + 16 card padding x2
  const height  = 160;
  const pad     = { t: 14, r: 10, b: 28, l: 44 };
  const cw      = width - pad.l - pad.r;
  const ch      = height - pad.t - pad.b;
  const maxVal  = Math.max(...data.map(d => d[valueKey]), 1);
  const months  = MONTHS_SHORT[lang] ?? MONTHS_SHORT.en;

  const toX = i => pad.l + (i / Math.max(data.length - 1, 1)) * cw;
  const toY = v => pad.t + ch - (v / maxVal) * ch;

  const pts  = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d[valueKey]).toFixed(1)}`).join(' ');
  const area = `${toX(0).toFixed(1)},${(pad.t+ch).toFixed(1)} ${pts} ${toX(data.length-1).toFixed(1)},${(pad.t+ch).toFixed(1)}`;
  const step = Math.max(1, Math.ceil(data.length / 5));

  function fmtKey(key, useMonths) {
    if (useMonths) {
      const [, m] = key.split('-');
      return months[parseInt(m, 10) - 1] ?? m;
    }
    return 'S' + (key.split('W')[1] ?? '?');
  }

  return (
    <Svg width={width} height={height}>
      {[0, 0.5, 1].map(p => (
        <Line key={p}
          x1={pad.l} y1={pad.t + ch * (1 - p)} x2={pad.l + cw} y2={pad.t + ch * (1 - p)}
          stroke={border} strokeWidth={0.5} />
      ))}
      <SvgText x={pad.l - 6} y={pad.t + 5} fontSize={9} fill={textSec} textAnchor="end">{maxVal}</SvgText>
      <SvgText x={pad.l - 6} y={pad.t + ch / 2 + 4} fontSize={9} fill={textSec} textAnchor="end">{Math.round(maxVal / 2)}</SvgText>
      <Polygon points={area} fill={accent} opacity={0.13} />
      <Polyline points={pts} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => {
        if (i % step !== 0 && i !== data.length - 1) return null;
        return (
          <SvgText key={d.key} x={toX(i).toFixed(1)} y={height - 5} fontSize={9} fill={textSec} textAnchor="middle">
            {fmtKey(d.key, d.useMonths)}
          </SvgText>
        );
      })}
    </Svg>
  );
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
  wrap:  { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16,
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
  wrap:  { alignItems: 'center', flex: 1, paddingVertical: 4 },
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
  cell:  { flex: 1, alignItems: 'center', paddingVertical: 12 },
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

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function StatsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const { flashed, flashedDates, getFlashHistory, invaders, currentCityCode, cityIndex } = useAppContext();
  const [chartMode, setChartMode] = useState('count');

  const flashHistory = useMemo(() => getFlashHistory(), [flashed, flashedDates]);

  const stats = useMemo(
    () => computeStats({ flashHistory, invaders, currentCityCode }),
    [flashHistory, invaders, currentCityCode]
  );

  const topCities = useMemo(() => {
    return Array.from(stats.cityCount.entries())
      .map(([code, count]) => {
        const entry = cityIndex.find(c => c.code === code);
        const total = code === currentCityCode
          ? invaders.filter(inv => inv.status !== 'destroyed').length
          : (entry?.count ?? 0);
        const pct = total > 0 ? (count / total) * 100 : 0;
        return { code, name: CITIES[code]?.name ?? code, count, total, pct };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [stats.cityCount, cityIndex, currentCityCode, invaders]);

  // Même logique que PalmèresScreen, top 5 arrondissements par % (Paris seulement)
  const topDistricts = useMemo(() => {
    if (currentCityCode !== 'PA') return [];
    const flashable = invaders.filter(inv => inv.status !== 'destroyed');
    const byAr = new Map();
    for (let ar = 1; ar <= 20; ar++) byAr.set(ar, { ar, total: 0, flashed: 0 });
    for (const inv of flashable) {
      const ar = INVADER_DISTRICT.get(inv.id);
      if (!ar) continue;
      const s = byAr.get(ar);
      if (!s) continue;
      s.total++;
      if (flashed.has(inv.id)) s.flashed++;
    }
    return Array.from(byAr.values())
      .filter(s => s.total > 0 && s.flashed > 0)
      .map(s => ({ ...s, pct: (s.flashed / s.total) * 100 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [currentCityCode, invaders, flashed]);

  function openSettings() { navigation.getParent()?.navigate('Réglages'); }

  const cityName = CITIES[currentCityCode]?.name ?? currentCityCode;
  const hasDated = stats.datedCount > 0;
  const cityPct  = stats.cityFlashable > 0
    ? ((stats.cityFlashedHere / stats.cityFlashable) * 100).toFixed(0)
    : '0';

  // ─── État vide ────────────────────────────────────────────────────────────────
  if (stats.total === 0) {
    return (
      <View style={[st.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        <View style={[st.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text style={[typography.arcadeTitle, { color: theme.textPrimary }]}>{t('stats.title')}</Text>
          <TouchableOpacity onPress={openSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={st.emptyBody}>
          <Text style={st.emptyEmoji}>👾</Text>
          <Text style={[typography.arcadeTitle, st.emptyTitle, { color: theme.textPrimary }]}>{t('stats.empty.title')}</Text>
          <Text style={[st.emptyDesc, { color: theme.textSecondary }]}>{t('stats.empty.body')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>

      <View style={[st.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[typography.arcadeTitle, { color: theme.textPrimary }]}>{t('stats.title')}</Text>
        <TouchableOpacity onPress={openSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16 }}>

        {/* Résumé global */}
        <Card theme={theme}>
          <View style={st.summaryRow}>
            <BigStat label={t('stats.activity.total')} value={stats.total} accent={theme.accent} textSec={theme.textSecondary} />
            <View style={[st.vDivider, { backgroundColor: theme.border }]} />
            <BigStat label={cityName} value={`${cityPct} %`} accent={theme.accentScore} textSec={theme.textSecondary} />
          </View>
          {stats.cityFlashable > 0 && (
            <>
              <ProgressBar pct={(stats.cityFlashedHere / stats.cityFlashable) * 100} theme={theme} />
              <Text style={[st.progressSub, { color: theme.textSecondary }]}>
                {stats.cityFlashedHere} / {stats.cityFlashable} · {cityName}
              </Text>
            </>
          )}
        </Card>

        {/* Activité récente */}
        {hasDated ? (
          <Card title={t('stats.activity.section')} theme={theme}>
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
          </Card>
        ) : (
          <Card title={t('stats.activity.section')} theme={theme}>
            <Text style={[st.hint, { color: theme.textSecondary }]}>{t('stats.activity.onlyTotal')}</Text>
          </Card>
        )}

        {/* Graphique */}
        {stats.chartData.length >= 2 ? (
          <Card title={t('stats.chart.section')} theme={theme}>
            <View style={st.toggleRow}>
              {[
                { key: 'count', label: t('stats.chart.toggleCount') },
                { key: 'pts',   label: `${t('stats.chart.togglePts')} (${cityName})` },
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
            <LineChart
              data={stats.chartData}
              valueKey={chartMode === 'count' ? 'cum' : 'cumPts'}
              accent={theme.accent}
              border={theme.border}
              textSec={theme.textSecondary}
              lang={i18n.language}
            />
          </Card>
        ) : hasDated ? (
          <Card title={t('stats.chart.section')} theme={theme}>
            <Text style={[st.hint, { color: theme.textSecondary }]}>{t('stats.chart.insufficient')}</Text>
          </Card>
        ) : null}

        {/* Série & record */}
        {hasDated && (
          <Card title={t('stats.streak.section')} theme={theme}>
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
                <Text style={[typography.arcadeScore, st.streakNum, { color: theme.accentScore }]}>
                  {stats.record}
                </Text>
                <Text style={[st.streakUnit, { color: theme.textSecondary }]}>
                  {t(stats.record === 1 ? 'stats.streak.days_one' : 'stats.streak.days_other', { count: stats.record })}
                </Text>
                <Text style={[st.streakLabel, { color: theme.textSecondary }]}>{t('stats.streak.recordLabel')}</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Meilleure journée */}
        {stats.bestDay && (
          <Card title={t('stats.bestDay.label')} theme={theme}>
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
          </Card>
        )}

        {/* Rythme & projection */}
        {stats.weeklyRate > 0 && (
          <Card title={t('stats.rate.section')} theme={theme}>
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
          </Card>
        )}

        {/* Top villes */}
        {topCities.length > 0 && (
          <Card title={t('stats.topCities.section')} theme={theme}>
            {topCities.map((c, i) => (
              <View key={c.code} style={[st.topRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={st.topLeft}>
                  <Text style={[st.topRank, { color: theme.textSecondary }]}>{i + 1}</Text>
                  <Text style={[st.topName, { color: theme.textPrimary }]}>{c.name}</Text>
                </View>
                <View style={st.topRight}>
                  <Text style={[st.topCount, { color: theme.accent }]}>{c.count}</Text>
                  {c.total > 0 && <Text style={[st.topPct, { color: theme.textSecondary }]}>{c.pct.toFixed(0)} %</Text>}
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Top arrondissements (Paris uniquement) */}
        {topDistricts.length > 0 && (
          <Card title={t('stats.topDistricts.section')} theme={theme}>
            {topDistricts.map((d, i) => (
              <View key={d.ar} style={[st.topRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={[st.topLeft, { flex: 1 }]}>
                  <Text style={[st.topRank, { color: theme.textSecondary }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.topName, { color: theme.textPrimary }]}>{arLabel(d.ar)}</Text>
                    <ProgressBar pct={d.pct} theme={theme} />
                  </View>
                </View>
                <View style={[st.topRight, { marginLeft: 12 }]}>
                  <Text style={[st.topCount, { color: theme.accent }]}>{d.flashed}</Text>
                  <Text style={[st.topPct, { color: theme.textSecondary }]}>{d.pct.toFixed(0)} %</Text>
                </View>
              </View>
            ))}
          </Card>
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

  emptyBody:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 20 },
  emptyTitle: { textAlign: 'center', marginBottom: 12 },
  emptyDesc:  { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  vDivider:   { width: StyleSheet.hairlineWidth, height: 56, marginHorizontal: 8 },
  progressSub:{ fontSize: 11, marginTop: 8, textAlign: 'center' },

  grid:    { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },

  toggleRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  toggleBtn:   { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  toggleLabel: { fontSize: 12 },

  streakRow:  { flexDirection: 'row', alignItems: 'center' },
  streakCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  streakNum:  { fontSize: 28, lineHeight: 36 },
  streakUnit: { fontSize: 11, marginTop: 2 },
  streakLabel:{ fontSize: 11, marginTop: 8 },

  bestDayRow: { flexDirection: 'row', alignItems: 'center' },
  bestDayNum: { fontSize: 32, lineHeight: 42 },
  bestDayUnit:{ fontSize: 15, fontWeight: '600' },
  bestDayDate:{ fontSize: 12, marginTop: 3 },

  rateNum:  { fontSize: 14, marginBottom: 8 },
  projText: { fontSize: 13, lineHeight: 20 },
  hint:     { fontSize: 13, lineHeight: 20, fontStyle: 'italic' },

  topRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topRank: { fontSize: 11, width: 16, textAlign: 'center' },
  topName: { fontSize: 13, fontWeight: '500' },
  topRight:{ alignItems: 'flex-end' },
  topCount:{ fontSize: 15, fontWeight: '600' },
  topPct:  { fontSize: 11, marginTop: 1 },
});
