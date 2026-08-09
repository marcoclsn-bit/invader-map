import { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Platform, Alert, Animated, ActivityIndicator, Switch } from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { DrawerActions } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { CITIES, ENABLED_CITIES } from '../cities/registry';
import { ALL_STATUSES } from '../constants';
import { familyOf } from '../data/poiFamilies';
import { getPois, hasPois } from '../services/poiData';
import InvaderMarker from '../components/InvaderMarker';
import Legend from '../components/Legend';
import InvaderPanel from '../components/InvaderPanel';
import HeadingCone from '../components/HeadingCone';
import FlashOverlay from '../components/FlashOverlay';
import ExplorerSheet from '../components/ExplorerSheet';
import PoiSheet from '../components/PoiSheet';
import PoiMarker from '../components/PoiMarker';
import PoiIntroCard from '../components/PoiIntroCard';
import { useTheme } from '../theme/ThemeContext';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '../theme/mapStyle';
import { typography } from '../theme/tokens';
import { openNavigationApp } from '../utils/navigation';
import { track } from '../services/analytics';
import PoiFamilyChips from '../components/PoiFamilyChips';

// Refus de localisation déjà signalé pour ce lancement de l'app (voir plus bas).
let _deniedReported = false;

// Photographie de la configuration d'affichage, pour la mesure d'usage.
// Uniquement des chaînes et des nombres : Aptabase rejette tout le reste.
// Les listes sont triées, sinon deux configurations identiques produiraient
// des valeurs différentes selon l'ordre des clics.
function filtersSignature(filters, poiPrefs) {
  return {
    statuses: [...filters.statuses].sort().join(',') || 'none',
    flashed: filters.flashedState,
    poi: poiPrefs.enabled ? 'on' : 'off',
    poiFamilies: [...poiPrefs.families].sort().join(',') || 'none',
    poiFamilyCount: poiPrefs.families.size,
  };
}


// ─── Cache de styles thémés (un seul StyleSheet par thème) ───────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

// ─── Logique de filtrage ──────────────────────────────────────────────────────

// `explorer` : mode explorateur. On masque tout Invader non flashé, c'est la
// règle unique du mode, et elle passe AVANT les filtres de l'utilisateur, qui ne
// doivent pas pouvoir la contourner (« non flashés uniquement » afficherait
// exactement ce qu'on s'est engagé à ne pas montrer).
function applyFilters(invaders, filters, flashed, explorer) {
  return invaders.filter((inv) => {
    if (explorer && !flashed.has(inv.id)) return false;
    // En mode explorateur, AUCUN filtre d'Invader n'agit, et leurs réglages
    // disparaissent du panneau. Les neutraliser n'est pas cosmétique : sans
    // commande pour les défaire, un réglage posé AVANT l'activation du mode
    // resterait actif sans plus rien pour l'annuler. « Non flashés uniquement »
    // vidait ainsi la carte entièrement, et un statut décoché aurait fait
    // disparaître des flashés sans explication.
    if (explorer) return true;
    if (!filters.statuses.has(inv.status)) return false;
    if (filters.flashedState === 'flashed' && !flashed.has(inv.id)) return false;
    if (filters.flashedState === 'unflashed' && flashed.has(inv.id)) return false;
    return true;
  });
}

// ─── Navigation externe ───────────────────────────────────────────────────────

// ─── Panneau de filtres ───────────────────────────────────────────────────────

