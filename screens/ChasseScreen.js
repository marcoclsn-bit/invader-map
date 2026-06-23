import { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  FlatList, Switch, ScrollView, Keyboard, Platform, KeyboardAvoidingView,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
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
import { INVADER_DISTRICT, arLabel } from '../utils/arrondissement';
import { useTheme } from '../theme/ThemeContext';

// Palier 1 : référence PA — les fonctions ORS accepteront un paramètre ville en Palier 2
const _PA        = CITIES.PA;
const PARIS      = { latitude: _PA.center.lat, longitude: _PA.center.lng, ..._PA.mapDelta };
const _ORS_FOCUS = `focus.point.lat=${_PA.center.lat}&focus.point.lon=${_PA.center.lng}`;
const _ORS_CTY   = _PA.orsCountry;
const VISIT_MIN = 2;   // minutes par Invader (observation + photo)
const SPEEDS = { 'foot-walking': 5, 'cycling-regular': 15 }; // km/h
const DEBOUNCE_MS = 300;

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── Algorithme glouton ───────────────────────────────────────────────────────

function greedyHunt(startLon, startLat, candidates, budgetMin, speedKmh) {
  const speedKmPerMin = speedKmh / 60;
  const maxRadiusKm = (budgetMin * speedKmPerMin) / 2;

  let available = candidates.filter(inv => {
    const d = haversineKm(startLat, startLon, inv.lat, inv.lng);
    return d <= maxRadiusKm && inv.status !== 'destroyed';
  });

  const selected = [];
  let curLat = startLat;
  let curLon = startLon;
  let timeLeft = budgetMin;

  while (available.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < available.length; i++) {
      const inv = available[i];
      const tToInv = haversineKm(curLat, curLon, inv.lat, inv.lng) / speedKmPerMin;
      const tReturn = haversineKm(inv.lat, inv.lng, startLat, startLon) / speedKmPerMin;
      if (tToInv + VISIT_MIN + tReturn <= timeLeft) {
        const score = inv.points / (tToInv + VISIT_MIN);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
    }

    if (bestIdx === -1) break;

    const best = available[bestIdx];
    const tToInv = haversineKm(curLat, curLon, best.lat, best.lng) / speedKmPerMin;
    timeLeft -= tToInv + VISIT_MIN;
    curLat = best.lat;
    curLon = best.lng;
    selected.push(best);
    available.splice(bestIdx, 1);
  }

  return selected;
}

// ─── ORS ─────────────────────────────────────────────────────────────────────

async function orsMultiRoute(waypointsLonLat, profile) {
  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: waypointsLonLat }),
    }
  );
  if (!res.ok) {
    let msg = i18n.t('hunt.error.routeCalc');
    try { const e = await res.json(); msg = e?.error?.message ?? e?.message ?? msg; } catch {}
    throw new Error(msg);
  }
  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error(i18n.t('hunt.error.routeNotFound'));
  return {
    coords: feature.geometry.coordinates,
    durationMin: Math.round(feature.properties.summary.duration / 60),
  };
}

