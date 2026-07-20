import { useMemo, useState, useEffect, Fragment } from 'react';
import { StyleSheet, View, Text, FlatList, ScrollView, TouchableOpacity, TextInput } from 'react-native';
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

// Normalisation pour la recherche (insensible casse + accents : « Genève » ↔ « geneve »)
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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

// Barre segmentée : vert = flashés · gris = restants · rouge sombre = détruits
// jamais flashés (façon barre de stockage iPhone).
function SegmentedBar({ flashed, remaining, destroyed, theme, height = 10 }) {
  const styles = getStyles(theme);
  const total = flashed + remaining + destroyed;
  if (total <= 0) return <View style={[styles.track, { height }]} />;
  return (
    <View style={[styles.track, { height, flexDirection: 'row' }]}>
      {flashed > 0 && <View style={{ flex: flashed, backgroundColor: theme.accent }} />}
      {remaining > 0 && <View style={{ flex: remaining }} />}
      {destroyed > 0 && <View style={{ flex: destroyed, backgroundColor: `${theme.destructive}66` }} />}
    </View>
  );
}

// Légende à pastilles sous la barre segmentée.
function ProgressLegend({ flashed, remaining, destroyed, theme }) {
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: theme.accent }]} />
        <Text style={styles.legendText}><Text style={styles.legendNum}>{flashed}</Text> {t('palmares.legendFlashed')}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: theme.border }]} />
        <Text style={styles.legendText}><Text style={styles.legendNum}>{remaining}</Text> {t('palmares.legendRemaining')}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: `${theme.destructive}66` }]} />
        <Text style={styles.legendText}><Text style={styles.legendNum}>{destroyed}</Text> {t('palmares.legendDestroyed')}</Text>
      </View>
    </View>
  );
}

// Badge « ✓ Complète » (100 % du flashable).
function CompleteBadge({ theme }) {
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <View style={styles.completePill}>
      <Ionicons name="checkmark" size={11} color={theme.accent} />
      <Text style={styles.completePillText}>{t('palmares.completeBadge')}</Text>
    </View>
  );
}

// ─── Ligne arrondissement ─────────────────────────────────────────────────────

