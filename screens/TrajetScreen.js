import { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  FlatList, Switch, Alert, Linking, Keyboard, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import MapView, { Polyline, Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as turf from '@turf/turf';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { STATUS_COLOR } from '../constants';
import { ORS_API_KEY } from '../config/ors';
import { useAppContext } from '../context/AppContext';
import { CITIES } from '../cities/registry';
import { familyOf } from '../data/poiFamilies';
import { getPois, hasPois } from '../services/poiData';
import { countryCodeOf } from '../cities/countries';
import { geocode, autocomplete, route } from '../services/routing';
import { canUseFeature, FEATURES } from '../services/featureAccess';
import InvaderMarker from '../components/InvaderMarker';
import PoiMarker from '../components/PoiMarker';
import PoiSheet from '../components/PoiSheet';
import PinMarker from '../components/PinMarker';
import HeadingCone from '../components/HeadingCone';
import InvaderPanel from '../components/InvaderPanel';
import FlashOverlay from '../components/FlashOverlay';
import { useSessionRecorder } from '../components/session/useSessionRecorder';
import useKeepScreenOn from '../components/session/useKeepScreenOn';
import { useGamification } from '../context/GamificationContext';
import { useTheme } from '../theme/ThemeContext';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '../theme/mapStyle';
import { typography } from '../theme/tokens';
import { openInstagramTag, openNavigationApp } from '../utils/navigation';
import { track } from '../services/analytics';

const _PA         = CITIES.PA;
const PARIS       = { latitude: _PA.center.lat, longitude: _PA.center.lng, ..._PA.mapDelta };
const DEBOUNCE_MS = 300;
const MIN_CHARS   = 3;

// Le couloir est une distance, pas un budget : l'objectif ne peut donc pas
// répartir du temps comme dans la Chasse. Il fixe seulement combien de lieux on
// retient dans le couloir, en gardant les plus notoires.
const ROUTE_POI_CAP = { pure: 0, balanced: 5, visit: 15 };

const BUFFER_OPTIONS = [
  { label: '50 m',  value: 0.05 },
  { label: '100 m', value: 0.1  },
  { label: '250 m', value: 0.25 },
];

// ─── Navigation externe ───────────────────────────────────────────────────────

async function openInApp(app, lat, lng) {
  // Android : Apple Plans indisponible → Google Maps (natif puis repli web).
  if (Platform.OS === 'android') {
    Linking.openURL(`google.navigation:q=${lat},${lng}&mode=w`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`).catch(() => {}),
    );
    return;
  }
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

// ─── Cache de styles thémés ───────────────────────────────────────────────────

let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const s = makeStyles(theme);
  _styleCache = { theme, styles: s };
  return s;
}

// ─── Champ d'adresse avec autocomplétion ─────────────────────────────────────

function AddressInput({
  inputRef, value, onChange, onSelect, onFocus, onBlur, onSubmitEditing,
  onFallback, searching, showEmpty, suggestions, placeholder,
  iconName, iconColor, isConfirmed, resolving,
  gpsOption, onSelectGps,
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const showDropdown = gpsOption || searching || showEmpty || suggestions.length > 0;
  return (
    <View>
      <View style={styles.inputRow}>
        <Ionicons name={iconName} size={16} color={iconColor} style={styles.inputIcon} />
        <TextInput
          ref={inputRef}
          style={styles.inputField}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          keyboardType="default"
          returnKeyType="done"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="sentences"
        />
        {resolving ? (
          <ActivityIndicator size="small" color={theme.textSecondary} style={styles.inputAdornment} />
        ) : isConfirmed ? (
          <Ionicons name="checkmark-circle" size={18} color={theme.statusOk} style={styles.inputAdornment} />
        ) : null}
      </View>
      {showDropdown && (
        <View style={styles.suggestions}>
          {/* Raccourci GPS en tête (départ uniquement) */}
          {gpsOption && (
            <TouchableOpacity style={styles.suggItem} onPress={onSelectGps}>
              <View style={styles.gpsRow}>
                <Ionicons name="locate" size={14} color={theme.accent} />
                <Text style={styles.gpsRowText}>{t('route.gpsLabel')}</Text>
              </View>
            </TouchableOpacity>
          )}
          {/* Contenu principal */}
          {searching ? (
            <View style={[styles.suggState, gpsOption && styles.suggBorder]}>
              <ActivityIndicator size="small" color={theme.textSecondary} />
              <Text style={styles.suggStateText}>{t('common.searching')}</Text>
            </View>
          ) : showEmpty ? (
            <>
              <View style={[styles.suggState, gpsOption && styles.suggBorder]}>
                <Text style={styles.suggStateText}>{t('common.noResults')}</Text>
              </View>
              <TouchableOpacity style={[styles.suggItem, styles.suggBorder]} onPress={onFallback}>
                <Text style={styles.suggFallbackText} numberOfLines={1}>
                  {t('route.useAddress', { text: value })}
                </Text>
              </TouchableOpacity>
            </>
          ) : suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.suggItem, (gpsOption || i > 0) && styles.suggBorder]}
                onPress={() => onSelect(s)}
              >
                <Text style={styles.suggText} numberOfLines={1}>{s.label}</Text>
              </TouchableOpacity>
            ))
          ) : null}
        </View>
      )}
    </View>
  );
}

// ─── Ligne d'un Invader dans la liste ────────────────────────────────────────

function RouteInvaderRow({ inv, isFlashed, statusColors, onPress }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <TouchableOpacity style={styles.routeRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.routeDot, { backgroundColor: statusColors[inv.status] ?? STATUS_COLOR[inv.status] }]} />
      <Text style={styles.routeId}>{inv.id}</Text>
      <Text style={styles.routePts}>{inv.points} {t('common.pts')}</Text>
      <View style={[styles.routeBadge, isFlashed && styles.routeBadgeFlashed]}>
        <Text style={[styles.routeBadgeText, isFlashed && styles.routeBadgeTextFlashed]}>
          {isFlashed ? t('common.flashed') : t('common.todo')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Fiche détail d'un Invader du trajet ─────────────────────────────────────

// ─── Panneau résultat : compteur + filtre + liste ─────────────────────────────

// Ligne d'un lieu dans la liste du trajet. Même hauteur (48) qu'une ligne
// d'Invader, sans quoi le getItemLayout de la FlatList deviendrait faux.
function RoutePoiRow({ poi, onPress }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <TouchableOpacity style={styles.routeRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.routePoiDiamond} />
      <Text style={styles.routePoiName} numberOfLines={1}>{poi.name}</Text>
      <Text style={styles.routePoiTheme} numberOfLines={1}>{t(`hunt.poiTheme.${poi.theme}`)}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </TouchableOpacity>
  );
}

function RoutePanel({ allInvaders, displayInvaders, flashed, statusColors, showOnlyUnflashed, onToggleFilter, onSelectInvader, onWidenCorridor, pois = [], onSelectPoi }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const total = allInvaders.length;
  const poiCount = pois.length;
  // Liste dans le SENS DE LA MARCHE : Invaders et lieux mélangés, triés par leur
  // distance parcourue le long du tracé (`along`, calculée par nearestPointOnLine).
  // On suit ainsi l'ordre dans lequel on les rencontrera réellement.
  const rows = [
    ...pois.map((p) => ({ __poi: true, ...p })),
    ...displayInvaders,
  ].sort((a, b) => (a.along ?? 0) - (b.along ?? 0));
  // « À flasher » = ni déjà flashés, ni détruits (les détruits ne sont pas flashables)
  const todoInvaders = allInvaders.filter((inv) => !flashed.has(inv.id) && inv.status !== 'destroyed');
  const unflashedCount = todoInvaders.length;
  const todoPoints = todoInvaders.reduce((s, inv) => s + (inv.points ?? 0), 0);
  return (
    <View style={styles.routePanel}>
      <View style={styles.routePanelHeader}>
        <View style={{ flex: 1, marginRight: 10 }}>
          {total === 0 ? (
            <Text style={styles.routeSummary}>{t('route.noInvadersOnRoute')}</Text>
          ) : (
            <Text style={styles.routeSummary} numberOfLines={2}>
              {t('route.invadersOnRoute', { count: total })}
              {unflashedCount > 0 ? t('route.unflashedSuffix', { count: unflashedCount }) : ''}
              {unflashedCount > 0 ? t('route.todoPointsSuffix', { points: todoPoints }) : ''}
              {poiCount > 0 ? <Text style={styles.routePoiCount}>{t('route.poiSuffix', { count: poiCount })}</Text> : null}
            </Text>
          )}
        </View>
        {total > 0 && (
          <View style={styles.toggleWrap}>
            <Text style={styles.toggleLabel}>{t('route.showTodo')}</Text>
            <Switch
              value={showOnlyUnflashed}
              onValueChange={onToggleFilter}
              trackColor={{ false: theme.border, true: theme.statusOk }}
              thumbColor={theme.bg}
            />
          </View>
        )}
      </View>
      {total === 0 && poiCount === 0 ? (
        <View style={styles.routeEmpty}>
          <Text style={styles.routeEmptyHint}>{t('route.noInvadersHint')}</Text>
          <TouchableOpacity style={styles.widenBtn} onPress={onWidenCorridor} activeOpacity={0.85}>
            <Ionicons name="expand-outline" size={16} color={theme.bg} />
            <Text style={styles.widenBtnText}>{t('route.widenCorridor')}</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.listEmpty}>{t('route.allFlashed')}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => (item.__poi ? `poi-${item.id}` : item.id)}
          style={styles.routeList}
          renderItem={({ item }) =>
            item.__poi ? (
              <RoutePoiRow poi={item} onPress={() => onSelectPoi?.(item)} />
            ) : (
              <RouteInvaderRow
                inv={item}
                isFlashed={flashed.has(item.id)}
                statusColors={statusColors}
                onPress={() => onSelectInvader(item)}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
        />
      )}
    </View>
  );
}

// ─── Écran Trajet ─────────────────────────────────────────────────────────────

export default function TrajetScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const gpsRef = useRef(null);
  const calcCollapseRef = useRef(false); // replie le volet une fois la recherche terminée
  const depInputRef = useRef(null);
  const arrInputRef = useRef(null);
  const depDebounce = useRef(null);
  const arrDebounce = useRef(null);

  const { invaders, flashed, toggleFlash, labels, labelDefs, colorOverrides, statusColors, mapsApp, setMapsAppPref, currentCityCode, isChangingCity, poiPrefs, setPoiPref, poiDataVersion } = useAppContext();
  const city = CITIES[currentCityCode] ?? CITIES.PA;
  const recorder = useSessionRecorder();
  const { recordSession } = useGamification();
  // Écran maintenu allumé pendant le suivi : sans ça, iOS suspend l'app dès
  // l'extinction de l'écran et la distance parcourue cesse d'être enregistrée.
  useKeepScreenOn(following);
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const GPS_LABEL = t('route.gpsLabel');
  // Biais de recherche Mapbox : proximité = GPS, pays = ville courante, langue UI
  const geoOpts = { country: countryCodeOf(city), language: i18n.language };

  // ─── Champs d'adresse ────────────────────────────────────────────────────

  const [depText, setDepText] = useState('');
  const [depCoords, setDepCoords] = useState(null);
  const [depSugg, setDepSugg] = useState([]);
  const [depSearching, setDepSearching] = useState(false);
  const [depFocused, setDepFocused] = useState(false);
  const [depResolving, setDepResolving] = useState(false);
  const [gpsAvailable, setGpsAvailable] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  const [arrText, setArrText] = useState('');
  const [arrCoords, setArrCoords] = useState(null);
  const [arrSugg, setArrSugg] = useState([]);
  const [arrSearching, setArrSearching] = useState(false);
  const [arrFocused, setArrFocused] = useState(false);
  const [arrResolving, setArrResolving] = useState(false);

  // 'route' = appel ORS en cours  |  'invaders' = calcul turf en cours  |  null = inactif
  const [loadingPhase, setLoadingPhase] = useState(null);
  // Incrémenté à chaque calcul : garantit que l'effet du couloir se relance même
  // si la polyligne retournée est identique à la précédente (trajet en cache).
  const [calcNonce, setCalcNonce] = useState(0);
  const [error, setError] = useState(null);

  // ─── Résultat de l'itinéraire ─────────────────────────────────────────────

  const [routeCoords, setRouteCoords] = useState(null);
  const [routePolyline, setRoutePolyline] = useState(null);
  const [routeInvaders, setRouteInvaders] = useState(null);
  const [routePois, setRoutePois] = useState([]);
  const [selectedRoutePoi, setSelectedRoutePoi] = useState(null);
  const [bufferKm, setBufferKm] = useState(0.1);
  const [showOnlyUnflashed, setShowOnlyUnflashed] = useState(false);
  const [selectedRouteInv, setSelectedRouteInv] = useState(null);
  const [flashEffect, setFlashEffect] = useState(null);
  // Invaders flashés à l'instant : gardés affichés le temps que l'animation se joue,
  // avant qu'un filtre « à faire » ne les masque.
  const [recentlyFlashed, setRecentlyFlashed] = useState(() => new Set());
  // Ref pour lire l'overlay courant depuis onRegionChange sans closure périmée.
  const flashEffectRef = useRef(null);
  flashEffectRef.current = flashEffect;
  // Retire l'animation de flash + le sursis d'affichage. Appelé à la fin de l'animation
  // ET dès que la carte bouge (déplacement manuel ou recentrage auto en navigation) —
  // sinon l'alien resterait « collé » à l'écran pendant que la carte se déplace.
  function dismissFlash() {
    const cur = flashEffectRef.current;
    if (!cur) return;
    setFlashEffect(null);
    setRecentlyFlashed((prev) => { const n = new Set(prev); n.delete(cur.invader.id); return n; });
  }
  const [showInfo, setShowInfo] = useState(false);
  const [following, setFollowing] = useState(false);
  const [drifted, setDrifted] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [userHeading, setUserHeading] = useState(null);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const locationSub = useRef(null);
  const headingSub  = useRef(null);

  // ─── GPS au montage ───────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setLocationGranted(true); // affiche le curseur bleu dès l'ouverture
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = [loc.coords.longitude, loc.coords.latitude];
      gpsRef.current = coords;
      setGpsAvailable(true);
      setDepCoords(coords);
      setDepText(GPS_LABEL);

      // Recentre la carte sur l'utilisateur s'il est dans la zone de la ville (comme l'écran Carte)
      const { latitude, longitude } = loc.coords;
      const b = city.bbox;
      const nearCity = latitude >= b.minLat && latitude <= b.maxLat &&
                       longitude >= b.minLng && longitude <= b.maxLng;
      if (nearCity) {
        mapRef.current?.animateToRegion(
          { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          800
        );
      }
    })();
  }, []);

  // ─── Recalcul du couloir quand routeCoords ou bufferKm changent ──────────

  useEffect(() => {
    if (!routeCoords) { setRouteInvaders(null); setSelectedRouteInv(null); return; }
    try {
      const line = turf.lineString(routeCoords);

      // ── Pré-filtre par bounding box (rapide) ──────────────────────────────
      // nearestPointOnLine est coûteux ; on l'évite pour les Invaders manifestement
      // hors couloir en ne gardant que ceux dans la bbox du trajet élargie de bufferKm.
      const [minLng0, minLat0, maxLng0, maxLat0] = turf.bbox(line);
      const midLat = (minLat0 + maxLat0) / 2;
      const padLat = bufferKm / 111;
      const padLng = bufferKm / (111 * Math.cos((midLat * Math.PI) / 180));
      const minLng = minLng0 - padLng, maxLng = maxLng0 + padLng;
      const minLat = minLat0 - padLat, maxLat = maxLat0 + padLat;
      const candidates = invaders.filter(
        (inv) => inv.lng >= minLng && inv.lng <= maxLng && inv.lat >= minLat && inv.lat <= maxLat
      );

      // ── Mesure précise sur les seuls candidats ────────────────────────────
      // On retient aussi `location` : la distance parcourue le long du tracé au
      // point le plus proche. C'est ce qui permet d'ordonner la liste dans le
      // sens de la marche, Invaders et lieux mélangés.
      const nearby = [];
      for (const inv of candidates) {
        const near = turf.nearestPointOnLine(line, turf.point([inv.lng, inv.lat]), { units: 'kilometers' });
        if (near.properties.dist <= bufferKm) nearby.push({ ...inv, along: near.properties.location });
      }
      __DEV__ && console.log(`[Trajet] Couloir : ${candidates.length} candidats (bbox) → ${nearby.length} retenus`);
      setRouteInvaders(nearby);
      setSelectedRouteInv(null);
      // fitToCoordinates est déplacé dans l'effect sur routeInvaders (ci-dessous) :
      // il doit s'exécuter APRÈS que le panneau résultat (260 px) soit apparu,
      // sinon la région est calculée pour une MapView trop haute et des markers
      // se retrouvent cachés derrière le panneau.
    } catch {
      setRouteInvaders([]);
    } finally {
      setLoadingPhase(null);
    }
    // `calcNonce` en dépendance : recalculer DEUX FOIS le même trajet renvoyait
    // la même polyligne (cache de routing.js) et l'effet ne se relançait pas, donc
    // rien n'éteignait le spinner. Le compteur garantit une relance à chaque calcul.
  }, [routeCoords, bufferKm, calcNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Lieux à voir dans le même couloir ──────────────────────────────────────
  // Effet séparé, qui dépend AUSSI des préférences : changer d'objectif met à
  // jour les lieux immédiatement, sans relancer le calcul d'itinéraire. Le
  // couloir est une distance, pas un budget : l'objectif ne répartit donc pas du
  // temps comme dans la Chasse, il fixe seulement combien de lieux on retient.
  useEffect(() => {
    if (!routeCoords) { setRoutePois([]); setSelectedRoutePoi(null); return; }
    const poiCap = ROUTE_POI_CAP[poiPrefs.objective] ?? 0;
    if (poiCap === 0) { setRoutePois([]); setSelectedRoutePoi(null); return; }
    try {
      const line = turf.lineString(routeCoords);
      const [minLng0, minLat0, maxLng0, maxLat0] = turf.bbox(line);
      const midLat = (minLat0 + maxLat0) / 2;
      const padLat = bufferKm / 111;
      const padLng = bufferKm / (111 * Math.cos((midLat * Math.PI) / 180));
      const minLng = minLng0 - padLng, maxLng = maxLng0 + padLng;
      const minLat = minLat0 - padLat, maxLat = maxLat0 + padLat;

      const inCorridor = [];
      for (const p of getPois(currentCityCode)) {
        if (!poiPrefs.families.has(familyOf(p))) continue;
        if (p.lng < minLng || p.lng > maxLng || p.lat < minLat || p.lat > maxLat) continue;
        const near = turf.nearestPointOnLine(line, turf.point([p.lng, p.lat]), { units: 'kilometers' });
        if (near.properties.dist <= bufferKm) inCorridor.push({ ...p, along: near.properties.location });
      }
      // Sélection par notoriété (les plus remarquables du couloir), puis remise
      // dans le sens de la marche pour l'affichage.
      const kept = inCorridor.sort((a, b) => b.fame - a.fame).slice(0, poiCap);
      kept.sort((a, b) => a.along - b.along);
      setRoutePois(kept);
    } catch {
      setRoutePois([]);
    }
    setSelectedRoutePoi(null);
  }, [routeCoords, bufferKm, poiPrefs, currentCityCode, poiDataVersion]);

  // ─── Cadrage carte — déclenché après que routeInvaders est commité ────────
  // À ce stade le panneau résultat (260 px) est déjà rendu, donc la MapView a
  // sa hauteur définitive et fitToCoordinates utilise les bonnes dimensions.

  useEffect(() => {
    if (!routeInvaders || !routeCoords) return;
    // Recherche terminée → on replie totalement le volet du haut
    if (calcCollapseRef.current) {
      calcCollapseRef.current = false;
      setInputCollapsed(true);
    }
    __DEV__ && console.log('[Trajet] Markers rendus sur la carte :', routeInvaders.length);
    const routeLatlngs = routeCoords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
    const invLatlngs = routeInvaders.map((inv) => ({ latitude: inv.lat, longitude: inv.lng }));
    const allCoords = invLatlngs.length > 0 ? [...routeLatlngs, ...invLatlngs] : routeLatlngs;
    mapRef.current?.fitToCoordinates(allCoords, {
      edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, [routeInvaders, routeCoords]);

  // ─── Suivi de position (actif uniquement en mode following) ──────────────

  useEffect(() => {
    if (!following || !routeCoords) {
      locationSub.current?.remove();
      locationSub.current = null;
      setUserPos(null);
      return;
    }
    let cancelled = false;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      (loc) => {
        setUserPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, heading: loc.coords.heading });
        // Enregistre le tracé réel pour le récap/partage de fin de trajet
        recorder.addPoint(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy);
      }
    ).then(sub => {
      if (cancelled) sub.remove();
      else locationSub.current = sub;
    }).catch(() => {});

    Location.watchHeadingAsync(({ trueHeading, magHeading }) => {
      const h = trueHeading >= 0 ? trueHeading : magHeading;
      if (h >= 0) setUserHeading(h);
    }).then(sub => {
      if (cancelled) sub.remove();
      else headingSub.current = sub;
    }).catch(() => {});

    return () => {
      cancelled = true;
      locationSub.current?.remove();
      locationSub.current = null;
      headingSub.current?.remove();
      headingSub.current = null;
    };
  }, [following, routeCoords]);

  // ─── Caméra orientée heading (actif en suivi non-dérivé) ─────────────────

  useEffect(() => {
    if (!following || drifted || !userPos) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: userPos.latitude, longitude: userPos.longitude },
        heading: userPos.heading >= 0 ? userPos.heading : 0,
        zoom: 17,
      },
      { duration: 500 }
    );
  }, [userPos, following, drifted]);

  // ─── Invaders affichés selon le filtre ───────────────────────────────────

  // Valeur débouncée du toggle « À faire » : un basculement rapide ne refait pas
  // l'add/remove des marqueurs à chaque pression (cause de crash MKMapView sous
  // Expo Go). Le Switch, lui, reste réactif via showOnlyUnflashed.
  const [renderUnflashed, setRenderUnflashed] = useState(showOnlyUnflashed);
  useEffect(() => {
    const id = setTimeout(() => setRenderUnflashed(showOnlyUnflashed), 250);
    return () => clearTimeout(id);
  }, [showOnlyUnflashed]);

  const displayInvaders = useMemo(() => {
    if (!routeInvaders) return null;
    // Filtre « À faire » : on masque les déjà flashés ET les détruits (non flashables)
    const base = renderUnflashed
      ? routeInvaders.filter((inv) => !flashed.has(inv.id) && inv.status !== 'destroyed')
      : routeInvaders;
    if (recentlyFlashed.size === 0) return base;
    // Réinjecte les Invaders en cours d'animation s'ils ont été masqués par le filtre
    const baseIds = new Set(base.map((i) => i.id));
    const extra = routeInvaders.filter((i) => recentlyFlashed.has(i.id) && !baseIds.has(i.id));
    return extra.length ? [...base, ...extra] : base;
  }, [routeInvaders, renderUnflashed, flashed, recentlyFlashed]);

  // ─── Découpe du tracé en portion parcourue (gris) + restante (bleu) ──────

  const { walkedPolyline, remainingPolyline } = useMemo(() => {
    if (!routePolyline || !routeCoords || !following || !userPos) {
      return { walkedPolyline: null, remainingPolyline: routePolyline };
    }
    try {
      const line = turf.lineString(routeCoords);
      const nearest = turf.nearestPointOnLine(line, turf.point([userPos.longitude, userPos.latitude]));
      const idx = nearest.properties.index ?? 0;
      const split = nearest.geometry.coordinates;
      const toLl = ([lng, lat]) => ({ latitude: lat, longitude: lng });
      const walked = [...routeCoords.slice(0, idx + 1).map(toLl), { latitude: split[1], longitude: split[0] }];
      const remaining = [{ latitude: split[1], longitude: split[0] }, ...routeCoords.slice(idx + 1).map(toLl)];
      return {
        walkedPolyline: walked.length >= 2 ? walked : null,
        remainingPolyline: remaining.length >= 2 ? remaining : routePolyline,
      };
    } catch {
      return { walkedPolyline: null, remainingPolyline: routePolyline };
    }
  }, [routePolyline, routeCoords, userPos, following]);

  // ─── Gestion du départ ───────────────────────────────────────────────────

  function onDepChange(text) {
    setDepText(text);
    setDepCoords(null);
    clearTimeout(depDebounce.current);
    if (text.length >= MIN_CHARS) {
      setDepSearching(true);
      setDepSugg([]);
      depDebounce.current = setTimeout(async () => {
        const sugg = await autocomplete(text, gpsRef.current, geoOpts);
        setDepSugg(sugg);
        setDepSearching(false);
      }, DEBOUNCE_MS);
    } else {
      setDepSugg([]);
      setDepSearching(false);
    }
  }

  function onDepFocus() { setDepFocused(true); }

  function onDepBlur() {
    setTimeout(() => {
      setDepSugg([]);
      setDepSearching(false);
      setDepFocused(false);
    }, 150);
  }

  function selectDep(s) {
    setDepText(s.label);
    setDepCoords(s.coords);
    setDepSugg([]);
    setDepSearching(false);
    setDepFocused(false);
    Keyboard.dismiss();
  }

  function selectDepGps() {
    setDepText(GPS_LABEL);
    setDepCoords(gpsRef.current);
    setDepSugg([]);
    setDepSearching(false);
    setDepFocused(false);
    Keyboard.dismiss();
  }

  async function onDepFallback() {
    setDepSugg([]);
    setDepSearching(false);
    setDepResolving(true);
    try {
      const result = await geocode(depText, { focus: gpsRef.current, ...geoOpts });
      setDepText(result.label);
      setDepCoords(result.coords);
    } catch {
      // texte conservé ; calculate() retentera au calcul
    } finally {
      setDepResolving(false);
      setDepFocused(false);
      Keyboard.dismiss();
    }
  }

  // ─── Gestion de l'arrivée ─────────────────────────────────────────────────

  function onArrChange(text) {
    setArrText(text);
    setArrCoords(null);
    clearTimeout(arrDebounce.current);
    if (text.length >= MIN_CHARS) {
      setArrSearching(true);
      setArrSugg([]);
      arrDebounce.current = setTimeout(async () => {
        const sugg = await autocomplete(text, gpsRef.current, geoOpts);
        setArrSugg(sugg);
        setArrSearching(false);
      }, DEBOUNCE_MS);
    } else {
      setArrSugg([]);
      setArrSearching(false);
    }
  }

  function onArrFocus() { setArrFocused(true); }

  function onArrBlur() {
    setTimeout(() => {
      setArrSugg([]);
      setArrSearching(false);
      setArrFocused(false);
    }, 150);
  }

  function selectArr(s) {
    setArrText(s.label);
    setArrCoords(s.coords);
    setArrSugg([]);
    setArrSearching(false);
    setArrFocused(false);
    Keyboard.dismiss();
  }

  async function onArrFallback() {
    setArrSugg([]);
    setArrSearching(false);
    setArrResolving(true);
    try {
      const result = await geocode(arrText, { focus: gpsRef.current, ...geoOpts });
      setArrText(result.label);
      setArrCoords(result.coords);
    } catch {
      // texte conservé ; calculate() retentera au calcul
    } finally {
      setArrResolving(false);
      setArrFocused(false);
      Keyboard.dismiss();
    }
  }

  // ─── Échange départ / arrivée ─────────────────────────────────────────────

  function swapDepArr() {
    const tmpText = depText;
    const tmpCoords = depCoords;
    setDepText(arrText);
    setDepCoords(arrCoords);
    setArrText(tmpText);
    setArrCoords(tmpCoords);
    setDepSugg([]);
    setArrSugg([]);
  }

  // ─── Calcul de l'itinéraire ───────────────────────────────────────────────

  async function calculate() {
    Keyboard.dismiss();
    // Portail d'autorisation (v2 : abonnement + quotas). Aujourd'hui : toujours allowed.
    const access = await canUseFeature(FEATURES.TRAJET);
    if (!access.allowed) { /* TODO v2: afficher paywall */ return; }
    if (!arrText.trim()) { setError(t('route.error.noArrival')); return; }
    if (!ORS_API_KEY || ORS_API_KEY === 'VOTRE_CLE_API_ORS_ICI') { setError(t('route.error.noApiKey')); return; }

    setLoadingPhase('route');
    setCalcNonce((n) => n + 1);
    setFollowing(false);
    recorder.cancel(); // nouveau calcul d'itinéraire → abandonne une session en cours
    setError(null);
    setRouteCoords(null);
    setRoutePolyline(null);
    setSelectedRouteInv(null);
    calcCollapseRef.current = true; // repli total dès que les Invaders seront trouvés

    try {
      // ─ Départ ─
      let fromCoords = depCoords;
      if (!fromCoords) {
        if (!depText.trim() || depText === GPS_LABEL) {
          if (!gpsRef.current) throw new Error(t('route.error.noGps'));
          fromCoords = gpsRef.current;
        } else {
          const result = await geocode(depText, { focus: gpsRef.current, ...geoOpts });
          fromCoords = result.coords;
          setDepText(result.label);
          setDepCoords(result.coords);
        }
      }

      // ─ Arrivée ─
      let toCoords = arrCoords;
      if (!toCoords) {
        const result = await geocode(arrText, { focus: gpsRef.current, ...geoOpts });
        toCoords = result.coords;
        setArrText(result.label);
        setArrCoords(result.coords);
      }

      const coords = await route(fromCoords, toCoords, 'foot-walking');
      const latlngs = coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
      setRoutePolyline(latlngs);
      // Phase 2 : le useEffect([routeCoords]) calcule les Invaders ;
      // le useEffect([routeInvaders]) cadrera la carte une fois le panneau affiché
      setLoadingPhase('invaders');
      setRouteCoords(coords);
    } catch (e) {
      setLoadingPhase(null);
      setError(e.message ?? t('route.error.routeCalc'));
    }
  }

  // ─── Sélection / navigation ───────────────────────────────────────────────

  async function startFollowing() {
    // Sans permission, watchPositionAsync échoue et son .catch() avale l'erreur :
    // le suivi était mort en silence et la session enregistrait 0 km. On le dit.
    const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (perm && !perm.granted) {
      Alert.alert(t('session.noGps.title'), t('session.noGps.body'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('session.noGps.settings'), onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
      track('run_start_blocked', { source: 'route', reason: 'no_gps' });
      return;
    }
    setFollowing(true);
    setDrifted(false);
    // Démarre l'enregistrement de session (récap + partage à l'arrêt)
    recorder.begin({ source: 'route', city: currentCityCode, routeCoords });
    track('run_start', { source: 'route', city: currentCityCode });
    if (gpsRef.current) {
      recorder.addPoint(gpsRef.current[1], gpsRef.current[0]);
      mapRef.current?.animateCamera(
        { center: { latitude: gpsRef.current[1], longitude: gpsRef.current[0] }, zoom: 17 },
        { duration: 500 }
      );
    }
  }

  function stopFollowing() {
    setFollowing(false);
    setDrifted(false);
    // Clôt la session → récap + partage (ignoré si rien flashé et < 100 m)
    const draft = recorder.end();
    track('run_stop', {
      source: 'route',
      distanceKm: draft ? Math.round((draft.distanceKm ?? 0) * 10) / 10 : 0,
      durationMin: draft ? Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 60000) : 0,
    });
    if (draft) recordSession(draft, { skipIfEmpty: true });
  }

  // Réinitialise l'itinéraire : efface le trajet calculé, rouvre la saisie,
  // vide le champ d'arrivée et recentre la carte sur l'utilisateur.
  // Le bouton de recalcul reste accessible PENDANT un parcours, et il détruit la
  // session sans récap ni carte. C'est la seule perte réelle du parcours : elle
  // mérite une confirmation, contrairement à « Terminer » qui, lui, produit la carte.
  function askResetRoute() {
    if (!recorder.isActive()) { resetRoute(); return; }
    Alert.alert(t('session.reset.title'), t('session.reset.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('session.reset.confirm'), style: 'destructive',
        onPress: () => { track('run_discard', { source: 'route' }); resetRoute(); } },
    ]);
  }

  function resetRoute() {
    setFollowing(false);
    setDrifted(false);
    recorder.cancel(); // abandon : pas de récap
    setRouteCoords(null);
    setRoutePolyline(null);
    setRouteInvaders(null);
    setSelectedRouteInv(null);
    setError(null);
    setInputCollapsed(false); // rouvre le panneau du haut
    // vide la destination (pas de réécriture par-dessus l'ancienne entrée)
    setArrText('');
    setArrCoords(null);
    setArrSugg([]);
    // recentre sur l'utilisateur (ou la ville courante à défaut)
    if (gpsRef.current) {
      mapRef.current?.animateToRegion(
        { latitude: gpsRef.current[1], longitude: gpsRef.current[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500,
      );
    } else {
      mapRef.current?.animateToRegion(
        { latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta },
        500,
      );
    }
  }

  async function recenter() {
    if (following) {
      setDrifted(false);
      return;
    }
    try {
      // Position connue instantanément (position live si suivi, sinon dernier fix connu)
      // → évite d'attendre un NOUVEAU fix GPS, lent sur Android. Repli sur un fix courant.
      let loc = userPos ? { coords: userPos } : await Location.getLastKnownPositionAsync();
      if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (loc) {
        mapRef.current?.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }, 400);
      }
    } catch {}
  }

  function selectRouteInvader(inv) {
    setSelectedRouteInv(inv);
    if (following) setDrifted(true);
    mapRef.current?.animateToRegion(
      { latitude: inv.lat, longitude: inv.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      400
    );
  }

  // Flash depuis la fiche Trajet, avec l'animation de récompense (pop + « +X PTS »),
  // identique à l'écran Carte.
  async function handleFlashRoute(id) {
    const willFlash = !flashed.has(id);
    if (!willFlash) { toggleFlash(id); return; } // dé-flash : silencieux, pas d'animation

    const inv = (routeInvaders ?? invaders).find((i) => i.id === id);
    // On garde l'Invader visible pendant l'animation (sinon le filtre « à faire »
    // le retire instantanément et coupe l'effet de récompense).
    if (inv) setRecentlyFlashed((prev) => new Set(prev).add(id));
    toggleFlash(id);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (!inv || !mapRef.current) return;
    try {
      const point = await mapRef.current.pointForCoordinate({ latitude: inv.lat, longitude: inv.lng });
      setFlashEffect({ invader: inv, point, key: Date.now() });
    } catch (_) {
      setRecentlyFlashed((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

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

  // ─── Rendu ───────────────────────────────────────────────────────────────

  // depShowEmpty / arrShowEmpty conditionnés à *Focused : ferme le dropdown après blur
  const depShowEmpty = depText.length >= MIN_CHARS && !depSearching && depSugg.length === 0 && !depCoords && depFocused;
  const arrShowEmpty = arrText.length >= MIN_CHARS && !arrSearching && arrSugg.length === 0 && !arrCoords && arrFocused;
  const showDepGpsOption = gpsAvailable && depFocused && depText !== GPS_LABEL;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>

        {/* ── Carte + carte flottante + boutons ── */}
        <View style={styles.mapContainer}>
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
          onPress={() => Keyboard.dismiss()}
          onPanDrag={() => { if (following) setDrifted(true); }}
          onRegionChange={dismissFlash}
        >
          {routePolyline && (
            <>
              <Polyline coordinates={remainingPolyline ?? routePolyline} strokeColor={theme.accent} strokeWidth={4} lineCap="round" />
              {walkedPolyline && (
                <Polyline coordinates={walkedPolyline} strokeColor={theme.textSecondary} strokeWidth={4} lineCap="round" />
              )}
              {/* Repère départ — masqué en suivi et quand le départ est la position GPS */}
              {!following && depText !== GPS_LABEL && (
              <PinMarker
                key="route-dep"
                coordinate={routePolyline[0]}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.pinDep}>
                  <Ionicons name="navigate" size={16} color="#fff" />
                </View>
              </PinMarker>
              )}
              {/* Repère arrivée */}
              <PinMarker
                key="route-arr"
                coordinate={routePolyline[routePolyline.length - 1]}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.pinArr}>
                  <Ionicons name="flag" size={16} color="#fff" />
                </View>
              </PinMarker>
            </>
          )}
          {displayInvaders?.map((inv) => {
            const isFlashed = flashed.has(inv.id);
            // Android : pendant l'animation de flash, on masque le vrai marqueur natif —
            // l'alien animé de l'overlay le remplace (sinon doublon décalé).
            if (Platform.OS === 'android' && flashEffect && flashEffect.invader.id === inv.id) {
              return null;
            }
            return (
              <InvaderMarker
                key={Platform.OS === 'android' ? inv.id : `${inv.id}-${isFlashed ? 1 : 0}`}
                invader={inv}
                isFlashed={isFlashed}
                label={`${inv.id}, ${t(`common.status.${inv.status}`)}, ${t(isFlashed ? 'map.a11y.flashed' : 'map.a11y.todo')}`}
                hint={t('map.a11y.invaderHint')}
                onPress={() => selectRouteInvader(inv)}
              />
            );
          })}
          {/* Lieux du couloir : même losange doré que sur la Carte et la Chasse */}
          {!isChangingCity && routePois.map((poi) => (
            <PoiMarker
              key={`poi-${poi.id}`}
              poi={poi}
              label={`${poi.name}, ${t(`hunt.poiTheme.${poi.theme}`)}`}
              hint={t('poi.a11y.openHint')}
              onPress={() => { setSelectedRoutePoi(poi); setSelectedRouteInv(null); track('poi_open', { from: 'route', theme: poi.theme, lang: i18n.language }); }}
            />
          ))}
          {!isChangingCity && <HeadingCone userLocation={userPos} heading={userHeading} />}
        </MapView>

        {isChangingCity && <View style={[StyleSheet.absoluteFillObject, styles.cityTransitionOverlay]} />}

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

        {/* ── Carte flottante d'itinéraire (au-dessus de la carte) ── */}
        {!isChangingCity && !following && (
          <View style={[styles.inputCard, { top: insets.top + 8 }]}>
            {loadingPhase !== null ? (
              /* Pendant le calcul : volet replié, seul le bandeau de recherche s'affiche */
              <View style={styles.searchingBanner}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={styles.searchingText}>{t('route.searchingInvaders')}</Text>
              </View>
            ) : !inputCollapsed ? (
              <ScrollView
                contentContainerStyle={styles.inputContent}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
              >
                <AddressInput
                  inputRef={depInputRef}
                  value={depText}
                  onChange={onDepChange}
                  onSelect={selectDep}
                  onFocus={onDepFocus}
                  onBlur={onDepBlur}
                  onSubmitEditing={() => arrInputRef.current?.focus()}
                  onFallback={onDepFallback}
                  searching={depSearching}
                  showEmpty={depShowEmpty}
                  suggestions={depSugg}
                  placeholder={t('route.departurePlaceholder')}
                  iconName="navigate"
                  iconColor={theme.accent}
                  isConfirmed={depCoords !== null}
                  resolving={depResolving}
                  gpsOption={showDepGpsOption}
                  onSelectGps={selectDepGps}
                />
                <View style={styles.dividerRow}>
                  <View style={styles.inputDivider} />
                  <TouchableOpacity style={styles.swapBtn} onPress={swapDepArr}>
                    <Ionicons name="swap-vertical" size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
                <AddressInput
                  inputRef={arrInputRef}
                  value={arrText}
                  onChange={onArrChange}
                  onSelect={selectArr}
                  onFocus={onArrFocus}
                  onBlur={onArrBlur}
                  onSubmitEditing={calculate}
                  onFallback={onArrFallback}
                  searching={arrSearching}
                  showEmpty={arrShowEmpty}
                  suggestions={arrSugg}
                  placeholder={t('route.arrivalPlaceholder')}
                  iconName="location"
                  iconColor={theme.textSecondary}
                  isConfirmed={arrCoords !== null}
                  resolving={arrResolving}
                  gpsOption={false}
                  onSelectGps={null}
                />
                <TouchableOpacity
                  style={[styles.goBtn, styles.goBtnFull, (loadingPhase || !depCoords || !arrCoords) && styles.goBtnDisabled]}
                  onPress={calculate}
                  disabled={loadingPhase !== null || !depCoords || !arrCoords}
                >
                  <Text style={styles.goBtnText}>{t('route.calculate')}</Text>
                </TouchableOpacity>
                <View style={styles.bufferSection}>
                  <View style={styles.bufferHeader}>
                    <Text style={styles.bufferLabel}>
                      {t('route.corridor', { label: BUFFER_OPTIONS.find(o => o.value === bufferKm)?.label })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowInfo(v => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="information-circle-outline" size={17} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Slider
                    style={styles.bufferSlider}
                    minimumValue={0}
                    maximumValue={2}
                    step={1}
                    value={BUFFER_OPTIONS.findIndex(o => o.value === bufferKm)}
                    onValueChange={idx => setBufferKm(BUFFER_OPTIONS[idx].value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  {showInfo && (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoText}>{t('route.corridorInfo')}</Text>
                    </View>
                  )}
                </View>

                {/* ── Objectif : mêmes trois modes que la Chasse ── */}
                {hasPois(currentCityCode) && (
                  <View style={styles.bufferSection}>
                    <Text style={styles.bufferLabel}>{t('hunt.objective.label')}</Text>
                    <View style={styles.objRow}>
                      {[
                        { key: 'pure',     icon: 'game-controller-outline' },
                        { key: 'balanced', icon: 'swap-horizontal-outline' },
                        { key: 'visit',    icon: 'business-outline' },
                      ].map(({ key, icon }) => {
                        const active = poiPrefs.objective === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[styles.objBtn, active && styles.objBtnActive]}
                            onPress={() => setPoiPref({ objective: key })}
                            activeOpacity={0.8}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={t(`hunt.objective.${key}`)}
                          >
                            <Ionicons name={icon} size={17} color={active ? theme.bg : theme.textSecondary} />
                            <Text style={[styles.objText, active && styles.objTextActive]} numberOfLines={1}>
                              {t(`hunt.objective.${key}`)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.objHint}>{t(`route.objectiveHint_${poiPrefs.objective}`)}</Text>
                  </View>
                )}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </ScrollView>
            ) : null}
            {loadingPhase === null && (
              <TouchableOpacity style={styles.collapseBtn} onPress={() => setInputCollapsed(v => !v)}>
                <Ionicons name={inputCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Zone basse : boutons + panel empilés (boutons toujours au-dessus) ── */}
        {!isChangingCity && <View style={styles.bottomZone} pointerEvents="box-none">
          {/* Le bénéfice de « Démarrer » est invisible au moment du choix : on
              l'annonce, sinon personne ne devine qu'il prépare la carte de fin. */}
          {routePolyline && !following && (
            <View style={styles.startHintWrap} pointerEvents="none">
              <Text style={styles.startHint} numberOfLines={2}>{t('session.startHint')}</Text>
            </View>
          )}
          {routePolyline && (
            <View style={styles.overlayRow} pointerEvents="box-none">
              {following ? (
                <TouchableOpacity style={styles.stopBtn} onPress={stopFollowing}>
                  <Ionicons name="flag-outline" size={18} color="#fff" />
                  <Text style={styles.trackBtnText}>{t('route.quit')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.startBtn} onPress={startFollowing}>
                  <Text style={styles.startBtnText}>{t('hunt.start')}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.rightControls}>
                {(!following || drifted) && (
                  <TouchableOpacity style={styles.recenterBtn} onPress={recenter}>
                    <Ionicons name="locate-outline" size={22} color={theme.accent} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.recenterBtn} onPress={askResetRoute} accessibilityLabel={t('common.reset')}>
                  <Ionicons name="refresh" size={20} color={theme.accent} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          {selectedRoutePoi && (
            <PoiSheet inline poi={selectedRoutePoi} onClose={() => setSelectedRoutePoi(null)} />
          )}
          {selectedRouteInv && (
            <InvaderPanel
              invader={selectedRouteInv}
              onToggleFlash={handleFlashRoute}
              onNavigate={(lat, lng) => openNavigationApp(mapsApp ?? 'apple', lat, lng)}
              onClose={(opts) => {
                setSelectedRouteInv(null);
                // Pas de reprise du suivi auto après un FLASH : on marque souvent
                // plusieurs Invaders d'affilée, un recentrage entre chaque serait une gêne.
                if (following && !opts?.fromFlash) setDrifted(false);
              }}
              autoCloseOnAction={following}
            />
          )}
        </View>}
        </View>

        {/* ── Panneau de résultat (masqué en navigation ou quand une fiche est ouverte) ── */}
        {!isChangingCity && !following && !selectedRouteInv && routeInvaders !== null && displayInvaders !== null && (
          <RoutePanel
            allInvaders={routeInvaders}
            displayInvaders={displayInvaders}
            flashed={flashed}
            statusColors={statusColors}
            showOnlyUnflashed={showOnlyUnflashed}
            onToggleFilter={setShowOnlyUnflashed}
            onSelectInvader={selectRouteInvader}
            onWidenCorridor={() => setInputCollapsed(false)}
            pois={routePois}
            onSelectPoi={(poi) => { setSelectedRoutePoi(poi); setSelectedRouteInv(null); track('poi_open', { from: 'route_list', theme: poi.theme, lang: i18n.language }); }}
          />
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles thémés ───────────────────────────────────────────────────────────

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1 },

    // ── Carte flottante d'itinéraire ────────────────────────────────────────
    inputCard: {
      position: 'absolute', left: 12, right: 12,
      backgroundColor: t.surface,
      borderRadius: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25, shadowRadius: 14, elevation: 10, zIndex: 20,
    },
    inputContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
    collapseBtn: {
      alignItems: 'center', paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },

    inputRow: { flexDirection: 'row', alignItems: 'center' },
    inputIcon: { marginRight: 10, width: 20, textAlign: 'center' },
    inputField: { flex: 1, fontSize: 15, color: t.textPrimary, paddingVertical: 10 },
    inputAdornment: { marginLeft: 8 },

    dividerRow: { flexDirection: 'row', alignItems: 'center' },
    inputDivider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.border },
    swapBtn: { padding: 6, marginLeft: 8, borderRadius: 14, backgroundColor: t.surfaceHigh },

    suggestions: {
      backgroundColor: t.surface, borderRadius: 8, marginTop: 4, marginBottom: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15, shadowRadius: 6, elevation: 6, overflow: 'hidden',
    },
    suggItem: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: t.surface },
    suggBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    suggText: { fontSize: 14, color: t.textPrimary },
    gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    gpsRowText: { fontSize: 14, color: t.accent, fontWeight: '500' },
    suggState: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
    suggStateText: { fontSize: 14, color: t.textSecondary },
    suggFallbackText: { fontSize: 14, color: t.accent, fontStyle: 'italic' },

    controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    goBtn: {
      backgroundColor: t.accent, borderRadius: 20,
      paddingHorizontal: 18, paddingVertical: 8, alignItems: 'center',
    },
    goBtnFull: { marginTop: 10, paddingVertical: 12 },
    goBtnDisabled: { opacity: 0.55 },
    goBtnText: { color: t.bg, fontWeight: '600', fontSize: 14 },

    bufferSection: { marginTop: 10 },
    bufferHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    bufferLabel: { fontSize: 13, color: t.textSecondary },
    bufferSlider: { width: '100%', height: 32, marginTop: 2 },
    infoCard: { marginTop: 6, backgroundColor: t.surfaceHigh, borderRadius: 10, padding: 12 },
    infoText: { fontSize: 13, color: t.textSecondary, lineHeight: 18 },

    searchingBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 16,
    },
    searchingText: { fontSize: 14, color: t.textPrimary, fontWeight: '500' },
    errorText: { fontSize: 13, color: t.destructive, marginTop: 10 },

    // ── Carte ───────────────────────────────────────────────────────────────
    mapContainer: { flex: 1 },
    map: { flex: 1 },
    cityTransitionOverlay: { backgroundColor: t.bg },
    pinDep: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
    },
    pinArr: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: '#333', alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
    },

    bottomZone: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
    },
    overlayRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
      paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8,
    },
    rightControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // Pastille d'annonce au-dessus de « Démarrer ». Fond opaque obligatoire :
    // posée sur la carte, une simple ligne de texte devient illisible dès qu'elle
    // passe sur un bâtiment clair ou un parc.
    startHintWrap: { paddingHorizontal: 12, paddingBottom: 6, alignItems: 'flex-start' },
    startHint: {
      fontSize: 11, color: t.textSecondary, backgroundColor: t.surface,
      borderWidth: 1, borderColor: t.border, borderRadius: 10,
      paddingHorizontal: 9, paddingVertical: 4, maxWidth: '82%',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
    },
    startBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.accent, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    stopBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.surfaceHigh, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    trackBtnText: { color: t.textPrimary, fontWeight: '600', fontSize: 14 },
    startBtnText: { color: '#000', fontWeight: '600', fontSize: 14 },
    recenterBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },

    // ── Panneau résultat ─────────────────────────────────────────────────────
    routePanel: {
      height: 260, backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },
    routePanelHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    routeSummary: { fontSize: 14, fontWeight: '600', color: t.textPrimary, lineHeight: 20 },
    routePoiCount: { color: t.accentScore, fontWeight: '700' },
    // Ligne « lieu » : même hauteur que routeRow, losange doré au lieu du point
    routePoiDiamond: {
      width: 10, height: 10, borderRadius: 2, flexShrink: 0,
      backgroundColor: t.accentScore, transform: [{ rotate: '45deg' }],
    },
    routePoiName:  { flex: 1, fontWeight: '600', fontSize: 14, color: t.accentScore },
    routePoiTheme: { fontSize: 12, color: t.textSecondary, maxWidth: 120 },
    // Objectif : mêmes trois modes que la Chasse, même vocabulaire
    objRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
    objBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
      paddingVertical: 9, paddingHorizontal: 6, borderRadius: 10,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceHigh,
    },
    objBtnActive: { backgroundColor: t.accentScore, borderColor: t.accentScore },
    objText: { fontSize: 11.5, fontWeight: '600', color: t.textSecondary },
    objTextActive: { color: t.bg },
    objHint: { marginTop: 8, fontSize: 12, lineHeight: 17, color: t.textSecondary },
    toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    toggleLabel: { fontSize: 13, color: t.textSecondary },
    routeList: { flex: 1 },
    listEmpty: { fontSize: 14, color: t.textSecondary, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
    routeEmpty: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 18 },
    routeEmptyHint: { fontSize: 13, color: t.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 14 },
    widenBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9,
    },
    widenBtnText: { color: t.bg, fontWeight: '600', fontSize: 14 },

    routeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, gap: 10 },
    routeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    routeId: { fontWeight: '600', fontSize: 14, color: t.textPrimary, width: 84 },
    routePts: { fontSize: 13, color: t.textSecondary, flex: 1 },
    routeBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: t.surfaceHigh },
    routeBadgeFlashed: { backgroundColor: t.accentDim },
    routeBadgeText: { fontSize: 12, fontWeight: '500', color: t.textSecondary },
    routeBadgeTextFlashed: { color: t.statusOk },

    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 16 },

  });
}