async function orsAutocomplete(text, focusCoords) {
  const focus = focusCoords
    ? `focus.point.lat=${focusCoords[1]}&focus.point.lon=${focusCoords[0]}`
    : _ORS_FOCUS;
  try {
    const res = await fetch(
      `https://api.openrouteservice.org/geocode/autocomplete` +
      `?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}` +
      `&${focus}&${_ORS_CTY}&size=5`
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map(f => ({ label: f.properties.label, coords: f.geometry.coordinates }));
  } catch { return []; }
}

async function orsGeocode(text) {
  const url =
    `https://api.openrouteservice.org/geocode/search` +
    `?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}` +
    `&${_ORS_FOCUS}&${_ORS_CTY}&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(i18n.t('hunt.error.addressNotFound'));
  const json = await res.json();
  if (!json.features?.length) throw new Error(i18n.t('hunt.error.addressNotFound'));
  const f = json.features[0];
  return { coords: f.geometry.coordinates, label: f.properties.label };
}

// ─── Formatage ────────────────────────────────────────────────────────────────

function formatBudget(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

// ─── Cache de styles thémés ───────────────────────────────────────────────────

let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const s = makeStyles(theme);
  _styleCache = { theme, styles: s };
  return s;
}

// ─── Ligne de résultat ────────────────────────────────────────────────────────

function HuntRow({ inv, index, isFlashed, statusColors, onPress }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <TouchableOpacity style={styles.huntRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.orderBadge}>
        <Text style={styles.orderNum}>{index + 1}</Text>
      </View>
      <View style={[styles.huntDot, { backgroundColor: statusColors[inv.status] ?? STATUS_COLOR[inv.status] }]} />
      <Text style={styles.huntId}>{inv.id}</Text>
      <Text style={styles.huntPts}>{inv.points} {t('common.pts')}</Text>
      {isFlashed && (
        <View style={styles.flashedBadge}>
          <Text style={styles.flashedBadgeText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Écran Chasse ─────────────────────────────────────────────────────────────

export default function ChasseScreen({ route }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const gpsRef = useRef(null);
  const quartierInputRef = useRef(null);
  const debounce = useRef(null);
  const locationSub = useRef(null);

  const { invaders, flashed, statusColors, currentCityCode } = useAppContext();
  const city = CITIES[currentCityCode] ?? CITIES.PA;
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);

  // ─── GPS ──────────────────────────────────────────────────────────────────
  const [gpsReady, setGpsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      gpsRef.current = [loc.coords.longitude, loc.coords.latitude];
      setGpsReady(true);
    })();
  }, []);

  // ─── Formulaire ───────────────────────────────────────────────────────────
  const [mode, setMode] = useState('around');
  const [qText, setQText] = useState('');
  const [qCoords, setQCoords] = useState(null);
  const [qSugg, setQSugg] = useState([]);
  const [qSearching, setQSearching] = useState(false);
  const [qFocused, setQFocused] = useState(false);
  const [qResolving, setQResolving] = useState(false);

  const [budgetMin, setBudgetMin] = useState(60);
  const [profile, setProfile] = useState('foot-walking');
  const [unflashedOnly, setUnflashedOnly] = useState(true);
  const [arFilter, setArFilter] = useState(null); // c_ar (1-20) ou null = tous Paris

  // ─── Résultat + navigation ─────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedInv, setSelectedInv] = useState(null);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [following, setFollowing] = useState(false);
  const [drifted, setDrifted] = useState(false);
  const [userPos, setUserPos] = useState(null);

  // ─── Preset depuis Palmarès ───────────────────────────────────────────────
  useEffect(() => {
    const preset = route?.params?.arPreset;
    if (!preset) return;
    setMode('quartier');
    setQText(preset.label);
    setQCoords([preset.lon, preset.lat]);
    setArFilter(preset.ar);
    setResult(null);
    setSelectedInv(null);
    setError(null);
    setInputCollapsed(false);
    setFollowing(false);
    setDrifted(false);
    setTimeout(() => {
      mapRef.current?.animateToRegion(
        { latitude: preset.lat, longitude: preset.lon, latitudeDelta: 0.028, longitudeDelta: 0.028 },
        600
      );
    }, 300);
  }, [route?.params?.arPreset?._ts]); // _ts change à chaque tap → déclenche même arr. deux fois

  // ─── Cadrage carte après génération ──────────────────────────────────────
  useEffect(() => {
    if (!result) return;
    const coords = [
      { latitude: result.startLat, longitude: result.startLon },
      ...result.polyline,
    ];
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 60, right: 40, bottom: 260, left: 40 },
      animated: true,
    });
  }, [result]);

  // ─── Suivi de position (mode navigation) ──────────────────────────────────
  useEffect(() => {
    if (!following || !result) {
      locationSub.current?.remove();
      locationSub.current = null;
      setUserPos(null);
      return;
    }
    let cancelled = false;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      loc => setUserPos({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        heading: loc.coords.heading,
      })
    ).then(sub => {
      if (cancelled) sub.remove();
      else locationSub.current = sub;
    }).catch(() => {});
    return () => {
      cancelled = true;
      locationSub.current?.remove();
      locationSub.current = null;
    };
  }, [following, result]);

  // ─── Caméra orientée heading ──────────────────────────────────────────────
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

  // ─── Portion déjà parcourue (gris) vs restante (orange) ──────────────────
  const { walkedPolyline, remainingPolyline } = useMemo(() => {
    if (!result?.polyline || !result?.routeCoords || !following || !userPos) {
      return { walkedPolyline: null, remainingPolyline: result?.polyline ?? null };
    }
    try {
      const line = turf.lineString(result.routeCoords);
      const nearest = turf.nearestPointOnLine(line, turf.point([userPos.longitude, userPos.latitude]));
      const idx = nearest.properties.index ?? 0;
      const split = nearest.geometry.coordinates;
      const toLl = ([lng, lat]) => ({ latitude: lat, longitude: lng });
      const walked = [...result.routeCoords.slice(0, idx + 1).map(toLl), { latitude: split[1], longitude: split[0] }];
      const remaining = [{ latitude: split[1], longitude: split[0] }, ...result.routeCoords.slice(idx + 1).map(toLl)];
      return {
        walkedPolyline: walked.length >= 2 ? walked : null,
        remainingPolyline: remaining.length >= 2 ? remaining : result.polyline,
      };
    } catch {
      return { walkedPolyline: null, remainingPolyline: result.polyline };
    }
  }, [result, userPos, following]);

  // ─── Autocomplétion quartier ──────────────────────────────────────────────
  function onQChange(text) {
    setQText(text);
    setQCoords(null);
    setArFilter(null); // l'utilisateur tape → plus de filtre arrondissement
    clearTimeout(debounce.current);
    if (text.length >= 3) {
      setQSearching(true);
      setQSugg([]);
      debounce.current = setTimeout(async () => {
        const sugg = await orsAutocomplete(text, gpsRef.current);
        setQSugg(sugg);
        setQSearching(false);
      }, DEBOUNCE_MS);
    } else {
      setQSugg([]);
      setQSearching(false);
    }
  }

  function selectQ(s) {
    setQText(s.label);
    setQCoords(s.coords);
    setQSugg([]);
    setQSearching(false);
    setQFocused(false);
    Keyboard.dismiss();
  }

  function onQBlur() {
    setTimeout(() => { setQSugg([]); setQSearching(false); setQFocused(false); }, 150);
  }

  async function onQFallback() {
    setQSugg([]);
    setQSearching(false);
    setQResolving(true);
    try {
      const r = await orsGeocode(qText);
      setQText(r.label);
      setQCoords(r.coords);
    } catch {
      // conserve le texte saisi
    } finally {
      setQResolving(false);
      setQFocused(false);
      Keyboard.dismiss();
    }
  }

  // ─── Génération ───────────────────────────────────────────────────────────
  const startReady = (mode === 'around' ? gpsReady : qCoords !== null) && !qResolving;

  async function generate() {
    Keyboard.dismiss();
    setError(null);
    setResult(null);
    setSelectedInv(null);
    setFollowing(false);
    setDrifted(false);
    setLoading(true);
    try {
      const [startLon, startLat] = mode === 'around' ? gpsRef.current : qCoords;
      const candidates = invaders.filter(inv =>
        inv.status !== 'destroyed' &&
        (!unflashedOnly || !flashed.has(inv.id)) &&
        (arFilter === null || INVADER_DISTRICT.get(inv.id) === arFilter)
      );

      const selected = greedyHunt(startLon, startLat, candidates, budgetMin, SPEEDS[profile]);

      if (selected.length === 0) {
        setError(t('hunt.error.noInvadersReachable'));
        return;
      }

      const waypoints = [
        [startLon, startLat],
        ...selected.map(inv => [inv.lng, inv.lat]),
        [startLon, startLat],
      ];
      const { coords, durationMin } = await orsMultiRoute(waypoints, profile);

      setResult({
        invaders: selected,
        routeCoords: coords,
        polyline: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
        durationMin,
        totalPts: selected.reduce((s, inv) => s + inv.points, 0),
        startLat,
        startLon,
      });
      setInputCollapsed(true);
    } catch (e) {
      setError(e.message ?? t('hunt.error.generation'));
    } finally {
      setLoading(false);
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  function startFollowing() {
    setFollowing(true);
    setDrifted(false);
    if (gpsRef.current) {
      mapRef.current?.animateCamera(
        { center: { latitude: gpsRef.current[1], longitude: gpsRef.current[0] }, zoom: 17 },
        { duration: 500 }
      );
    }
  }

  function stopFollowing() {
    setFollowing(false);
    setDrifted(false);
  }

  async function recenter() {
    if (following) { setDrifted(false); return; }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion(
        { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.003, longitudeDelta: 0.003 },
        400
      );
    } catch {}
  }

  function selectInvader(inv) {
    setSelectedInv(prev => (prev?.id === inv.id ? null : inv));
    mapRef.current?.animateToRegion(
      { latitude: inv.lat, longitude: inv.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 },
      400
    );
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  const qShowEmpty = mode === 'quartier' && qFocused && qText.length >= 3 && !qSearching && qSugg.length === 0 && !qCoords;
  const showQDropdown = mode === 'quartier' && qFocused && (qSearching || qSugg.length > 0 || qShowEmpty);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            mapType="mutedStandard"
            userInterfaceStyle={isDark ? 'dark' : 'light'}
            showsCompass={false}
            showsTraffic={false}
            showsPointsOfInterest={false}
            showsUserLocation={gpsReady}
            initialRegion={{ latitude: city.center.lat, longitude: city.center.lng, ...city.mapDelta }}
            onPress={() => Keyboard.dismiss()}
            onPanDrag={() => { if (following) setDrifted(true); }}
          >
            {result && (
              <>
                {/* Tracé — gris derrière, orange devant */}
                {walkedPolyline && (
                  <Polyline coordinates={walkedPolyline} strokeColor={theme.textSecondary} strokeWidth={4} lineCap="round" />
                )}
                <Polyline
                  coordinates={remainingPolyline ?? result.polyline}
                  strokeColor={theme.accent}
                  strokeWidth={4}
                  lineCap="round"
                />
                {/* Point de départ (masqué en mode navigation : on est dessus) */}
                {!following && (
                  <Marker key="hunt-start" coordinate={{ latitude: result.startLat, longitude: result.startLon }}
                    anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <View style={styles.pinStart}>
                      <Ionicons name="locate" size={16} color="#fff" />
                    </View>
                  </Marker>
                )}
                {result.invaders.map((inv, i) => (
                  <Marker key={inv.id} coordinate={{ latitude: inv.lat, longitude: inv.lng }}
                    anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} onPress={() => selectInvader(inv)}>
                    <View style={[styles.huntMarker, selectedInv?.id === inv.id && styles.huntMarkerSel]}>
                      <Text style={styles.huntMarkerNum}>{i + 1}</Text>
                    </View>
                  </Marker>
                ))}
              </>
            )}
          </MapView>

          {/* ── Carte flottante formulaire (masquée en navigation) ── */}
          {!following && (
            <View style={[styles.inputCard, { top: insets.top + 8 }]}>
              {!inputCollapsed && (
                <ScrollView
                  contentContainerStyle={styles.inputContent}
                  keyboardShouldPersistTaps="handled"
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Sélecteur de mode */}
                  <View style={styles.modeRow}>
                    {[
                      { key: 'around',   label: t('hunt.aroundMe'),     icon: 'locate-outline' },
                      { key: 'quartier', label: t('hunt.neighborhood'),  icon: 'map-outline' },
                    ].map(m => (
                      <TouchableOpacity key={m.key}
                        style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
                        onPress={() => { setMode(m.key); if (m.key === 'around') setArFilter(null); }}
                      >
                        <Ionicons name={m.icon} size={13} color={mode === m.key ? theme.bg : theme.textSecondary} />
                        <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Champ quartier */}
                  {mode === 'quartier' && (
                    <View style={styles.qWrap}>
                      <View style={styles.qRow}>
                        <Ionicons name="location-outline" size={15} color={theme.textSecondary} style={styles.qIcon} />
                        <TextInput
                          ref={quartierInputRef}
                          style={styles.qField}
                          placeholder={t('hunt.neighborhoodPlaceholder')}
                          placeholderTextColor="#C7C7CC"
                          value={qText}
                          onChangeText={onQChange}
                          onFocus={() => setQFocused(true)}
                          onBlur={onQBlur}
                          returnKeyType="done"
                          clearButtonMode="while-editing"
                          autoCorrect={false}
                          autoCapitalize="sentences"
                        />
                        {qResolving && <ActivityIndicator size="small" color={theme.textSecondary} />}
                        {qCoords && !qResolving && (
                          <Ionicons name="checkmark-circle" size={17} color={theme.statusOk} />
                        )}
                        {qSearching && !qResolving && <ActivityIndicator size="small" color={theme.textSecondary} />}
                      </View>
                      {showQDropdown && (
                        <View style={styles.suggestions}>
                          {qSearching ? (
                            <View style={styles.suggState}>
                              <ActivityIndicator size="small" color={theme.textSecondary} />
                              <Text style={styles.suggStateText}>{t('common.searching')}</Text>
                            </View>
                          ) : qSugg.length > 0 ? (
                            qSugg.map((s, i) => (
                              <TouchableOpacity key={i}
                                style={[styles.suggItem, i > 0 && styles.suggBorder]}
                                onPress={() => selectQ(s)}
                              >
                                <Text style={styles.suggText} numberOfLines={1}>{s.label}</Text>
                              </TouchableOpacity>
                            ))
                          ) : qShowEmpty ? (
                            <>
                              <View style={styles.suggState}>
                                <Text style={styles.suggStateText}>{t('common.noResults')}</Text>
                              </View>
                              <TouchableOpacity style={[styles.suggItem, styles.suggBorder]} onPress={onQFallback}>
                                {qResolving
                                  ? <ActivityIndicator size="small" color={theme.accent} />
                                  : <Text style={styles.suggFallbackText} numberOfLines={1}>
                                      {t('hunt.useAddress', { text: qText })}
                                    </Text>
                                }
                              </TouchableOpacity>
                            </>
                          ) : null}
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.divider} />

                  {/* Budget temps */}
                  <Text style={styles.fieldLabel}>{t('hunt.timeLabel', { duration: formatBudget(budgetMin) })}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={12}
                    step={1}
                    value={budgetMin / 15}
                    onValueChange={v => setBudgetMin(Math.round(v) * 15)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />

                  {/* Transport */}
                  <View style={styles.transportRow}>
                    <Text style={styles.fieldLabel}>{t('hunt.transport')}</Text>
                    <View style={styles.segmented}>
                      {[
                        { key: 'foot-walking',    label: t('hunt.walking'),  icon: 'walk-outline' },
                        { key: 'cycling-regular', label: t('hunt.cycling'),  icon: 'bicycle-outline' },
                      ].map(p => (
                        <TouchableOpacity key={p.key}
                          style={[styles.segBtn, profile === p.key && styles.segBtnActive]}
                          onPress={() => setProfile(p.key)}
                        >
                          <Ionicons name={p.icon} size={15} color={profile === p.key ? theme.bg : theme.textSecondary} />
                          <Text style={[styles.segBtnText, profile === p.key && styles.segBtnTextActive]}>
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Toggle */}
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{t('hunt.unflashedOnly')}</Text>
                    <Switch
                      value={unflashedOnly}
                      onValueChange={setUnflashedOnly}
                      trackColor={{ false: theme.border, true: theme.accent }}
                      thumbColor={theme.bg}
                    />
                  </View>

                  {/* Filtre arrondissement actif */}
                  {arFilter !== null && (
                    <View style={styles.arFilterBanner}>
                      <Ionicons name="filter-outline" size={13} color={theme.accent} />
                      <Text style={styles.arFilterText}>
                        {t('hunt.filteredTo', { label: arLabel(arFilter) })}
                      </Text>
                      <TouchableOpacity onPress={() => setArFilter(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close-circle" size={15} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Bouton générer */}
                  <TouchableOpacity
                    style={[styles.genBtn, (!startReady || loading) && styles.genBtnDisabled]}
                    onPress={generate}
                    disabled={!startReady || loading}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.genBtnText}>{t('hunt.generate')}</Text>
                    }
                  </TouchableOpacity>

                  {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : mode === 'around' && !gpsReady ? (
                    <Text style={styles.hintText}>{t('hunt.waitingGps')}</Text>
                  ) : null}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.collapseBtn} onPress={() => setInputCollapsed(v => !v)}>
                <Ionicons name={inputCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Boutons flottants (Démarrer / Quitter / Recentrer) ── */}
          {result && (
            <View style={styles.mapOverlay} pointerEvents="box-none">
              {following ? (
                <TouchableOpacity style={styles.stopBtn} onPress={stopFollowing}>
                  <Ionicons name="stop-circle-outline" size={18} color="#fff" />
                  <Text style={styles.trackBtnText}>{t('hunt.quit')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.startBtn} onPress={startFollowing}>
                  <Text style={styles.trackBtnText}>{t('hunt.start')}</Text>
                </TouchableOpacity>
              )}
              {(!following || drifted) && (
                <TouchableOpacity style={styles.recenterBtn} onPress={recenter}>
                  <Ionicons name="locate-outline" size={22} color={theme.accent} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── Panneau résultat (masqué en navigation ET quand le formulaire est ouvert) ── */}
        {result && !following && inputCollapsed && (
          <View style={styles.resultPanel}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultSummary}>
                {t('hunt.resultCount', { count: result.invaders.length })}
                {' · '}{result.totalPts} {t('common.pts')}{' · '}~{formatBudget(result.durationMin)}
              </Text>
            </View>
            <FlatList
              data={result.invaders}
              keyExtractor={inv => inv.id}
              style={styles.resultList}
              renderItem={({ item: inv, index }) => (
                <HuntRow
                  inv={inv}
                  index={index}
                  isFlashed={flashed.has(inv.id)}
                  statusColors={statusColors}
                  onPress={() => selectInvader(inv)}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              getItemLayout={(_, i) => ({ length: 48, offset: 48 * i, index: i })}
            />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles thémés ───────────────────────────────────────────────────────────

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1 },
    mapContainer: { flex: 1 },
    map: { flex: 1 },

    // ── Carte flottante ──────────────────────────────────────────────────────
    inputCard: {
      position: 'absolute', left: 12, right: 12,
      backgroundColor: t.surface,
      borderRadius: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25, shadowRadius: 14, elevation: 10, zIndex: 20,
    },
    inputContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
    collapseBtn: {
      alignItems: 'center', paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },

    // ── Sélecteur de mode ────────────────────────────────────────────────────
    modeRow: { flexDirection: 'row', gap: 8 },
    modeBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: t.surfaceHigh,
    },
    modeBtnActive: { backgroundColor: t.accent },
    modeBtnText: { fontSize: 13, fontWeight: '500', color: t.textSecondary },
    modeBtnTextActive: { color: t.bg },

    // ── Champ quartier ───────────────────────────────────────────────────────
    qWrap: { marginTop: 10 },
    qRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qIcon: { width: 20, textAlign: 'center' },
    qField: { flex: 1, fontSize: 15, color: t.textPrimary, paddingVertical: 8 },

    // ── Dropdown ─────────────────────────────────────────────────────────────
    suggestions: {
      backgroundColor: t.surface, borderRadius: 8, marginTop: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15, shadowRadius: 6, elevation: 6, overflow: 'hidden',
    },
    suggItem: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: t.surface },
    suggBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    suggText: { fontSize: 14, color: t.textPrimary },
    suggState: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
    suggStateText: { fontSize: 14, color: t.textSecondary },
    suggFallbackText: { fontSize: 14, color: t.accent, fontStyle: 'italic' },

    // ── Champs formulaire ────────────────────────────────────────────────────
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 10 },
    fieldLabel: { fontSize: 13, color: t.textSecondary },
    slider: { width: '100%', height: 32, marginBottom: 2 },

    transportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    segmented: { flexDirection: 'row', gap: 6 },
    segBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 7,
      borderRadius: 10, backgroundColor: t.surfaceHigh,
    },
    segBtnActive: { backgroundColor: t.accent },
    segBtnText: { fontSize: 13, fontWeight: '500', color: t.textSecondary },
    segBtnTextActive: { color: t.bg },

    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    toggleLabel: { fontSize: 13, color: t.textPrimary },

    genBtn: {
      marginTop: 12, backgroundColor: t.accent,
      borderRadius: 20, paddingVertical: 12, alignItems: 'center',
    },
    genBtnDisabled: { opacity: 0.45 },
    genBtnText: { color: t.bg, fontWeight: '600', fontSize: 15 },
    errorText: { fontSize: 13, color: t.destructive, marginTop: 8, textAlign: 'center' },
    hintText: { fontSize: 12, color: t.textSecondary, marginTop: 6, textAlign: 'center' },

    arFilterBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.accentDim, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 7, marginTop: 10,
    },
    arFilterText: { flex: 1, fontSize: 12, color: t.accent, fontWeight: '500' },

    // ── Boutons navigation ───────────────────────────────────────────────────
    mapOverlay: {
      position: 'absolute', bottom: 12, left: 12, right: 12,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    },
    startBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.accent, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    stopBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.surfaceHigh, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },
    trackBtnText: { color: t.textPrimary, fontWeight: '600', fontSize: 14 },
    recenterBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    },

    // ── Marqueurs carte ──────────────────────────────────────────────────────
    pinStart: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
    },
    huntMarker: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
    },
    huntMarkerSel: { backgroundColor: t.textPrimary, borderColor: t.accent },
    huntMarkerNum: { color: t.bg, fontSize: 11, fontWeight: '700' },

    // ── Panneau résultat ─────────────────────────────────────────────────────
    resultPanel: {
      height: 220, backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },
    resultHeader: {
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    resultSummary: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
    resultList: { flex: 1 },

    huntRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, gap: 10 },
    orderBadge: {
      width: 22, height: 22, borderRadius: 11, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    orderNum: { color: t.bg, fontSize: 11, fontWeight: '700' },
    huntDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    huntId: { fontWeight: '600', fontSize: 14, color: t.textPrimary, width: 80 },
    huntPts: { fontSize: 13, color: t.textSecondary, flex: 1 },
    flashedBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: t.accentDim },
    flashedBadgeText: { fontSize: 12, fontWeight: '600', color: t.statusOk },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 16 },
  });
}
