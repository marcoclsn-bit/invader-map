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
import { INVADERS } from '../data/invaders';
import { STATUS_COLOR } from '../constants';
import { ORS_API_KEY } from '../config/ors';
import { useAppContext } from '../context/AppContext';

const PARIS = { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.12, longitudeDelta: 0.12 };
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
    let msg = "Calcul d'itinéraire impossible";
    try { const e = await res.json(); msg = e?.error?.message ?? e?.message ?? msg; } catch {}
    throw new Error(msg);
  }
  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error('Itinéraire introuvable');
  return {
    coords: feature.geometry.coordinates,
    durationMin: Math.round(feature.properties.summary.duration / 60),
  };
}

async function orsAutocomplete(text, focusCoords) {
  const focus = focusCoords
    ? `focus.point.lat=${focusCoords[1]}&focus.point.lon=${focusCoords[0]}`
    : 'focus.point.lat=48.8566&focus.point.lon=2.3522';
  try {
    const res = await fetch(
      `https://api.openrouteservice.org/geocode/autocomplete` +
      `?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}` +
      `&${focus}&boundary.country=FR&size=5`
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
    `&focus.point.lat=48.8566&focus.point.lon=2.3522&boundary.country=FR&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Adresse introuvable');
  const json = await res.json();
  if (!json.features?.length) throw new Error(`Adresse introuvable : « ${text} »`);
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

// ─── Ligne de résultat ────────────────────────────────────────────────────────

function HuntRow({ inv, index, isFlashed, statusColors, onPress }) {
  return (
    <TouchableOpacity style={styles.huntRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.orderBadge}>
        <Text style={styles.orderNum}>{index + 1}</Text>
      </View>
      <View style={[styles.huntDot, { backgroundColor: statusColors[inv.status] ?? STATUS_COLOR[inv.status] }]} />
      <Text style={styles.huntId}>{inv.id}</Text>
      <Text style={styles.huntPts}>{inv.points} pts</Text>
      {isFlashed && (
        <View style={styles.flashedBadge}>
          <Text style={styles.flashedBadgeText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Écran Chasse ─────────────────────────────────────────────────────────────

export default function ChasseScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const gpsRef = useRef(null);
  const quartierInputRef = useRef(null);
  const debounce = useRef(null);
  const locationSub = useRef(null);

  const { flashed, statusColors } = useAppContext();

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

  // ─── Résultat + navigation ─────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedInv, setSelectedInv] = useState(null);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [following, setFollowing] = useState(false);
  const [drifted, setDrifted] = useState(false);
  const [userPos, setUserPos] = useState(null);

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
      const candidates = INVADERS.filter(inv =>
        inv.status !== 'destroyed' &&
        (!unflashedOnly || !flashed.has(inv.id))
      );

      const selected = greedyHunt(startLon, startLat, candidates, budgetMin, SPEEDS[profile]);

      if (selected.length === 0) {
        setError("Aucun Invader atteignable avec ce budget. Essaie d'augmenter le temps ou de changer de point de départ.");
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
      setError(e.message ?? 'Erreur lors de la génération');
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
            showsCompass={false}
            showsUserLocation={gpsReady}
            initialRegion={PARIS}
            onPress={() => Keyboard.dismiss()}
            onPanDrag={() => { if (following) setDrifted(true); }}
          >
            {result && (
              <>
                {/* Tracé — gris derrière, orange devant */}
                {walkedPolyline && (
                  <Polyline coordinates={walkedPolyline} strokeColor="#B0B0BA" strokeWidth={4} lineCap="round" />
                )}
                <Polyline
                  coordinates={remainingPolyline ?? result.polyline}
                  strokeColor="#FF9500"
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
                      { key: 'around',   label: 'Autour de moi',   icon: 'locate-outline' },
                      { key: 'quartier', label: 'Dans un quartier', icon: 'map-outline' },
                    ].map(m => (
                      <TouchableOpacity key={m.key}
                        style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
                        onPress={() => setMode(m.key)}
                      >
                        <Ionicons name={m.icon} size={13} color={mode === m.key ? '#fff' : '#636366'} />
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
                        <Ionicons name="location-outline" size={15} color="#8E8E93" style={styles.qIcon} />
                        <TextInput
                          ref={quartierInputRef}
                          style={styles.qField}
                          placeholder="Quartier ou adresse"
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
                        {qResolving && <ActivityIndicator size="small" color="#8E8E93" />}
                        {qCoords && !qResolving && (
                          <Ionicons name="checkmark-circle" size={17} color="#34C759" />
                        )}
                        {qSearching && !qResolving && <ActivityIndicator size="small" color="#8E8E93" />}
                      </View>
                      {showQDropdown && (
                        <View style={styles.suggestions}>
                          {qSearching ? (
                            <View style={styles.suggState}>
                              <ActivityIndicator size="small" color="#8E8E93" />
                              <Text style={styles.suggStateText}>Recherche…</Text>
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
                                <Text style={styles.suggStateText}>Aucun résultat</Text>
                              </View>
                              <TouchableOpacity style={[styles.suggItem, styles.suggBorder]} onPress={onQFallback}>
                                {qResolving
                                  ? <ActivityIndicator size="small" color="#FF9500" />
                                  : <Text style={styles.suggFallbackText} numberOfLines={1}>
                                      Utiliser « {qText} »
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
                  <Text style={styles.fieldLabel}>Temps : {formatBudget(budgetMin)}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={12}
                    step={1}
                    value={budgetMin / 15}
                    onValueChange={v => setBudgetMin(Math.round(v) * 15)}
                    minimumTrackTintColor="#FF9500"
                    maximumTrackTintColor="#E5E5EA"
                    thumbTintColor="#FF9500"
                  />

                  {/* Transport */}
                  <View style={styles.transportRow}>
                    <Text style={styles.fieldLabel}>Transport</Text>
                    <View style={styles.segmented}>
                      {[
                        { key: 'foot-walking',    label: 'À pied', icon: 'walk-outline' },
                        { key: 'cycling-regular', label: 'Vélo',   icon: 'bicycle-outline' },
                      ].map(p => (
                        <TouchableOpacity key={p.key}
                          style={[styles.segBtn, profile === p.key && styles.segBtnActive]}
                          onPress={() => setProfile(p.key)}
                        >
                          <Ionicons name={p.icon} size={15} color={profile === p.key ? '#fff' : '#636366'} />
                          <Text style={[styles.segBtnText, profile === p.key && styles.segBtnTextActive]}>
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Toggle */}
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Non flashés uniquement</Text>
                    <Switch
                      value={unflashedOnly}
                      onValueChange={setUnflashedOnly}
                      trackColor={{ false: '#E5E5EA', true: '#FF9500' }}
                      thumbColor="#fff"
                    />
                  </View>

                  {/* Bouton générer */}
                  <TouchableOpacity
                    style={[styles.genBtn, (!startReady || loading) && styles.genBtnDisabled]}
                    onPress={generate}
                    disabled={!startReady || loading}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.genBtnText}>Générer la chasse</Text>
                    }
                  </TouchableOpacity>

                  {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : mode === 'around' && !gpsReady ? (
                    <Text style={styles.hintText}>En attente de la position GPS…</Text>
                  ) : null}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.collapseBtn} onPress={() => setInputCollapsed(v => !v)}>
                <Ionicons name={inputCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Boutons flottants (Démarrer / Quitter / Recentrer) ── */}
          {result && (
            <View style={styles.mapOverlay} pointerEvents="box-none">
              {following ? (
                <TouchableOpacity style={styles.stopBtn} onPress={stopFollowing}>
                  <Ionicons name="stop-circle-outline" size={18} color="#fff" />
                  <Text style={styles.trackBtnText}>Quitter</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.startBtn} onPress={startFollowing}>
                  <Text style={styles.trackBtnText}>Démarrer</Text>
                </TouchableOpacity>
              )}
              {(!following || drifted) && (
                <TouchableOpacity style={styles.recenterBtn} onPress={recenter}>
                  <Ionicons name="locate-outline" size={22} color="#FF9500" />
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
                {result.invaders.length} Invader{result.invaders.length > 1 ? 's' : ''}
                {' · '}{result.totalPts} pts{' · '}~{formatBudget(result.durationMin)}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },

  // ── Carte flottante ────────────────────────────────────────────────────────
  inputCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 10,
    zIndex: 20,
  },
  inputContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  collapseBtn: {
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },

  // ── Sélecteur de mode ──────────────────────────────────────────────────────
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F2F2F7',
  },
  modeBtnActive: { backgroundColor: '#FF9500' },
  modeBtnText: { fontSize: 13, fontWeight: '500', color: '#636366' },
  modeBtnTextActive: { color: '#fff' },

  // ── Champ quartier ─────────────────────────────────────────────────────────
  qWrap: { marginTop: 10 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qIcon: { width: 20, textAlign: 'center' },
  qField: { flex: 1, fontSize: 15, color: '#1C1C1E', paddingVertical: 8 },

  // ── Dropdown ───────────────────────────────────────────────────────────────
  suggestions: {
    backgroundColor: '#fff', borderRadius: 8, marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 6, overflow: 'hidden',
  },
  suggItem: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#fff' },
  suggBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E5EA' },
  suggText: { fontSize: 14, color: '#1C1C1E' },
  suggState: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  suggStateText: { fontSize: 14, color: '#8E8E93' },
  suggFallbackText: { fontSize: 14, color: '#FF9500', fontStyle: 'italic' },

  // ── Champs formulaire ──────────────────────────────────────────────────────
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginVertical: 10 },
  fieldLabel: { fontSize: 13, color: '#8E8E93' },
  slider: { width: '100%', height: 32, marginBottom: 2 },

  transportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  segmented: { flexDirection: 'row', gap: 6 },
  segBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10, backgroundColor: '#F2F2F7',
  },
  segBtnActive: { backgroundColor: '#FF9500' },
  segBtnText: { fontSize: 13, fontWeight: '500', color: '#636366' },
  segBtnTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  toggleLabel: { fontSize: 13, color: '#1C1C1E' },

  genBtn: {
    marginTop: 12, backgroundColor: '#FF9500',
    borderRadius: 20, paddingVertical: 12, alignItems: 'center',
  },
  genBtnDisabled: { opacity: 0.45 },
  genBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  errorText: { fontSize: 13, color: '#FF3B30', marginTop: 8, textAlign: 'center' },
  hintText: { fontSize: 12, color: '#8E8E93', marginTop: 6, textAlign: 'center' },

  // ── Boutons navigation ─────────────────────────────────────────────────────
  mapOverlay: {
    position: 'absolute',
    bottom: 12, left: 12, right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF9500', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1C1C1E', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  trackBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  recenterBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },

  // ── Marqueurs carte ────────────────────────────────────────────────────────
  pinStart: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF9500',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
  },
  huntMarker: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF9500',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
  },
  huntMarkerSel: { backgroundColor: '#1C1C1E', borderColor: '#FF9500' },
  huntMarkerNum: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // ── Panneau résultat ───────────────────────────────────────────────────────
  resultPanel: {
    height: 220,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  resultHeader: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
  },
  resultSummary: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  resultList: { flex: 1 },

  huntRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, gap: 10 },
  orderBadge: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF9500',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  orderNum: { color: '#fff', fontSize: 11, fontWeight: '700' },
  huntDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  huntId: { fontWeight: '600', fontSize: 14, color: '#1C1C1E', width: 80 },
  huntPts: { fontSize: 13, color: '#636366', flex: 1 },
  flashedBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#E8F9EE' },
  flashedBadgeText: { fontSize: 12, fontWeight: '600', color: '#34C759' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginLeft: 16 },
});