function ArRow({ item, onHunt, theme }) {
  const { t } = useTranslation();
  const styles = getStyles(theme);

  return (
    <TouchableOpacity style={styles.arRow} onPress={onHunt} activeOpacity={0.7}>
      <View style={styles.arTitleRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Text style={styles.arName}>{arLabel(item.ar)}</Text>
          {item.complete && <CompleteBadge theme={theme} />}
        </View>
        <View style={styles.chasserCTA}>
          <Text style={styles.chasserText}>{t('palmares.huntHere')}</Text>
          <Ionicons name="chevron-forward" size={13} color={theme.accent} />
        </View>
      </View>
      <SegmentedBar
        flashed={item.flashed} remaining={item.remaining} destroyed={item.destroyedLost}
        theme={theme} height={8}
      />
      <Text style={styles.arStat}>
        {t('palmares.arStat', { flashed: item.flashed, total: item.denominator, pct: item.pct.toFixed(0), pts: item.denomPts })}
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
        <View style={styles.summaryTopRow}>
          <Text style={[styles.summaryLabel, { flex: 1, marginBottom: 0 }]}>
            {t('palmares.detailSummary', { flashed: stats.flashed, total: stats.denominator, pts: `${stats.flashedPts} / ${stats.denomPts}` })}
          </Text>
          {stats.complete && <CompleteBadge theme={theme} />}
        </View>
        <SegmentedBar
          flashed={stats.flashed} remaining={stats.remaining} destroyed={stats.destroyedLost}
          theme={theme}
        />
        <ProgressLegend
          flashed={stats.flashed} remaining={stats.remaining} destroyed={stats.destroyedLost}
          theme={theme}
        />
        <View style={styles.summaryFootRow}>
          <Text style={styles.totalPosed}>{t('palmares.totalPosed', { count: stats.posed })}</Text>
          <Text style={[styles.summaryPct, { marginTop: 0 }]}>{stats.pct.toFixed(1)} %</Text>
        </View>
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
  const { invaders, flashed, currentCityCode, setCurrentCity, cityIndex, isChangingCity } = useAppContext();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || 'fr';
  const styles = getStyles(theme);
  const [drillVille, setDrillVille] = useState(null);
  const [search, setSearch] = useState('');

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

  // Progression « juste » : un détruit jamais flashé ne compte pas contre toi,
  // mais un détruit que TU avais flashé reste acquis (collection + points).
  //   % = flashés ÷ (flashables + détruits que tu avais flashés)
  const stats = useMemo(() => {
    const mkZone = () => ({ posed: 0, destroyed: 0, flashed: 0, flashedDestroyed: 0, flashedPts: 0, denomPts: 0 });
    const g = mkZone();
    const byAr = new Map();
    for (let ar = 1; ar <= 20; ar++) byAr.set(ar, { ar, ...mkZone() });

    for (const inv of invaders) {
      const isFlashed = flashed.has(inv.id);
      const isDestroyed = inv.status === 'destroyed';
      const pts = inv.points ?? 0;
      const ar = INVADER_DISTRICT.get(inv.id);
      const arZone = ar ? byAr.get(ar) : null;
      for (const z of arZone ? [g, arZone] : [g]) {
        z.posed++;
        if (isDestroyed) z.destroyed++;
        if (isFlashed) {
          z.flashed++;
          z.flashedPts += pts;
          if (isDestroyed) z.flashedDestroyed++;
        }
        if (!isDestroyed || isFlashed) z.denomPts += pts; // points du dénominateur
      }
    }

    const finish = (z) => {
      const flashables = z.posed - z.destroyed;
      const denominator = flashables + z.flashedDestroyed;
      const remaining = Math.max(0, denominator - z.flashed);
      const destroyedLost = z.destroyed - z.flashedDestroyed; // jamais flashés → hors calcul
      const pct = denominator > 0 ? (z.flashed / denominator) * 100 : 0;
      const complete = denominator > 0 && remaining === 0;
      return { ...z, flashables, denominator, remaining, destroyedLost, pct, complete };
    };

    const global = finish(g);
    return {
      ...global,
      // alias rétro-compatibles pour les libellés existants
      total: global.denominator,
      totalPts: global.denomPts,
      arrondissements: Array.from(byAr.values()).map(finish).sort((a, b) => a.ar - b.ar),
    };
  }, [invaders, flashed]);

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

  // Carte d'une ville (réutilisée : ville en cours, liste groupée, résultats de recherche)
  function renderCityCard(c) {
    const isActive = c.code === currentCityCode;
    const cityInfo = cityIndex.find(ci => ci.code === c.code);
    const cityTotal = cityInfo?.count ?? null;
    const flashedHere = flashedByCity.get(c.code) ?? 0;
    // Villes non actives : même philosophie que la formule exacte, à partir de
    // l'index (count/destroyed). Les « détruits que tu avais flashés » ne sont
    // connus que pour la ville active → max() évite tout dépassement de 100 %.
    const cityDenominator = cityTotal !== null
      ? Math.max(Math.max(0, cityTotal - (cityInfo?.destroyed ?? 0)), flashedHere)
      : null;
    const pct = isActive
      ? stats.pct
      : (cityDenominator ? Math.min(100, (flashedHere / cityDenominator) * 100) : 0);
    const complete = isActive
      ? stats.complete
      : (cityDenominator !== null && cityDenominator > 0 && flashedHere >= cityDenominator);
    // Détail pour la barre segmentée (ville active = chiffres exacts, sinon index)
    const barFlashed = isActive ? stats.flashed : flashedHere;
    const barRemaining = isActive
      ? stats.remaining
      : (cityDenominator !== null ? Math.max(0, cityDenominator - flashedHere) : 0);
    const barDestroyed = isActive ? stats.destroyedLost : (cityInfo?.destroyed ?? 0);
    return (
      <View key={c.code} style={styles.villeBlock}>
        <TouchableOpacity
          style={[styles.villeCard, isActive && { borderColor: theme.accent, borderWidth: 1.5 }]}
          onPress={() => {
            if (isChangingCity || isActive) return;
            setCurrentCity(c.code);
            navigation.navigate('Tabs', { screen: 'Carte' }); // Carte = onglet imbriqué dans "Tabs"
          }}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.villeNameRow}>
              <Text style={styles.villeName} numberOfLines={1}>{c.name}</Text>
              {complete && <CompleteBadge theme={theme} />}
              <View style={{ flex: 1 }} />
              <Text style={styles.villePct}>{pct.toFixed(0)} %</Text>
              {isActive
                ? <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                : <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
            </View>
            {cityDenominator !== null || isActive ? (
              <>
                <SegmentedBar
                  flashed={barFlashed} remaining={barRemaining} destroyed={barDestroyed}
                  theme={theme} height={8}
                />
                <ProgressLegend
                  flashed={barFlashed} remaining={barRemaining} destroyed={barDestroyed}
                  theme={theme}
                />
              </>
            ) : (
              <Text style={styles.villeSub}>…</Text>
            )}
          </View>
        </TouchableOpacity>

        {isActive && c.subdivisionsKey && (
          <TouchableOpacity style={styles.districtLink} onPress={() => setDrillVille(c.code)} activeOpacity={0.7}>
            <Ionicons name="grid-outline" size={14} color={theme.accent} />
            <Text style={[styles.districtLinkText, { color: theme.accent }]}>{t('palmares.viewByDistrict')}</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.accent} />
          </TouchableOpacity>
        )}
      </View>
    );
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

  const q = norm(search.trim());
  const searchResults = q
    ? ENABLED_CITIES.filter(c => norm(c.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name))
    : null;
  const currentCity = ENABLED_CITIES.find(c => c.code === currentCityCode);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={openDrawer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="menu" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('palmares.title')}</Text>
        </View>
      </View>

      {/* Barre de recherche de ville */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={theme.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('palmares.searchPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">

        {searchResults ? (
          /* ── Résultats de recherche (liste plate) ── */
          searchResults.length > 0
            ? searchResults.map(renderCityCard)
            : <Text style={styles.noResults}>{t('palmares.noResults')}</Text>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryTopRow}>
                <Text style={[styles.summaryLabel, { flex: 1, marginBottom: 0 }]}>
                  {t('palmares.flashedSummary', { flashed: stats.flashed, total: stats.denominator, pts: stats.flashedPts })}
                </Text>
                {stats.complete && <CompleteBadge theme={theme} />}
              </View>
              <SegmentedBar
                flashed={stats.flashed} remaining={stats.remaining} destroyed={stats.destroyedLost}
                theme={theme}
              />
              <ProgressLegend
                flashed={stats.flashed} remaining={stats.remaining} destroyed={stats.destroyedLost}
                theme={theme}
              />
              <View style={styles.summaryFootRow}>
                <Text style={styles.totalPosed}>{t('palmares.totalPosed', { count: stats.posed })}</Text>
                <Text style={[styles.summaryPct, { marginTop: 0 }]}>{stats.pct.toFixed(1)} %</Text>
              </View>
              {stats.destroyedLost > 0 && (
                <Text style={styles.calcHint}>{t('palmares.calcHint')}</Text>
              )}
            </View>

            {/* Carte en cours en tête */}
            {currentCity && (
              <>
                <Text style={styles.countryHeader}>{t('palmares.currentCity')}</Text>
                {renderCityCard(currentCity)}
              </>
            )}

            {/* Villes groupées par pays (France d'abord), sans la ville en cours */}
            {countryGroups.map((group) => {
              const cities = group.cities.filter(c => c.code !== currentCityCode);
              if (cities.length === 0) return null;
              return (
                <Fragment key={group.code}>
                  <Text style={styles.countryHeader}>{group.name.toUpperCase()}</Text>
                  {cities.map(renderCityCard)}
                </Fragment>
              );
            })}
          </>
        )}

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
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    title: { ...typography.arcadeTitle, color: t.textPrimary },
    headerTitle: { ...typography.arcadeTitle, color: t.textPrimary },

    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: t.surfaceHigh, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9,
    },
    searchInput: { flex: 1, fontSize: 15, color: t.textPrimary, padding: 0 },
    noResults: { fontSize: 15, color: t.textSecondary, textAlign: 'center', marginTop: 32 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70 },
    backText: { fontSize: 16, color: t.accent, fontWeight: '500' },

    summaryCard: {
      margin: 16, backgroundColor: t.surface, borderRadius: 14, padding: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    },
    summaryLabel: { fontSize: 14, color: t.textSecondary, marginBottom: 10 },
    summaryPct: { ...typography.arcadeScore, color: t.accent, marginTop: 8, textAlign: 'right' },
    summaryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    summaryFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },

    track: { height: 8, borderRadius: 4, backgroundColor: t.border, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 4 },

    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 9, height: 9, borderRadius: 5 },
    legendText: { fontSize: 12.5, color: t.textSecondary },
    legendNum: { color: t.textPrimary, fontWeight: '600' },
    totalPosed: { fontSize: 12, color: t.textSecondary },
    calcHint: { fontSize: 11.5, color: t.textSecondary, marginTop: 8, fontStyle: 'italic', lineHeight: 15 },

    completePill: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: t.accentDim, borderColor: t.accent, borderWidth: 1,
      borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
    },
    completePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: t.accent, textTransform: 'uppercase' },

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
    villeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    villePct: { ...typography.arcadeHeading, fontSize: 13, color: t.accent, marginRight: 2 },
    countryHeader: {
      ...typography.arcadeHeading, fontSize: 12, color: t.textSecondary,
      marginHorizontal: 20, marginTop: 18, marginBottom: 8, letterSpacing: 0.5,
    },
    villeName: { ...typography.arcadeHeading, color: t.textPrimary, flexShrink: 1 },
    villeSub: { fontSize: 13, color: t.textSecondary, marginTop: 2 },

    arRow: { backgroundColor: t.surface, paddingHorizontal: 20, paddingVertical: 14 },
    arTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    arName: { ...typography.arcadeHeading, color: t.textPrimary },
    chasserCTA: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    chasserText: { fontSize: 13, color: t.accent, fontWeight: '500' },
    arStat: { fontSize: 12, color: t.textSecondary, marginTop: 6 },

    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border },
  });
}
