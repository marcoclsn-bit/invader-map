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
import { computeHunterProfile } from '../utils/hunterProfile';
import ProfileHeader from '../components/profile/ProfileHeader';
import HunterSlider from '../components/profile/HunterSlider';
import SegmentDonut from '../components/profile/SegmentDonut';
import AreaChart from '../components/profile/AreaChart';
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
  const cityFlashable = invaders.filter(inv => inv.status !== 'destroyed').length;
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
  const { flashed, flashedDates, getFlashHistory, invaders, currentCityCode, cityIndex } = useAppContext();
  const [chartMode, setChartMode] = useState('count');

  const flashHistory = useMemo(() => getFlashHistory(), [flashed, flashedDates]);

  const stats = useMemo(
    () => computeStats({ flashHistory, invaders, currentCityCode }),
    [flashHistory, invaders, currentCityCode]
  );
  const profile = useMemo(
    () => computeHunterProfile({ flashHistory, invaders, cityIndex, currentCityCode }),
    [flashHistory, invaders, cityIndex, currentCityCode]
  );

  function openDrawer() { navigation.dispatch(DrawerActions.openDrawer()); }

  const cityName = CITIES[currentCityCode]?.name ?? currentCityCode;
  const hasDated = stats.datedCount > 0;
  const cityPct = stats.cityFlashable > 0
    ? ((stats.cityFlashedHere / stats.cityFlashable) * 100).toFixed(0)
    : '0';
  const chartWidth = width - 64; // marges (16×2) + padding carte (16×2)

  const Header = (
    <View style={[st.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <Text style={[typography.arcadeTitle, { color: theme.textPrimary }]}>{t('stats.title')}</Text>
      <TouchableOpacity onPress={openDrawer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="menu" size={24} color={theme.textSecondary} />
      </TouchableOpacity>
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
  const curvePoints = series.points.map(p => ({ key: p.key, cum: chartMode === 'count' ? p.cum : p.cumPts }));

  const sliderDefs = [
    { k: 'rarity', d: profile.sliders.rarity },
    { k: 'geography', d: profile.sliders.geography },
    { k: 'assiduity', d: profile.sliders.assiduity },
  ];

  return (
    <View style={[st.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {Header}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16, paddingHorizontal: 16 }}>

        {/* En-tête profil (local) */}
        <ProfileHeader honorific={profile.honorific} total={stats.total} />

        {/* Résumé global */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
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
        </View>

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
              />
            ))
          ) : (
            <Hint theme={theme}>{t('stats.profile.empty.sliders')}</Hint>
          )}
        </View>

        {/* Galerie de trophées */}
        <BadgeGallery />

        {/* Donut géographie */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.profile.geo.title').toUpperCase()}</Text>
          {geo.available ? (
            <>
              <View style={{ alignItems: 'center' }}>
                <SegmentDonut
                  segments={geoSegs.map(s => ({ value: s.count, color: s.color }))}
                  size={140} stroke={18} trackColor={theme.border}
                  centerLabel={`${geoSegs[0]?.pct ?? 0}%`} centerSub={geoSegs[0]?.label}
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
            </>
          ) : (
            <Hint theme={theme}>{t('stats.profile.empty.dayNight')}</Hint>
          )}
        </View>

        {/* Courbe cumulative */}
        <View style={[cardStyles.wrap, { backgroundColor: theme.surface, marginHorizontal: 0 }]}>
          <Text style={[cardStyles.title, { color: theme.textSecondary }]}>{t('stats.profile.curve.title').toUpperCase()}</Text>
          {series.available ? (
            <>
              <View style={st.toggleRow}>
                {[
                  { key: 'count', label: t('stats.chart.toggleCount') },
                  { key: 'pts', label: `${t('stats.chart.togglePts')} (${cityName})` },
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
              <AreaChart
                points={curvePoints}
                width={chartWidth}
                accent={theme.accent}
                textSec={theme.textSecondary}
                border={theme.border}
                unit={series.unit}
              />
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

  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 20 },
  emptyTitle: { textAlign: 'center', marginBottom: 12 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },

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
