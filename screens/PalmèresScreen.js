import { useMemo, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { INVADERS } from '../data/invaders';
import { useAppContext } from '../context/AppContext';
import { INVADER_DISTRICT, arLabel, ARRONDISSEMENT_CENTERS } from '../utils/arrondissement';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

// Les détruits sont exclus partout : on ne peut pas les flasher → jamais comptés
const FLASHABLE = INVADERS.filter(inv => inv.status !== 'destroyed');
const TOTAL_ALL_PTS = FLASHABLE.reduce((s, inv) => s + inv.points, 0);

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
  const styles = getStyles(theme);
  const pct = item.total > 0 ? (item.flashed / item.total) * 100 : 0;

  return (
    <TouchableOpacity style={styles.arRow} onPress={onHunt} activeOpacity={0.7}>
      <View style={styles.arTitleRow}>
        <Text style={styles.arName}>{arLabel(item.ar)}</Text>
        <View style={styles.chasserCTA}>
          <Text style={styles.chasserText}>Chasser ici</Text>
          <Ionicons name="chevron-forward" size={13} color={theme.accent} />
        </View>
      </View>
      <ProgressBar pct={pct} theme={theme} />
      <Text style={styles.arStat}>
        {item.flashed}/{item.total} flashés · {pct.toFixed(0)} % · {item.totalPts} pts
      </Text>
    </TouchableOpacity>
  );
}

// ─── Vue arrondissements ──────────────────────────────────────────────────────

function ArrondissementsView({ stats, insets, onBack, onSettings, onHuntAr, theme }) {
  const styles = getStyles(theme);
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paris</Text>
        <TouchableOpacity onPress={onSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>
          {stats.flashed} / {stats.total} flashés · {stats.flashedPts} / {stats.totalPts} pts
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

export default function PalmèresScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { flashed } = useAppContext();
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [drillVille, setDrillVille] = useState(null);

  const stats = useMemo(() => {
    let totalFlashed = 0;
    let totalFlashedPts = 0;
    const byAr = new Map();
    for (let ar = 1; ar <= 20; ar++) {
      byAr.set(ar, { ar, total: 0, flashed: 0, totalPts: 0, flashedPts: 0 });
    }
    for (const inv of FLASHABLE) {
      const isFlashed = flashed.has(inv.id);
      if (isFlashed) { totalFlashed++; totalFlashedPts += inv.points; }
      const ar = INVADER_DISTRICT.get(inv.id);
      if (ar) {
        const s = byAr.get(ar);
        if (s) {
          s.total++;
          s.totalPts += inv.points;
          if (isFlashed) { s.flashed++; s.flashedPts += inv.points; }
        }
      }
    }
    const pct = FLASHABLE.length > 0 ? (totalFlashed / FLASHABLE.length) * 100 : 0;
    return {
      total: FLASHABLE.length,
      flashed: totalFlashed,
      totalPts: TOTAL_ALL_PTS,
      flashedPts: totalFlashedPts,
      pct,
      arrondissements: Array.from(byAr.values()).sort((a, b) => a.ar - b.ar),
    };
  }, [flashed]);

  function openSettings() { navigation.getParent()?.navigate('Réglages'); }

  function huntAr(ar) {
    const center = ARRONDISSEMENT_CENTERS.get(ar);
    if (!center) return;
    navigation.navigate('Chasse', {
      arPreset: { ar, label: arLabel(ar), lon: center.lon, lat: center.lat, _ts: Date.now() },
    });
  }

  if (drillVille === 'Paris') {
    return (
      <ArrondissementsView
        stats={stats}
        insets={insets}
        onBack={() => setDrillVille(null)}
        onSettings={openSettings}
        onHuntAr={huntAr}
        theme={theme}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Palmarès</Text>
        <TouchableOpacity onPress={openSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>
          {stats.flashed} / {stats.total} Invaders flashés · {stats.flashedPts} pts
        </Text>
        <ProgressBar pct={stats.pct} theme={theme} />
        <Text style={styles.summaryPct}>{stats.pct.toFixed(1)} %</Text>
      </View>

      <TouchableOpacity style={styles.villeCard} onPress={() => setDrillVille('Paris')} activeOpacity={0.7}>
        <View style={styles.villeLeft}>
          <View style={styles.villeIcon}>
            <Ionicons name="business-outline" size={22} color={theme.accent} />
          </View>
          <View>
            <Text style={styles.villeName}>Paris</Text>
            <Text style={styles.villeSub}>
              {stats.flashed}/{stats.total} · {stats.pct.toFixed(0)} % · {stats.flashedPts} pts
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </TouchableOpacity>
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

    villeCard: {
      marginHorizontal: 16, backgroundColor: t.surface, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    },
    villeLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    villeIcon: {
      width: 42, height: 42, borderRadius: 12,
      backgroundColor: t.accentDim, alignItems: 'center', justifyContent: 'center',
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
  });
}
