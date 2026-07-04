import { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Platform, Alert, Animated, ActivityIndicator } from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { CITIES, ENABLED_CITIES } from '../cities/registry';
import { ALL_STATUSES } from '../constants';
import InvaderMarker from '../components/InvaderMarker';
import Legend from '../components/Legend';
import InvaderPanel from '../components/InvaderPanel';
import HeadingCone from '../components/HeadingCone';
import { useTheme } from '../theme/ThemeContext';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '../theme/mapStyle';
import { typography } from '../theme/tokens';
import { openNavigationApp } from '../utils/navigation';

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

function applyFilters(invaders, filters, flashed) {
  return invaders.filter((inv) => {
    if (!filters.statuses.has(inv.status)) return false;
    if (filters.flashedState === 'flashed' && !flashed.has(inv.id)) return false;
    if (filters.flashedState === 'unflashed' && flashed.has(inv.id)) return false;
    return true;
  });
}

// ─── Navigation externe ───────────────────────────────────────────────────────

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

function formatCountdown(s) {
  if (s <= 0) return '0 s';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} s`;
  return `${m} min ${sec < 10 ? '0' : ''}${sec} s`;
}

function FilterPanel({ filters, onFiltersChange, onClose }) {
  const { statusColors } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);

  function toggleStatus(status) {
    const next = new Set(filters.statuses);
    next.has(status) ? next.delete(status) : next.add(status);
    onFiltersChange({ ...filters, statuses: next });
  }
  function setFlashedState(val) { onFiltersChange({ ...filters, flashedState: val }); }

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelId}>{t('map.filter.title')}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Statut (sélection multiple) ── */}
      <Text style={styles.sectionTitle}>{t('map.filter.conditionSection')}</Text>
      <View style={styles.chipRow}>
        {ALL_STATUSES.map((status) => {
          const active = filters.statuses.has(status);
          const color = statusColors[status];
          return (
            <TouchableOpacity
              key={status}
              onPress={() => toggleStatus(status)}
              activeOpacity={0.7}
              style={[
                styles.checkChip,
                active
                  ? { backgroundColor: color, borderColor: color }
                  : { backgroundColor: 'transparent', borderColor: theme.border },
              ]}
            >
              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={active ? theme.bg : theme.textSecondary}
              />
              <Text style={[styles.chipText, active ? styles.chipTextActive : { color: theme.textPrimary }]}>
                {t(`common.status.${status}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── État (sélection unique) ── */}
      <Text style={styles.sectionTitle}>{t('map.filter.flashSection')}</Text>
      <View style={styles.chipRow}>
        {[
          { val: 'all', label: t('map.filter.all') },
          { val: 'flashed', label: t('map.filter.flashed') },
          { val: 'unflashed', label: t('map.filter.unflashed') },
        ].map(({ val, label }) => {
          const active = filters.flashedState === val;
          return (
            <TouchableOpacity
              key={val}
              onPress={() => setFlashedState(val)}
              activeOpacity={0.7}
              style={[
                styles.checkChip,
                active
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { backgroundColor: 'transparent', borderColor: theme.border },
              ]}
            >
              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={active ? theme.bg : theme.textSecondary}
              />
              <Text style={[styles.chipText, active ? styles.chipTextActive : { color: theme.textPrimary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Légende des couleurs (toujours dispo ici) ── */}
      <View style={{ marginTop: 14 }}>
        <Legend inline />
      </View>
    </View>
  );
}

// ─── Fiche Invader ────────────────────────────────────────────────────────────


// ─── Écran carte ──────────────────────────────────────────────────────────────

export default function MapScreen({ navigation, route }) {
  const { invaders, flashed, labels, labelDefs, statusColors, colorOverrides, filters, setFilters, toggleFlash, mapsApp, setMapsAppPref, currentCityCode, isChangingCity, pendingCityCode, mapLockUntil, mapLockDuration, legendSeen, dismissLegend } = useAppContext();
  const city = CITIES[currentCityCode] ?? CITIES.PA;
  const overlayName = (pendingCityCode ? CITIES[pendingCityCode]?.name : null) ?? city.name;
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();

  const [now, setNow] = useState(() => Date.now());
  const isLocked = now < mapLockUntil;
  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLocked, mapLockUntil]);

  const mapRef = useRef(null);
  const centeredRef = useRef(false);
  const sortCenterRef = useRef({ lat: city.center.lat, lng: city.center.lng });
  const gpsSortedRef  = useRef(false); // vrai après le 1er tri live (jamais re-triggeré)
  // sortVersion s'incrémente max 2× : cache iOS puis 1re fix live → retrigge le useMemo
  const [sortVersion, setSortVersion] = useState(0);
  const [flashEffect, setFlashEffect] = useState(null);
  // Invaders flashés à l'instant : on les garde affichés le temps que l'animation
  // (pop + « +X PTS ») se joue, avant qu'un filtre « à faire » ne les masque.
  const [recentlyFlashed, setRecentlyFlashed] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  // On n'ajoute les marqueurs qu'une fois la MKMapView prête : ajouter des
  // annotations pendant son initialisation (démarrage à froid) peut la faire crasher.
  const [mapReady, setMapReady] = useState(false);
  // Android : n'afficher les marqueurs qu'une fois les TUILES rendues (onMapLoaded).
  // Sinon la capture des 1 528 vues-marqueurs sature le fil graphique et empêche le
  // rendu des tuiles (écran blanc ~30 s). La carte s'affiche d'abord, les Invaders
  // se remplissent ensuite. iOS (Apple Maps) n'a pas ce souci → true d'emblée.
  const [tilesLoaded, setTilesLoaded] = useState(Platform.OS !== 'android');
  const [locationGranted, setLocationGranted] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [userHeading, setUserHeading] = useState(null);

  function handleNavigate(lat, lng) {
    if (mapsApp) { openNavigationApp(mapsApp, lat, lng); return; }
    Alert.alert(
      t('common.mapsApp.title'),
      t('common.mapsApp.msg'),
      [
        { text: t('common.mapsApp.apple'),  onPress: () => { setMapsAppPref('apple');  openNavigationApp('apple',  lat, lng); } },
        { text: t('common.mapsApp.google'), onPress: () => { setMapsAppPref('google'); openNavigationApp('google', lat, lng); } },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  }

  useEffect(() => {
    let positionSub = null;
    let headingSub  = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setLocationGranted(true);

      // ── Étape A : position du cache iOS (instantanée, max 5 min) ──────────
      try {
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
        if (cached && cached.coords.accuracy < 200) {
          sortCenterRef.current = { lat: cached.coords.latitude, lng: cached.coords.longitude };
          setSortVersion(1);
        }
      } catch (_) {}

      // ── Étape B : watch live (position) ───────────────────────────────────
      positionSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 8 },
        (loc) => {
          if (loc.coords.accuracy > 40) return;
          const { latitude, longitude } = loc.coords;
          setUserLocation({ latitude, longitude });

          if (!gpsSortedRef.current) {
            gpsSortedRef.current = true;
            sortCenterRef.current = { lat: latitude, lng: longitude };
            setSortVersion((v) => v + 1);
          }

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

      // ── Étape C : cap de la boussole ──────────────────────────────────────
      headingSub = await Location.watchHeadingAsync(({ trueHeading, magHeading }) => {
        const h = trueHeading >= 0 ? trueHeading : magHeading;
        if (h >= 0) setUserHeading(h);
      });
    })();
    return () => { positionSub?.remove(); headingSub?.remove(); };
  }, []);

  // Repli : si onMapReady ne se déclenche pas (rare), on arme les marqueurs après 1,2 s
  useEffect(() => {
    if (mapReady) return;
    const id = setTimeout(() => setMapReady(true), 1200);
    return () => clearTimeout(id);
  }, [mapReady]);

  // Repli Android : si onMapLoaded ne se déclenche pas, on affiche quand même les
  // marqueurs après 12 s (au-delà, c'est un vrai souffle réseau, pas un blocage).
  useEffect(() => {
    if (tilesLoaded) return;
    const id = setTimeout(() => setTilesLoaded(true), 12000);
    return () => clearTimeout(id);
  }, [tilesLoaded]);

  function goToUserLocation() {
    if (!userLocation) return;
    mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
  }

  // ── Focus d'un Invader demandé depuis un autre écran (ex. News) ──
  // route.params.focusId + _ts : on centre la carte et on ouvre sa fiche.
  // Si la ville vient de changer, l'Invader n'est pas encore chargé → on réessaie
  // quand `invaders` se met à jour. _ts garantit qu'un nouveau tap re-déclenche.
  const handledFocusTs = useRef(null);
  const focusId = route?.params?.focusId;
  const focusTs = route?.params?._ts;
  useEffect(() => {
    if (!focusId || focusTs === handledFocusTs.current) return;
    if (isChangingCity) return;
    const inv = invaders.find((i) => i.id === focusId);
    if (!inv) return; // pas encore chargé → réessaiera (dep invaders)
    handledFocusTs.current = focusTs;
    setSelected(inv);
    setShowFilters(false);
    mapRef.current?.animateToRegion(
      { latitude: inv.lat, longitude: inv.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      600
    );
  }, [focusId, focusTs, invaders, isChangingCity]);

  function closeAll() { setSelected(null); setShowFilters(false); }

  // Réinitialise l'état local au changement de ville (sans animateToRegion — voir ci-dessous).
  useEffect(() => {
    setSelected(null);
    setShowFilters(false);
    setRenderedCount(INITIAL);
    gpsSortedRef.current = false;
    sortCenterRef.current = { lat: city.center.lat, lng: city.center.lng };
  }, [currentCityCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caméra : uniquement quand le verrou se libère (isChangingCity false→true→false).
  // À ce moment, le pont a eu ~1 s pour drainer removeAnnotation×N + addAnnotation×M.
  // On attend encore 200 ms pour laisser le premier batch RAF s'installer.
  const prevChangingRef = useRef(false);
  useEffect(() => {
    const wasChanging = prevChangingRef.current;
    prevChangingRef.current = isChangingCity;
    if (!isChangingCity && wasChanging) {
      const timer = setTimeout(() => {
        mapRef.current?.animateToRegion(
          { latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta },
          800,
        );
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isChangingCity]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFlashFromMap(id) {
    const willFlash = !flashed.has(id);
    if (!willFlash) { toggleFlash(id); return; } // dé-flash : silencieux, pas d'animation

    const inv = invaders.find((i) => i.id === id);
    // On garde l'Invader visible pendant l'animation (sinon un filtre « à faire »
    // le retire instantanément et l'effet de récompense est coupé).
    if (inv) setRecentlyFlashed((prev) => new Set(prev).add(id));
    toggleFlash(id);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (!inv || !mapRef.current) return;
    try {
      const point = await mapRef.current.pointForCoordinate({ latitude: inv.lat, longitude: inv.lng });
      setFlashEffect({ invader: inv, point, key: Date.now() });
    } catch (_) {
      // pas d'animation possible → on retire tout de suite le sursis d'affichage
      setRecentlyFlashed((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  // Filtres appliqués au RENDU de la carte, débouncés : un toggle rapide ne provoque
  // pas un add/remove massif d'annotations à chaque pression (cause de crash MKMapView
  // sous Expo Go). Le panneau de filtres réagit, lui, immédiatement à `filters`.
  const [renderFilters, setRenderFilters] = useState(filters);
  useEffect(() => {
    const id = setTimeout(() => setRenderFilters(filters), 250);
    return () => clearTimeout(id);
  }, [filters]);

  const filteredInvaders = useMemo(() => {
    const base = applyFilters(invaders, renderFilters, flashed);
    if (recentlyFlashed.size === 0) return base;
    // Réinjecte les Invaders en cours d'animation s'ils ont été masqués par le filtre
    const baseIds = new Set(base.map((i) => i.id));
    const extra = invaders.filter((i) => recentlyFlashed.has(i.id) && !baseIds.has(i.id));
    return extra.length ? [...base, ...extra] : base;
  }, [invaders, renderFilters, flashed, recentlyFlashed]);

  // Tri par distance au centre courant (position GPS si dispo, sinon centre ville).
  // sortVersion en dep : re-trie quand sortCenterRef est mis à jour (max 2×).
  const sortedInvaders = useMemo(() => {
    const { lat, lng } = sortCenterRef.current;
    return [...filteredInvaders].sort((a, b) => {
      const da = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
      const db = (b.lat - lat) ** 2 + (b.lng - lng) ** 2;
      return da - db;
    });
  }, [filteredInvaders, sortVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Révélation progressive : du plus proche au plus loin, par lots (RAF).
  const INITIAL = 120;
  const BATCH   = 250;
  const [renderedCount, setRenderedCount] = useState(INITIAL);

  // Reset uniquement sur re-tri (ville/GPS) — pas sur les filtres (sinon churn massif).
  useEffect(() => {
    setRenderedCount(INITIAL);
  }, [sortVersion]);

  useEffect(() => {
    if (isChangingCity) return;
    if (renderedCount >= sortedInvaders.length) return;
    const id = requestAnimationFrame(() =>
      setRenderedCount(c => Math.min(c + BATCH, sortedInvaders.length))
    );
    return () => cancelAnimationFrame(id);
  }, [renderedCount, sortedInvaders.length, isChangingCity]);

  const visibleInvaders = sortedInvaders.slice(0, renderedCount);

  // Pourcentage basé sur le temps restant du verrou (pas sur le rendu, qui est trop rapide).
  // Formule : 1 - remainingMs/totalDuration → stable même après pause en arrière-plan.
  const remainingMs = Math.max(0, mapLockUntil - now);
  const lockProgress = mapLockDuration > 0 ? Math.min(1, 1 - remainingMs / mapLockDuration) : 1;
  const loadingPct = Math.round(lockProgress * 100);
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  const hasActiveFilters =
    filters.statuses.size < ALL_STATUSES.length ||
    filters.flashedState !== 'all';

  return (
    <View style={styles.container}>
      {/* MapView toujours montée — ne jamais la détruire (crash MKMapView iOS) */}
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={Platform.OS === 'android' ? 'standard' : 'mutedStandard'}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        customMapStyle={Platform.OS === 'android' ? (isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE) : undefined}
        loadingEnabled={Platform.OS === 'android'}
        loadingBackgroundColor={theme.bg}
        loadingIndicatorColor={theme.accent}
        showsCompass={false}
        showsTraffic={false}
        showsPointsOfInterest={false}
        showsUserLocation={locationGranted}
        initialRegion={{ latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta }}
        onPress={closeAll}
        onMapReady={() => setMapReady(true)}
        onMapLoaded={() => setTilesLoaded(true)}
      >
        {!isChangingCity && <HeadingCone userLocation={userLocation} heading={userHeading} />}
        {/* Marqueurs montés seulement quand la carte est prête (mapReady) et hors
            changement de ville — évite le churn/ajout d'annotations sur MKMapView. */}
        {mapReady && tilesLoaded && !isChangingCity && visibleInvaders.map((invader) => {
          const isFlashed = flashed.has(invader.id);
          // Android : pendant l'animation de flash, on masque le vrai marqueur natif —
          // l'alien animé de l'overlay le remplace. Sinon les deux icônes se superposent
          // avec un léger décalage (effet de doublon). Le marqueur réapparaît (flashé)
          // dès la fin de l'animation.
          if (Platform.OS === 'android' && flashEffect && flashEffect.invader.id === invader.id) {
            return null;
          }
          return (
            <InvaderMarker
              key={Platform.OS === 'android' ? invader.id : `${invader.id}-${isFlashed ? 1 : 0}`}
              invader={invader}
              isFlashed={isFlashed}
              stopPropagation
              onPress={() => { setSelected(invader); setShowFilters(false); }}
            />
          );
        })}
      </MapView>

      {/* ── Barre supérieure : Menu | barre de progression | chip ville ── */}
      {!isChangingCity && (
        <View style={[styles.topBar, { top: insets.top + 8 }]}>

          {/* Bouton Menu (gauche) */}
          <TouchableOpacity
            style={styles.menuTopBtn}
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            activeOpacity={0.75}
          >
            <Ionicons name="menu" size={18} color={theme.textPrimary} />
            <Text style={styles.menuTopBtnText}>{t('common.menu')}</Text>
          </TouchableOpacity>

          {/* Texte de chargement pixelisé (centre) */}
          {isLocked ? (
            <Text style={styles.loadingText} numberOfLines={1}>
              {t('map.loading.progress', { pct: loadingPct })}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {/* Chip ville (droite) */}
          <View style={[styles.cityChip, isLocked && styles.chipLocked]}>
            {isLocked && <ActivityIndicator size="small" color={theme.accent} />}
            {ENABLED_CITIES.length > 1 ? (
              <TouchableOpacity style={styles.cityChipInner} onPress={() => navigation.navigate('Palmarès')} activeOpacity={0.75}>
                <Ionicons name="globe-outline" size={13} color={theme.textPrimary} />
                <Text style={styles.cityChipText}>{city.name}</Text>
                <Ionicons name="chevron-down" size={11} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.cityChipInner}>
                <Ionicons name="globe-outline" size={13} color={theme.textPrimary} />
                <Text style={styles.cityChipText}>{city.name}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Boutons bas-droite : Filtres + Localisation ── */}
      {!isChangingCity && (
        <View style={[styles.bottomRight, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.circleBtn, hasActiveFilters && !isLocked && styles.circleBtnActive, isLocked && { opacity: 0.55 }]}
            onPress={() => {
              if (isLocked) {
                Alert.alert(
                  t('map.loadingTitle'),
                  t('map.loadingBody', { countdown: formatCountdown(remainingSeconds) }),
                );
                return;
              }
              setShowFilters((v) => !v);
              setSelected(null);
            }}
          >
            <Ionicons
              name={hasActiveFilters && !isLocked ? 'funnel' : 'funnel-outline'}
              size={19}
              color={hasActiveFilters && !isLocked ? theme.bg : theme.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtn, !userLocation && { opacity: 0.4 }]}
            onPress={userLocation ? goToUserLocation : undefined}
          >
            <Text style={styles.locateBtnText}>⊙</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Légende des couleurs (bas-gauche) — au 1er usage uniquement ── */}
      {!legendSeen && !isChangingCity && !showFilters && !selected && (
        <View style={[styles.bottomLeft, { bottom: insets.bottom + 16 }]}>
          <Legend onDismiss={dismissLegend} />
        </View>
      )}

      {showFilters && !isChangingCity && (
        <FilterPanel filters={filters} onFiltersChange={setFilters} onClose={() => setShowFilters(false)} />
      )}

      {/* Overlay animation flash — au-dessus de la carte, transparent aux touches */}
      {flashEffect && !isChangingCity && (
        <FlashOverlay
          key={flashEffect.key}
          invader={flashEffect.invader}
          point={flashEffect.point}
          theme={theme}
          onDone={() => {
            const flashedId = flashEffect.invader.id;
            setFlashEffect(null);
            // L'animation est finie : on lève le sursis → l'Invader peut être masqué
            setRecentlyFlashed((prev) => { const n = new Set(prev); n.delete(flashedId); return n; });
          }}
        />
      )}

      {selected && !showFilters && !isChangingCity && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <InvaderPanel
            invader={selected}
            onToggleFlash={handleFlashFromMap}
            onNavigate={handleNavigate}
            onClose={() => setSelected(null)}
          />
        </View>
      )}

      {/* Android : voile sombre tant que les tuiles ne sont pas rendues (anti-écran blanc) */}
      {Platform.OS === 'android' && !tilesLoaded && !isChangingCity && (
        <View style={[StyleSheet.absoluteFillObject, styles.cityTransitionOverlay]} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      )}

      {/* Overlay de transition ville — masque la MapView (toujours active) pendant le chargement */}
      {isChangingCity && (
        <View style={[StyleSheet.absoluteFillObject, styles.cityTransitionOverlay]}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.cityTransitionText, { color: theme.textPrimary }]}>
            {overlayName}
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

    // ── Barre supérieure ─────────────────────────────────────────────────────
    topBar: {
      position: 'absolute', left: 12, right: 12,
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },

    // Bouton Menu (gauche)
    menuTopBtn: {
      flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: t.surface,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
    },
    menuTopBtnText: { fontSize: 14, fontWeight: '600', color: t.textPrimary },

    // Texte de chargement pixelisé (centre)
    loadingText: {
      flex: 1, textAlign: 'center',
      fontFamily: 'Silkscreen_400Regular', fontSize: 9,
      color: t.textPrimary,
    },

    // Chip ville (droite)
    cityChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
      backgroundColor: t.surface,
      paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    chipLocked: { opacity: 0.55 },
    cityChipInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cityChipText: { fontSize: 13, fontWeight: '600', color: t.textPrimary },

    // ── Boutons bas-droite ───────────────────────────────────────────────────
    bottomRight: {
      position: 'absolute', right: 14,
      alignItems: 'center', gap: 10,
    },
    // ── Légende bas-gauche ───────────────────────────────────────────────────
    bottomLeft: { position: 'absolute', left: 12, maxWidth: 180 },
    circleBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
    },
    circleBtnActive: { backgroundColor: t.accent },
    locateBtnText: { fontSize: 20, color: t.textPrimary },

    // ── Transition de ville ──────────────────────────────────────────────────
    cityTransitionOverlay: {
      backgroundColor: t.bg,
      alignItems: 'center', justifyContent: 'center', gap: 14,
    },
    cityTransitionText: { fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },

    // ── FilterPanel (bottom sheet) ───────────────────────────────────────────
    panel: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      backgroundColor: t.surface,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
      shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.14, shadowRadius: 8, elevation: 10,
    },
    panelHeader: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: 4,
    },
    panelId: { fontSize: 16, fontWeight: '700', color: t.textPrimary },
    closeButton: { fontSize: 20, color: t.textSecondary, lineHeight: 24 },

    sectionTitle: {
      fontSize: 13, fontWeight: '600', color: t.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    checkChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
      borderWidth: 1.5,
    },
    chipText: { fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: t.bg },
  });
}
