import { useMemo, useState, useEffect, Fragment } from 'react';
import { StyleSheet, View, Text, FlatList, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { CITIES, ENABLED_CITIES } from '../cities/registry';
import { countryCodeOf, countryName } from '../cities/countries';
import { INVADER_DISTRICT, arLabel, ARRONDISSEMENT_CENTERS } from '../utils/arrondissement';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import DonutChart from '../components/DonutChart';

function formatCountdown(s) {
  if (s <= 0) return '0 s';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} s`;
  return `${m} min ${sec < 10 ? '0' : ''}${sec} s`;
}

// ─── Cache de styles thémés ───────────────────────────────────────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

// ─── Barre de progression ─────────────────────────────────────────────────────

function ProgressBar({ pct, theme }) {
  const styles = getStyles(theme);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: theme.accent }]} />
    </View>
  );
}

// ─── Ligne arrondissement ─────────────────────────────────────────────────────

function ArRow({ item, onHunt, theme }) {
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const pct = item.total > 0 ? (item.flashed / item.total) * 100 : 0;

  return (
    <TouchableOpacity style={styles.arRow} onPress={onHunt} activeOpacity={0.7}>
      <View style={styles.arTitleRow}>
        <Text style={styles.arName}>{arLabel(item.ar)}</Text>
        <View style={styles.chasserCTA}>
          <Text style={styles.chasserText}>{t('palmares.huntHere')}</Text>
          <Ionicons name="chevron-forward" size={13} color={theme.accent} />
        </View>
      </View>
      <ProgressBar pct={pct} theme={theme} />
      <Text style={styles.arStat}>
        {t('palmares.arStat', { flashed: item.flashed, total: item.total, pct: pct.toFixed(0), pts: item.totalPts })}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Vue arrondissements ──────────────────────────────────────────────────────

function ArrondissementsView({ stats, insets, onBack, onOpenDrawer, onHuntAr, theme }) {
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={styles.backText}>{t('palmares.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('palmares.paris')}</Text>
        <TouchableOpacity onPress={onOpenDrawer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="menu" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>
          {t('palmares.detailSummary', { flashed: stats.flashed, total: stats.total, pts: `${stats.flashedPts} / ${stats.totalPts}` })}
        </Text>
        <ProgressBar pct={stats.pct} theme={theme} />
        <Text style={styles.summaryPct}>{stats.pct.toFixed(1)} %</Text>
      </View>

      <FlatList
        data={stats.arrondissements}
        keyExtractor={item => String(item.ar)}
        renderItem={({ item }) => <ArRow item={item} onHunt={() => onHuntAr(item.ar)} theme={theme} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      />
    </View>
  );
}

// ─── Écran Palmarès ───────────────────────────────────────────────────────────

export default function PalmaresScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { invaders, flashed, currentCityCode, setCurrentCity, cityIndex, isChangingCity, mapLockUntil } = useAppContext();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || 'fr';
  const styles = getStyles(theme);
  const [drillVille, setDrillVille] = useState(null);

  // Nombre de flashés par ville (déduit du préfixe des ids : PA_649 → PA)
  const flashedByCity = useMemo(() => {
    const m = new Map();
    for (const id of flashed) {
      const i = id.lastIndexOf('_');
      const code = i > 0 ? id.slice(0, i) : id;
      m.set(code, (m.get(code) ?? 0) + 1);
    }
    return m;
  }, [flashed]);

  // Villes groupées par pays : France d'abord, puis pays par nom, « Autres » en dernier
  const countryGroups = useMemo(() => {
    const groups = new Map(); // code pays -> villes
    for (const c of ENABLED_CITIES) {
      const cc = countryCodeOf(c) || '_OTHER';
      if (!groups.has(cc)) groups.set(cc, []);
      groups.get(cc).push(c);
    }
    const ordered = [...groups.entries()].map(([code, cities]) => ({
      code,
      name: code === '_OTHER' ? countryName(null, lang) : countryName(code, lang),
      cities: cities.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
    ordered.sort((a, b) => {
      if (a.code === 'FR') return -1;            // France toujours en tête
      if (b.code === 'FR') return 1;
      if (a.code === '_OTHER') return 1;         // « Autres » en dernier
      if (b.code === '_OTHER') return -1;
      return a.name.localeCompare(b.name);
    });
    return ordered;
  }, [lang]);

  // Countdown de verrouillage
  const [now, setNow] = useState(() => Date.now());
  const isLocked = now < mapLockUntil;
  const remainingSeconds = Math.max(0, Math.ceil((mapLockUntil - now) / 1000));

  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLocked, mapLockUntil]);

  // Les détruits sont exclus : on ne peut pas les flasher
  const flashable = useMemo(
    () => invaders.filter(inv => inv.status !== 'destroyed'),
    [invaders]
  );
  const totalAllPts = useMemo(
    () => flashable.reduce((s, inv) => s + (inv.points ?? 0), 0),
    [flashable]
  );

  const stats = useMemo(() => {
    let totalFlashed = 0;
    let totalFlashedPts = 0;
    const byAr = new Map();
    for (let ar = 1; ar <= 20; ar++) {
      byAr.set(ar, { ar, total: 0, flashed: 0, totalPts: 0, flashedPts: 0 });
    }
    for (const inv of flashable) {
      const isFlashed = flashed.has(inv.id);
      const pts = inv.points ?? 0;
      if (isFlashed) { totalFlashed++; totalFlashedPts += pts; }
      const ar = INVADER_DISTRICT.get(inv.id);
      if (ar) {
        const s = byAr.get(ar);
        if (s) {
          s.total++;
          s.totalPts += pts;
          if (isFlashed) { s.flashed++; s.flashedPts += pts; }
        }
      }
    }
    const pct = flashable.length > 0 ? (totalFlashed / flashable.length) * 100 : 0;
    return {
      total: flashable.length,
      flashed: totalFlashed,
      totalPts: totalAllPts,
      flashedPts: totalFlashedPts,
      pct,
      arrondissements: Array.from(byAr.values()).sort((a, b) => a.ar - b.ar),
    };
  }, [flashable, totalAllPts, flashed]);

  function openDrawer() { navigation.dispatch(DrawerActions.openDrawer()); }

  function huntAr(ar) {
    const center = ARRONDISSEMENT_CENTERS.get(ar);
    if (!center) return;
    // Palmarès est un écran Drawer ; Chasse est imbriqué dans l'écran "Tabs"
    navigation.navigate('Tabs', {
      screen: 'Chasse',
      params: { arPreset: { ar, label: arLabel(ar), lon: center.lon, lat: center.lat, _ts: Date.now() } },
    });
  }

  // Drill-down : ville avec subdivisions (arrondissements pour Paris)
  if (drillVille && CITIES[drillVille]?.subdivisionsKey) {
    return (
      <ArrondissementsView
        stats={stats}
        insets={insets}
        onBack={() => setDrillVille(null)}
        onOpenDrawer={openDrawer}
        onHuntAr={huntAr}
        theme={theme}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('palmares.title')}</Text>
        <TouchableOpacity onPress={openDrawer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="menu" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>
          {t('palmares.flashedSummary', { flashed: stats.flashed, total: stats.total, pts: stats.flashedPts })}
        </Text>
        <ProgressBar pct={stats.pct} theme={theme} />
        <Text style={styles.summaryPct}>{stats.pct.toFixed(1)} %</Text>
      </View>

      {/* Bannière de chargement (pendant le verrou de changement de ville) */}
      {isLocked && (
        <View style={[styles.lockBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
          <Text style={[styles.lockBannerText, { color: theme.textSecondary }]}>
            {t('palmares.loadingBanner', { countdown: formatCountdown(remainingSeconds) })}
          </Text>
        </View>
      )}

      {/* Villes groupées par pays (France d'abord) */}
      {countryGroups.map((group) => (
        <Fragment key={group.code}>
          <Text style={styles.countryHeader}>{group.name.toUpperCase()}</Text>
          {group.cities.map((c) => {
            const isActive = c.code === currentCityCode;
            const cityInfo = cityIndex.find(ci => ci.code === c.code);
            const cityTotal = cityInfo?.count ?? null;
            const flashedHere = flashedByCity.get(c.code) ?? 0;
            const pct = isActive
              ? stats.pct
              : (cityTotal ? (flashedHere / cityTotal) * 100 : 0);
            return (
              <View key={c.code} style={styles.villeBlock}>
                <TouchableOpacity
                  style={[
                    styles.villeCard,
                    isActive && { borderColor: theme.accent, borderWidth: 1.5 },
                    !isActive && isLocked && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    if (isChangingCity || isActive || isLocked) return;
                    setCurrentCity(c.code);
                    // Carte est un onglet imbriqué dans "Tabs" (pas une route du Drawer)
                    navigation.navigate('Tabs', { screen: 'Carte' });
                  }}
                  activeOpacity={!isActive && isLocked ? 1 : 0.7}
                >
                  <View style={styles.villeLeft}>
                    <DonutChart
                      pct={pct}
                      size={46}
                      stroke={5}
                      color={theme.accent}
                      trackColor={theme.border}
                      textColor={theme.textPrimary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.villeName}>{c.name}</Text>
                      <Text style={styles.villeSub}>
                        {isActive
                          ? t('palmares.villeCard', { flashed: stats.flashed, total: stats.total, pct: stats.pct.toFixed(0), pts: stats.flashedPts })
                          : cityTotal !== null
                            ? t('palmares.villeCardProgress', { flashed: flashedHere, total: cityTotal })
                            : '…'
                        }
                      </Text>
                    </View>
                  </View>
                  {isActive
                    ? <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                    : <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  }
                </TouchableOpacity>

                {isActive && c.subdivisionsKey && (
                  <TouchableOpacity
                    style={styles.districtLink}
                    onPress={() => setDrillVille(c.code)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="grid-outline" size={14} color={theme.accent} />
                    <Text style={[styles.districtLinkText, { color: theme.accent }]}>
                      {t('palmares.viewByDistrict')}
                    </Text>
                    <Ionicons name="chevron-forward" size={13} color={theme.accent} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </Fragment>
      ))}

      </ScrollView>
    </View>
  );
}

// ─── Styles thémés ────────────────────────────────────────────────────────────

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      backgroundColor: t.surface,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    title: { ...typography.arcadeTitle, color: t.textPrimary },
    headerTitle: { ...typography.arcadeTitle, color: t.textPrimary },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70 },
    backText: { fontSize: 16, color: t.accent, fontWeight: '500' },

    summaryCard: {
      margin: 16, backgroundColor: t.surface, borderRadius: 14, padding: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    },
    summaryLabel: { fontSize: 14, color: t.textSecondary, marginBottom: 10 },
    summaryPct: { ...typography.arcadeScore, color: t.accent, marginTop: 8, textAlign: 'right' },

    track: { height: 8, borderRadius: 4, backgroundColor: t.border, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 4 },

    villeBlock: { marginHorizontal: 16, marginBottom: 12 },
    villeCard: {
      backgroundColor: t.surface, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    },
    districtLink: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 9, marginTop: 6,
      alignSelf: 'flex-start',
    },
    districtLinkText: { fontSize: 13, fontWeight: '500' },
    villeLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, marginRight: 10 },
    countryHeader: {
      ...typography.arcadeHeading, fontSize: 12, color: t.textSecondary,
      marginHorizontal: 20, marginTop: 18, marginBottom: 8, letterSpacing: 0.5,
    },
    villeName: { ...typography.arcadeHeading, color: t.textPrimary },
    villeSub: { fontSize: 13, color: t.textSecondary, marginTop: 2 },

    arRow: { backgroundColor: t.surface, paddingHorizontal: 20, paddingVertical: 14 },
    arTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    arName: { ...typography.arcadeHeading, color: t.textPrimary },
    chasserCTA: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    chasserText: { fontSize: 13, color: t.accent, fontWeight: '500' },
    arStat: { fontSize: 12, color: t.textSecondary, marginTop: 6 },

    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border },

    lockBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 20, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    lockBannerText: { fontSize: 13 },
  });
}