function FilterPanel({ filters, onFiltersChange, onClose, explorer }) {
  const { statusColors, poiPrefs, setPoiPref, currentCityCode } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const poiAvailable = hasPois(currentCityCode);

  function toggleStatus(status) {
    const next = new Set(filters.statuses);
    next.has(status) ? next.delete(status) : next.add(status);
    onFiltersChange({ ...filters, statuses: next });
  }
  function setFlashedState(val) { onFiltersChange({ ...filters, flashedState: val }); }

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelId}>{t(explorer ? 'poi.section' : 'map.filter.title')}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Statut (sélection multiple) ── */}
      {!explorer && <>
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
      </>}

      {/* ── Lieux à voir (couche indépendante des Invaders) ── */}
      {poiAvailable && (
        <>
          <View style={styles.poiHeaderRow}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>{t('poi.section')}</Text>
            <Switch
              value={poiPrefs.enabled}
              // Aptabase n'accepte que des chaînes et des nombres en propriétés :
              // le booléen était perdu, l'événement ne disait donc pas si la
              // couche avait été activée ou désactivée.
              onValueChange={(v) => { setPoiPref({ enabled: v }); track('poi_layer', { state: v ? 'on' : 'off' }); }}
              accessibilityLabel={t('poi.a11y.layer')}
              trackColor={{ false: theme.border, true: theme.accentScore }}
              thumbColor={theme.bg}
            />
          </View>
          {/* Même composant que la feuille ouverte depuis le Trajet et la Chasse :
              `poiPrefs.families` est un réglage unique, il n'a aucune raison
              d'exister en trois exemplaires de code. */}
          {poiPrefs.enabled && <PoiFamilyChips style={{ marginTop: 8 }} />}
        </>
      )}

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
  const { invaders, flashed, labels, labelDefs, statusColors, colorOverrides, filters, setFilters, toggleFlash, mapsApp, setMapsAppPref, currentCityCode, isChangingCity, pendingCityCode, legendSeen, dismissLegend, poiPrefs, poiIntroSeen, poiDataVersion, explorer } = useAppContext();
  const city = CITIES[currentCityCode] ?? CITIES.PA;
  const overlayName = (pendingCityCode ? CITIES[pendingCityCode]?.name : null) ?? city.name;
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
  // Invaders flashés à l'instant : on les garde affichés le temps que l'animation
  // (pop + « +X PTS ») se joue, avant qu'un filtre « à faire » ne les masque.
  const [recentlyFlashed, setRecentlyFlashed] = useState(() => new Set());
  const [explorerSheet, setExplorerSheet] = useState(false);
  // Ref pour lire l'overlay courant depuis onRegionChange sans closure périmée.
  const flashEffectRef = useRef(null);
  flashEffectRef.current = flashEffect;
  // Retire l'animation de flash + le sursis d'affichage de l'Invader. Appelé à la fin
  // de l'animation ET dès que la carte bouge (sinon l'alien resterait « collé » à l'écran
  // pendant que la carte se déplace / se recentre).
  function dismissFlash() {
    const cur = flashEffectRef.current;
    if (!cur) return;
    setFlashEffect(null);
    setRecentlyFlashed((prev) => { const n = new Set(prev); n.delete(cur.invader.id); return n; });
  }
  const [selected, setSelected] = useState(null);
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  // Configuration des filtres au moment de l'ouverture du panneau, pour ne
  // mesurer QUE la configuration retenue à la fermeture. Un événement par
  // bascule aurait produit cinq lignes pour une seule intention (« je veux voir
  // les non flashés et masquer les détruits »), et brouillé la lecture autant
  // qu'il aurait coûté de quota.
  const filtersAtOpen = useRef(null);

  // Le panneau se ferme par SIX chemins différents (bouton, tap sur un marqueur,
  // sélection d'un lieu…). On surveille donc la transition ouvert → fermé plutôt
  // que de patcher chaque appelant, sinon la mesure manquerait la moitié des cas.
  useEffect(() => {
    if (showFilters) {
      filtersAtOpen.current = filtersSignature(filters, poiPrefs);
      return;
    }
    const avant = filtersAtOpen.current;
    filtersAtOpen.current = null;
    if (!avant) return;
    const apres = filtersSignature(filters, poiPrefs);
    // Rien touché → rien à dire. Ouvrir et refermer le panneau n'est pas un choix.
    if (JSON.stringify(avant) === JSON.stringify(apres)) return;
    track('filters_applied', apres);
  }, [showFilters]); // eslint-disable-line react-hooks/exhaustive-deps
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
      if (status !== 'granted') {
        // Signalé UNE SEULE FOIS par lancement, et uniquement en cas de refus :
        // l'octroi est déjà mesuré à l'onboarding, et un événement à chaque
        // montage de la carte coûterait cher pour ne rien apprendre de neuf.
        // Ce qu'on cherche ici, c'est le nombre de gens qui continuent d'utiliser
        // l'app sans GPS — donc sans Chasse, ni Trajet, ni Balade.
        if (!_deniedReported) { _deniedReported = true; track('location_permission', { result: 'denied', from: 'map' }); }
        return;
      }
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
    // Défense en profondeur du mode explorateur. Les appelants actuels sont
    // gardés, mais la garde doit vivre ICI : une notification de proximité émise
    // AVANT l'activation du mode transporte encore son `invId` et reste dans le
    // centre de notifications. Un appui après coup recentrait la carte sur la
    // position exacte et ouvrait la fiche. Tout futur appelant fuirait de même.
    if (explorer && !flashed.has(inv.id)) { handledFocusTs.current = focusTs; return; }
    handledFocusTs.current = focusTs;
    setSelected(inv);
    setShowFilters(false);
    mapRef.current?.animateToRegion(
      { latitude: inv.lat, longitude: inv.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      600
    );
  }, [focusId, focusTs, invaders, isChangingCity, explorer, flashed]);

  function closeAll() { setSelected(null); setSelectedPoi(null); setShowFilters(false); }

  // Réinitialise l'état local au changement de ville (sans animateToRegion — voir ci-dessous).
  useEffect(() => {
    setSelected(null);
    setSelectedPoi(null);
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
    const base = applyFilters(invaders, renderFilters, flashed, explorer);
    if (recentlyFlashed.size === 0) return base;
    // Réinjecte les Invaders en cours d'animation s'ils ont été masqués par le filtre
    const baseIds = new Set(base.map((i) => i.id));
    const extra = invaders.filter((i) => recentlyFlashed.has(i.id) && !baseIds.has(i.id));
    return extra.length ? [...base, ...extra] : base;
  }, [invaders, renderFilters, flashed, recentlyFlashed, explorer]);

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

  // ─── Lieux à voir ──────────────────────────────────────────────────────────
  // Aucun filtrage par zone visible, et donc AUCUN suivi de région. C'est le
  // point important : recalculer la liste à chaque déplacement provoquait un
  // ajout/retrait massif d'annotations, soit exactement la cause de crash
  // MKMapView documentée plus haut pour les filtres. Les Invaders ne plantent
  // jamais précisément parce qu'ils sont montés une fois et jamais retirés ;
  // les lieux suivent désormais la même règle.
  // La liste ne change donc que si l'utilisateur touche aux familles.
  // Préférences appliquées au RENDU, débouncées — même raison que renderFilters :
  // cocher/décocher trois familles d'affilée provoquerait sinon trois vagues
  // d'ajout/retrait d'annotations.
  const [renderPoi, setRenderPoi] = useState(poiPrefs);
  useEffect(() => {
    const id = setTimeout(() => setRenderPoi(poiPrefs), 250);
    return () => clearTimeout(id);
  }, [poiPrefs]);

  const allPois = useMemo(() => {
    if (!renderPoi.enabled) return [];
    return getPois(currentCityCode)
      .filter(p => renderPoi.families.has(familyOf(p)))
      .sort((a, b) => b.fame - a.fame);   // les plus notoires montés en premier
  }, [renderPoi, currentCityCode, poiDataVersion]);

  // Révélation progressive, comme pour les Invaders : on étale le montage sur
  // plusieurs frames au lieu d'en bloquer une seule. Le compteur n'est jamais
  // remis à zéro — le remettre retirerait des marqueurs déjà posés pour les
  // reposer aussitôt, soit exactement le churn qu'on cherche à éviter.
  const POI_BATCH = 150;
  const [poiRendered, setPoiRendered] = useState(POI_BATCH);
  useEffect(() => {
    if (isChangingCity || poiRendered >= allPois.length) return;
    const id = requestAnimationFrame(() =>
      setPoiRendered(c => Math.min(c + POI_BATCH, allPois.length))
    );
    return () => cancelAnimationFrame(id);
  }, [poiRendered, allPois.length, isChangingCity]);

  const visiblePois = isChangingCity ? [] : allPois.slice(0, poiRendered);

  const hasActiveFilters =
    filters.statuses.size < ALL_STATUSES.length ||
    (!explorer && filters.flashedState !== 'all');

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
        showsMyLocationButton={false}
        initialRegion={{ latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta }}
        onPress={closeAll}
        onMapReady={() => setMapReady(true)}
        onMapLoaded={() => setTilesLoaded(true)}
        onRegionChange={dismissFlash}
      >
        {!isChangingCity && <HeadingCone userLocation={userLocation} heading={userHeading} />}
        {/* ORDRE CRITIQUE : les lieux AVANT les Invaders, donc les marqueurs
            d'Invaders sont les DERNIERS enfants de la carte.
            Cause d'un plantage confirmé par deux journaux d'incident identiques :
            « -[__NSArrayM insertObject:atIndex:]: object cannot be nil », levé
            depuis RCTLegacyViewManagerInteropComponentView. react-native-maps est
            un composant de l'ancienne architecture, ses enfants passent donc par
            la couche d'interopérabilité de React Native. Or celle-ci n'ajoute
            immédiatement un enfant que s'il arrive EN FIN de liste ; sinon elle le
            met en file, et au vidage de la file elle insère son `contentView`,
            encore nil si l'enfant n'a pas fini de s'initialiser.
            Les Invaders étant montés avant les lieux, en ajouter revenait à
            insérer au milieu — plus d'un millier d'un coup à la bascule du mode
            explorateur. Placés en dernier, ils empruntent le chemin direct.
            Conséquence assumée : les marqueurs d'Invaders passent au-dessus des
            losanges dorés, l'ordre de rendu valant ordre d'empilement. */}
        {/* Lieux à voir : losange doré, même signe que dans la Chasse. Aucun
            plafond — tous les lieux visibles des familles cochées sont montés. */}
        {mapReady && tilesLoaded && !isChangingCity && visiblePois.map((poi) => (
          <PoiMarker
            key={`poi-${poi.id}`}
            poi={poi}
            label={`${poi.name}, ${t(`hunt.poiTheme.${poi.theme}`)}`}
            hint={t('poi.a11y.openHint')}
            onPress={() => {
              setSelectedPoi(poi); setSelected(null); setShowFilters(false);
              track('poi_open', { from: 'map', theme: poi.theme, lang: i18n.language });
            }}
          />
        ))}

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
              label={`${invader.id}, ${t(`common.status.${invader.status}`)}, ${t(isFlashed ? 'map.a11y.flashed' : 'map.a11y.todo')}`}
              hint={t('map.a11y.invaderHint')}
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

          <View style={{ flex: 1 }} />

          {/* Chip ville (droite) */}
          <View style={styles.cityChip}>
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

      {/* ── Mode explorateur : rappel permanent + accès à la saisie ──
          Le rappel n'est pas décoratif. Une carte sans épingles se lit comme une
          panne : sans cette bande, l'utilisateur conclut que l'app est cassée et
          la désinstalle. Elle sert aussi de bouton, parce qu'avec les épingles
          masquées il ne reste plus AUCUN moyen de marquer un Invader depuis la
          carte, c'est la saisie de l'identifiant lu dans FlashInvaders qui prend
          le relais. */}
      {!isChangingCity && explorer && (
        <TouchableOpacity
          style={[styles.explorerBar, { bottom: insets.bottom + 16 }]}
          onPress={() => setExplorerSheet(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('explorer.badge')}
          accessibilityHint={t('explorer.badgeHint')}
        >
          <Ionicons name="eye-off-outline" size={15} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.explorerBarTitle}>{t('explorer.badge')}</Text>
            <Text style={styles.explorerBarHint}>{t('explorer.badgeHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

      {/* ── Boutons bas-droite : Filtres + Localisation ── */}
      {!isChangingCity && (
        <View style={[styles.bottomRight, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.circleBtn, hasActiveFilters && styles.circleBtnActive]}
            onPress={() => {
              setShowFilters((v) => !v);
              setSelected(null);
            }}
          >
            {/* En mode explorateur le panneau ne contient plus que les lieux à
                découvrir : un entonnoir promettrait des filtres qui n'existent
                plus, et laisserait chercher ceux qu'on a retirés. */}
            <Ionicons
              name={explorer ? 'diamond-outline' : (hasActiveFilters ? 'funnel' : 'funnel-outline')}
              size={19}
              color={hasActiveFilters ? theme.bg : theme.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtn, !userLocation && { opacity: 0.4 }]}
            onPress={userLocation ? goToUserLocation : undefined}
          >
            <Ionicons name="locate" size={19} color={theme.textPrimary} />
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
        <FilterPanel filters={filters} onFiltersChange={setFilters} onClose={() => setShowFilters(false)} explorer={explorer} />
      )}

      {/* Volet de report, monté hors de tout conditionnel : il porte sa propre
          visibilité, et c'est lui qui déclenche l'animation ci-dessous. */}
      <ExplorerSheet
        visible={explorerSheet}
        onClose={() => setExplorerSheet(false)}
        onFlash={handleFlashFromMap}
      />

      {/* Overlay animation flash — au-dessus de la carte, transparent aux touches */}
      {flashEffect && !isChangingCity && (
        <FlashOverlay
          key={flashEffect.key}
          invader={flashEffect.invader}
          point={flashEffect.point}
          theme={theme}
          onDone={dismissFlash}
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

      {/* Invitation « Lieux à voir » — une seule fois, carte visible derrière */}
      {!poiIntroSeen && hasPois(currentCityCode) && mapReady && !isChangingCity
        && !selected && !selectedPoi && !showFilters && (
        <PoiIntroCard cityCode={currentCityCode} style={{ bottom: insets.bottom + 84 }} />
      )}

      {selectedPoi && !showFilters && !isChangingCity && (
        <PoiSheet
          poi={selectedPoi}
          onClose={() => setSelectedPoi(null)}
          style={{ bottom: insets.bottom + 16 }}
        />
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

    explorerBar: {
      position: 'absolute', left: 14, right: 82,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12,
      backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.accent,
    },
    explorerBarTitle: { fontSize: 12.5, fontWeight: '700', color: t.textPrimary },
    explorerBarHint: { fontSize: 11, color: t.textSecondary, marginTop: 1 },

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

    // Chip ville (droite)
    cityChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
      backgroundColor: t.surface,
      paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
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
    poiHeaderRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 16, marginBottom: 8,
    },
    checkChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
      borderWidth: 1.5,
    },
    chipText: { fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: t.bg },
  });
}
