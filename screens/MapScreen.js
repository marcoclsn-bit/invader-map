import { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Platform, Linking, Alert, Animated, ActivityIndicator } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { CITIES, ENABLED_CITIES } from '../cities/registry';
import { ALL_STATUSES } from '../constants';
import InvaderMarker from '../components/InvaderMarker';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

const FLASHED_IMG = require('../assets/markers/alien_flashed.png');
const MARKER_SIZE  = 30;

// ─── Cache de styles thémés (un seul StyleSheet par thème) ───────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

// ─── Logique de filtrage ──────────────────────────────────────────────────────

function applyFilters(invaders, filters, flashed, labels) {
  return invaders.filter((inv) => {
    if (!filters.statuses.has(inv.status)) return false;
    if (filters.flashedState === 'flashed' && !flashed.has(inv.id)) return false;
    if (filters.flashedState === 'unflashed' && flashed.has(inv.id)) return false;
    if (filters.activeLabels.size > 0) {
      const invLabels = labels[inv.id] ?? [];
      if (!invLabels.some((l) => filters.activeLabels.has(l))) return false;
    }
    return true;
  });
}

// ─── Navigation externe ───────────────────────────────────────────────────────

async function openInApp(app, lat, lng) {
  if (app === 'apple') {
    Linking.openURL(`maps://?daddr=${lat},${lng}&dirflg=w`).catch(() => {});
  } else {
    const canUseNative = await Linking.canOpenURL('comgooglemaps://');
    const url = canUseNative
      ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=walking`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    Linking.openURL(url).catch(() => {});
  }
}

// ─── Overlay d'animation flash ────────────────────────────────────────────────
// Rendu en dehors de la MapView (non clippé, non snapshotté).
// Positionné via mapRef.pointForCoordinate → coordonnées relatives au container.

const SCORE_W = 220; // largeur fixe du texte score, centré sur le marqueur

function FlashOverlay({ invader, point, theme, onDone }) {
  const markerScale = useRef(new Animated.Value(1)).current;
  const scoreScale  = useRef(new Animated.Value(0.6)).current;
  const transY      = useRef(new Animated.Value(0)).current;
  const ptsAlpha    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Pop du marqueur : plus prononcé
      Animated.sequence([
        Animated.timing(markerScale, { toValue: 2.1, duration: 120, useNativeDriver: true }),
        Animated.spring(markerScale, { toValue: 1, useNativeDriver: true, damping: 4, stiffness: 260, mass: 0.5 }),
      ]),
      // Score jaune : jaillit (scale 0.6→1.3 avec rebond), reste visible ~1.1 s
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ptsAlpha, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(scoreScale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
            Animated.spring(scoreScale, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 200, mass: 0.6 }),
          ]),
        ]),
        Animated.delay(680),
        Animated.timing(ptsAlpha, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      // Monte bien plus haut
      Animated.timing(transY, { toValue: -110, duration: 1100, useNativeDriver: true }),
    ]).start(onDone);
  }, []);

  const { x, y } = point;
  const half = MARKER_SIZE / 2;

  return (
    <>
      {/* Alien flashé en pop */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: x - half, top: y - half,
          width: MARKER_SIZE, height: MARKER_SIZE,
          transform: [{ scale: markerScale }],
          zIndex: 900,
        }}
      >
        <Image source={FLASHED_IMG} style={{ width: MARKER_SIZE, height: MARKER_SIZE }} resizeMode="contain" fadeDuration={0} />
      </Animated.View>

      {/* Score arcade : jaune, Press Start 2P, ombre sombre pour lisibilité */}
      <Animated.Text
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: SCORE_W,
          left: x - SCORE_W / 2,
          top: y - MARKER_SIZE - 20,
          fontFamily: 'PressStart2P_400Regular',
          fontSize: 22,
          color: theme.accentScore,
          textAlign: 'center',
          textShadowColor: 'rgba(0,0,0,0.85)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 6,
          opacity: ptsAlpha,
          transform: [{ scale: scoreScale }, { translateY: transY }],
          zIndex: 999,
        }}
      >
        {invader.points != null ? `+${invader.points} PTS` : '✓'}
      </Animated.Text>
    </>
  );
}

// ─── Panneau de filtres ───────────────────────────────────────────────────────

function FilterPanel({ filters, onFiltersChange, onClose }) {
  const { labelDefs, statusColors } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);

  function toggleStatus(status) {
    const next = new Set(filters.statuses);
    next.has(status) ? next.delete(status) : next.add(status);
    onFiltersChange({ ...filters, statuses: next });
  }
  function setFlashedState(val) { onFiltersChange({ ...filters, flashedState: val }); }
  function toggleLabelFilter(labelId) {
    const next = new Set(filters.activeLabels);
    next.has(labelId) ? next.delete(labelId) : next.add(labelId);
    onFiltersChange({ ...filters, activeLabels: next });
  }

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelId}>{t('map.filter.title')}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>{t('map.filter.conditionSection')}</Text>
      <View style={styles.chipRow}>
        {ALL_STATUSES.map((status) => {
          const active = filters.statuses.has(status);
          const color = statusColors[status];
          return (
            <TouchableOpacity
              key={status}
              onPress={() => toggleStatus(status)}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: color }
                  : { backgroundColor: theme.surfaceHigh, borderColor: color, borderWidth: 1.5 },
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(`common.status.${status}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{t('map.filter.flashSection')}</Text>
      <View style={styles.chipRow}>
        {[
          { val: 'all', label: t('map.filter.all') },
          { val: 'flashed', label: t('map.filter.flashed') },
          { val: 'unflashed', label: t('map.filter.unflashed') },
        ].map(({ val, label }) => (
          <TouchableOpacity
            key={val}
            onPress={() => setFlashedState(val)}
            style={[styles.chip, filters.flashedState === val && styles.chipActiveNeutral]}
          >
            <Text style={[styles.chipText, filters.flashedState === val && styles.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('map.filter.labelsSection')}</Text>
      {labelDefs.filter((d) => !d.system).length === 0 ? (
        <Text style={styles.emptyNote}>{t('map.filter.noLabels')}</Text>
      ) : (
        <View style={styles.chipRow}>
          {labelDefs.filter((d) => !d.system).map((def) => {
            const active = filters.activeLabels.has(def.id);
            return (
              <TouchableOpacity
                key={def.id}
                onPress={() => toggleLabelFilter(def.id)}
                style={[
                  styles.chip,
                  active
                    ? { backgroundColor: def.color }
                    : { backgroundColor: theme.surfaceHigh, borderColor: def.color, borderWidth: 1.5 },
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{def.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Fiche Invader ────────────────────────────────────────────────────────────

// Ouvre le hashtag Instagram de l'Invader.
// En Expo Go : canOpenURL retourne toujours false (pas de LSApplicationQueriesSchemes)
// → ouvre Safari. En build EAS avec app.json configuré → tente l'app d'abord.
async function openInstagramTag(id) {
  if (!id || !/^[\w]+$/.test(id)) return; // id vide ou format bizarre → on ne fait rien
  const appUrl = `instagram://tag?name=${id}`;
  const webUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(id)}/`;
  const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
  Linking.openURL(canOpen ? appUrl : webUrl).catch(() => Linking.openURL(webUrl));
}

function InvaderPanel({ invader, flashed, onToggleFlash, onNavigate, onClose }) {
  const { labelDefs, statusColors, labels, toggleLabel } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const isFlashed = flashed.has(invader.id);
  const invLabelIds = labels[invader.id] ?? [];

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelId}>{invader.id}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panelRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[invader.status] }]}>
          <Text style={styles.statusText}>{t(`common.status.${invader.status}`) ?? invader.status}</Text>
        </View>
        <Text style={styles.points}>{invader.points != null ? `${invader.points} pts` : '— pts'}</Text>
      </View>

      {invader.hint ? <Text style={styles.hint}>{invader.hint}</Text> : null}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onToggleFlash(invader.id)}
          style={[styles.actionBtn, isFlashed && styles.actionBtnActive]}
        >
          <Text style={[styles.actionBtnText, isFlashed && styles.actionBtnTextActive]}>
            {isFlashed ? t('map.panel.alreadyFlashed') : t('map.panel.markFlashed')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onNavigate(invader.lat, invader.lng)} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>{t('map.panel.navigate')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.igBtn}
        onPress={() => openInstagramTag(invader.id)}
        activeOpacity={0.7}
      >
        <Ionicons name="logo-instagram" size={16} color="#E1306C" />
        <Text style={styles.igBtnText}>{t('map.panel.instagram')}</Text>
      </TouchableOpacity>

      {labelDefs.filter((d) => !d.system).length > 0 && (
        <View style={styles.labelSection}>
          <Text style={styles.labelSectionTitle}>{t('map.panel.labelsTitle')}</Text>
          <View style={styles.labelChips}>
            {labelDefs.filter((d) => !d.system).map((def) => {
              const applied = invLabelIds.includes(def.id);
              return (
                <TouchableOpacity
                  key={def.id}
                  style={[
                    styles.labelChip,
                    applied ? { backgroundColor: def.color } : { borderColor: def.color, borderWidth: 1.5 },
                  ]}
                  onPress={() => toggleLabel(invader.id, def.id)}
                >
                  <Text style={[styles.labelChipText, applied && styles.labelChipTextActive]}>
                    {def.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Écran carte ──────────────────────────────────────────────────────────────

export default function MapScreen({ navigation }) {
  const { invaders, flashed, labels, labelDefs, statusColors, colorOverrides, filters, setFilters, toggleFlash, mapsApp, setMapsAppPref, currentCityCode, isChangingCity } = useAppContext();
  const city = CITIES[currentCityCode] ?? CITIES.PA;
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();

  const mapRef = useRef(null);
  const centeredRef = useRef(false);
  const sortCenterRef = useRef({ lat: city.center.lat, lng: city.center.lng });
  const gpsSortedRef  = useRef(false); // vrai après le 1er tri live (jamais re-triggeré)
  // sortVersion s'incrémente max 2× : cache iOS puis 1re fix live → retrigge le useMemo
  const [sortVersion, setSortVersion] = useState(0);
  const [flashEffect, setFlashEffect] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  function handleNavigate(lat, lng) {
    if (mapsApp) { openInApp(mapsApp, lat, lng); return; }
    Alert.alert(
      t('common.mapsApp.title'),
      t('common.mapsApp.msg'),
      [
        { text: t('common.mapsApp.apple'),  onPress: () => { setMapsAppPref('apple');  openInApp('apple',  lat, lng); } },
        { text: t('common.mapsApp.google'), onPress: () => { setMapsAppPref('google'); openInApp('google', lat, lng); } },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  }

  useEffect(() => {
    let positionSub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setLocationGranted(true);

      // ── Étape A : position du cache iOS (instantanée, max 5 min) ──────────
      // Donne un centre de tri immédiat sans attendre une nouvelle fix GPS.
      try {
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
        if (cached && cached.coords.accuracy < 200) {
          sortCenterRef.current = { lat: cached.coords.latitude, lng: cached.coords.longitude };
          setSortVersion(1); // re-tri immédiat centré sur la dernière position connue
        }
      } catch (_) {}

      // ── Étape B : watch live (fix précise, quelques secondes) ─────────────
      positionSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 8 },
        (loc) => {
          if (loc.coords.accuracy > 40) return;
          const { latitude, longitude } = loc.coords;
          setUserLocation({ latitude, longitude });

          // Re-tri unique sur la 1re fix live précise (jamais répété ensuite)
          if (!gpsSortedRef.current) {
            gpsSortedRef.current = true;
            sortCenterRef.current = { lat: latitude, lng: longitude };
            setSortVersion((v) => v + 1);
          }

          // Centrage carte sur la 1re position (comportement inchangé)
          if (!centeredRef.current) {
            centeredRef.current = true;
            const b = city.bbox;
            const nearCity = latitude >= b.minLat && latitude <= b.maxLat &&
                             longitude >= b.minLng && longitude <= b.maxLng;
            if (nearCity) {
              mapRef.current?.animateToRegion(
                { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
                800
              );
            }
          }
        }
      );
    })();
    return () => { positionSub?.remove(); };
  }, []);

  function goToUserLocation() {
    if (!userLocation) return;
    mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
  }

  function closeAll() { setSelected(null); setShowFilters(false); }

  // Réinitialise l'état local au changement de ville
  // (initialRegion de la nouvelle MapView positionne la carte, pas besoin d'animateToRegion)
  useEffect(() => {
    setSelected(null);
    setShowFilters(false);
    setRenderedCount(INITIAL);
    centeredRef.current  = false;
    gpsSortedRef.current = false;
    sortCenterRef.current = { lat: city.center.lat, lng: city.center.lng };
  }, [currentCityCode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFlashFromMap(id) {
    const willFlash = !flashed.has(id);
    toggleFlash(id);
    if (!willFlash) return; // dé-flash : silencieux, pas d'animation

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const inv = invaders.find((i) => i.id === id);
    if (!inv || !mapRef.current) return;
    try {
      const point = await mapRef.current.pointForCoordinate({ latitude: inv.lat, longitude: inv.lng });
      setFlashEffect({ invader: inv, point, key: Date.now() });
    } catch (_) {}
  }

  const filteredInvaders = useMemo(
    () => applyFilters(invaders, filters, flashed, labels),
    [invaders, filters, flashed, labels]
  );

  // sortVersion en dep : le useMemo re-tourne quand sortCenterRef est mis à jour
  // (max 2×). Flash et GPS continus ne touchent ni filteredInvaders ni sortVersion.
  const sortedInvaders = useMemo(() => {
    const { lat, lng } = sortCenterRef.current;
    return [...filteredInvaders].sort((a, b) => {
      const da = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
      const db = (b.lat - lat) ** 2 + (b.lng - lng) ** 2;
      return da - db;
    });
  }, [filteredInvaders, sortVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const INITIAL = 120;
  const BATCH   = 250;
  const [renderedCount, setRenderedCount] = useState(INITIAL);

  // Reset sur changement de filtre OU re-tri intentionnel — jamais sur flash/GPS.
  useEffect(() => {
    setRenderedCount(INITIAL);
  }, [filters, sortVersion]);

  useEffect(() => {
    if (renderedCount >= sortedInvaders.length) return;
    const id = requestAnimationFrame(() =>
      setRenderedCount(c => Math.min(c + BATCH, sortedInvaders.length))
    );
    return () => cancelAnimationFrame(id);
  }, [renderedCount, sortedInvaders.length]);

  const visibleInvaders = sortedInvaders.slice(0, renderedCount);

  const hasActiveFilters =
    filters.statuses.size < ALL_STATUSES.length ||
    filters.flashedState !== 'all' ||
    filters.activeLabels.size > 0;

  return (
    <View style={styles.container}>
      <MapView
        key={currentCityCode}
        ref={mapRef}
        style={styles.map}
        mapType="mutedStandard"
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        showsCompass={false}
        showsTraffic={false}
        showsPointsOfInterest={false}
        showsUserLocation={locationGranted}
        initialRegion={{ latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta }}
        onPress={closeAll}
      >
        {visibleInvaders.map((invader) => {
          const isFlashed = flashed.has(invader.id);
          return (
            <InvaderMarker
              key={`${invader.id}-${isFlashed ? 1 : 0}`}
              invader={invader}
              isFlashed={isFlashed}
              stopPropagation
              onPress={() => { setSelected(invader); setShowFilters(false); }}
            />
          );
        })}
      </MapView>

      {/* Chip ville — visible seulement si plusieurs villes actives */}
      {ENABLED_CITIES.length > 1 && (
        <TouchableOpacity
          style={[styles.cityChip, { top: insets.top + 10 }]}
          onPress={() => navigation.navigate('Palmarès')}
          activeOpacity={0.75}
        >
          <Ionicons name="globe-outline" size={13} color={theme.textPrimary} />
          <Text style={styles.cityChipText}>{city.name}</Text>
          <Ionicons name="chevron-down" size={11} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Boutons flottants (⚙ en tête de colonne) */}
      <View style={[styles.floatingButtons, { top: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.gearBtn}
          onPress={() => navigation.getParent()?.navigate('Réglages')}
        >
          <Ionicons name="settings-outline" size={20} color={theme.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filtersBtn, hasActiveFilters && styles.filtersBtnActive]}
          onPress={() => { setShowFilters((v) => !v); setSelected(null); }}
        >
          <Text style={[styles.filtersBtnText, hasActiveFilters && styles.filtersBtnTextActive]}>
            {hasActiveFilters ? t('map.filter.titleActive') : t('map.filter.title')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.locateBtn, !userLocation && styles.locateBtnDisabled]}
          onPress={userLocation ? goToUserLocation : undefined}
        >
          <Text style={styles.locateBtnText}>⊙</Text>
        </TouchableOpacity>
      </View>

      {showFilters && (
        <FilterPanel filters={filters} onFiltersChange={setFilters} onClose={() => setShowFilters(false)} />
      )}

      {/* Overlay animation flash — au-dessus de la carte, transparent aux touches */}
      {flashEffect && (
        <FlashOverlay
          key={flashEffect.key}
          invader={flashEffect.invader}
          point={flashEffect.point}
          theme={theme}
          onDone={() => setFlashEffect(null)}
        />
      )}

      {selected && !showFilters && (
        <InvaderPanel
          invader={selected}
          flashed={flashed}
          onToggleFlash={handleFlashFromMap}
          onNavigate={handleNavigate}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Overlay de transition ville — couvre le remontage natif de la MapView */}
      {isChangingCity && (
        <View style={styles.cityTransitionOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.cityTransitionText, { color: theme.textPrimary }]}>
            {city.name}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles thémés ────────────────────────────────────────────────────────────

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },

    cityChip: {
      position: 'absolute', left: 16,
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: t.surface,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    cityChipText: { fontSize: 13, fontWeight: '600', color: t.textPrimary },
    floatingButtons: { position: 'absolute', right: 16, alignItems: 'flex-end', gap: 10 },
    gearBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
    },
    filtersBtn: {
      backgroundColor: t.surface,
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
    },
    filtersBtnActive: { backgroundColor: t.accent },
    filtersBtnText: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
    filtersBtnTextActive: { color: t.bg },
    locateBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
    },
    locateBtnDisabled: { opacity: 0.4 },
    locateBtnText: { fontSize: 20, color: t.textPrimary },

    cityTransitionOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.bg,
      alignItems: 'center', justifyContent: 'center', gap: 14,
    },
    cityTransitionText: { fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },

    panel: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: t.surface,
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40,
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    panelId: { ...typography.arcadeTitle, color: t.textPrimary },
    closeButton: { fontSize: 18, color: t.textSecondary },
    panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    points: { fontSize: 15, color: t.textSecondary },
    hint: { marginTop: 12, fontSize: 14, color: t.textSecondary, fontStyle: 'italic' },
    actions: { marginTop: 16, flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: t.surfaceHigh, alignItems: 'center',
    },
    actionBtnActive: { backgroundColor: t.accent },
    actionBtnText: { fontSize: 14, fontWeight: '500', color: t.textPrimary },
    actionBtnTextActive: { color: t.bg },
    igBtn: {
      marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 7, paddingVertical: 8, borderRadius: 8,
      borderWidth: 1, borderColor: '#E1306C',
    },
    igBtnText: { fontSize: 14, fontWeight: '500', color: '#E1306C' },

    sectionTitle: {
      fontSize: 13, fontWeight: '600', color: t.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: t.surfaceHigh },
    chipActiveNeutral: { backgroundColor: t.accent },
    chipText: { fontSize: 13, fontWeight: '500', color: t.textSecondary },
    chipTextActive: { color: t.bg },
    emptyNote: { fontSize: 13, color: t.textSecondary, fontStyle: 'italic' },

    labelSection: { marginTop: 16 },
    labelSectionTitle: { fontSize: 11, fontWeight: '600', color: t.textSecondary, letterSpacing: 0.5, marginBottom: 8 },
    labelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    labelChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'transparent' },
    labelChipText: { fontSize: 13, fontWeight: '500', color: t.textPrimary },
    labelChipTextActive: { color: '#fff' },
  });
}
