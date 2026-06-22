import { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  FlatList, Switch, Alert, Linking, Keyboard, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as turf from '@turf/turf';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { INVADERS } from '../data/invaders';
import { STATUS_COLOR, STATUS_LABEL } from '../constants';
import { ORS_API_KEY } from '../config/ors';
import { useAppContext } from '../context/AppContext';
import { getMarkerColor } from '../utils/markerColor';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

const PARIS = { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;
const GPS_TOKEN = 'Ma position';
const ORS_COUNTRY = 'boundary.country=FR';

const BUFFER_OPTIONS = [
  { label: '50 m',  value: 0.05 },
  { label: '100 m', value: 0.1  },
  { label: '250 m', value: 0.25 },
];

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

// ─── Appels ORS ──────────────────────────────────────────────────────────────

async function orsAutocomplete(text, focusCoords) {
  const focus = focusCoords
    ? `focus.point.lat=${focusCoords[1]}&focus.point.lon=${focusCoords[0]}`
    : 'focus.point.lat=48.8566&focus.point.lon=2.3522';
  const url =
    `https://api.openrouteservice.org/geocode/autocomplete` +
    `?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}` +
    `&${focus}&${ORS_COUNTRY}&size=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map((f) => ({
      label: f.properties.label,
      coords: f.geometry.coordinates,
    }));
  } catch {
    return [];
  }
}

// Retourne { coords: [lon, lat], label: string }
async function orsGeocode(text) {
  const url =
    `https://api.openrouteservice.org/geocode/search` +
    `?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}` +
    `&focus.point.lat=48.8566&focus.point.lon=2.3522&${ORS_COUNTRY}&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Adresse introuvable');
  const json = await res.json();
  if (!json.features?.length) throw new Error(`Adresse introuvable : « ${text} »`);
  const f = json.features[0];
  return { coords: f.geometry.coordinates, label: f.properties.label };
}

async function orsRoute(from, to, profile) {
  const res = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [from, to] }),
    }
  );
  if (!res.ok) {
    try {
      const err = await res.json();
      const msg = err?.error?.message ?? err?.message;
      if (msg) throw new Error(msg);
    } catch (e) {
      if (e.message && e.message !== 'Itinéraire introuvable') throw e;
    }
    throw new Error('Itinéraire introuvable entre ces deux points');
  }
  const json = await res.json();
  const coords = json.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) throw new Error('Itinéraire introuvable');
  return coords;
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
                <Text style={styles.gpsRowText}>Ma position</Text>
              </View>
            </TouchableOpacity>
          )}
          {/* Contenu principal */}
          {searching ? (
            <View style={[styles.suggState, gpsOption && styles.suggBorder]}>
              <ActivityIndicator size="small" color={theme.textSecondary} />
              <Text style={styles.suggStateText}>Recherche…</Text>
            </View>
          ) : showEmpty ? (
            <>
              <View style={[styles.suggState, gpsOption && styles.suggBorder]}>
                <Text style={styles.suggStateText}>Aucun résultat</Text>
              </View>
              <TouchableOpacity style={[styles.suggItem, styles.suggBorder]} onPress={onFallback}>
                <Text style={styles.suggFallbackText} numberOfLines={1}>
                  Utiliser « {value} »
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
  const styles = getStyles(theme);
  return (
    <TouchableOpacity style={styles.routeRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.routeDot, { backgroundColor: statusColors[inv.status] ?? STATUS_COLOR[inv.status] }]} />
      <Text style={styles.routeId}>{inv.id}</Text>
      <Text style={styles.routePts}>{inv.points} pts</Text>
      <View style={[styles.routeBadge, isFlashed && styles.routeBadgeFlashed]}>
        <Text style={[styles.routeBadgeText, isFlashed && styles.routeBadgeTextFlashed]}>
          {isFlashed ? '✓ Flashé' : 'À faire'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Fiche détail d'un Invader du trajet ─────────────────────────────────────

function RouteInvaderDetail({ inv, isFlashed, onToggleFlash, onNavigate, onBack }) {
  const { statusColors } = useAppContext();
  const { theme } = useTheme();
  const styles = getStyles(theme);
  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtn}>‹ Liste</Text>
        </TouchableOpacity>
        <Text style={styles.detailId}>{inv.id}</Text>
        <View style={{ width: 52 }} />
      </View>
      <View style={styles.detailMeta}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[inv.status] ?? STATUS_COLOR[inv.status] }]}>
          <Text style={styles.statusText}>{STATUS_LABEL[inv.status] ?? inv.status}</Text>
        </View>
        <Text style={styles.detailPts}>{inv.points} pts</Text>
      </View>
      {inv.hint ? <Text style={styles.hint}>{inv.hint}</Text> : null}
      <View style={styles.detailActions}>
        <TouchableOpacity
          style={[styles.actionBtn, isFlashed && styles.actionBtnActive]}
          onPress={() => onToggleFlash(inv.id)}
        >
          <Text style={[styles.actionBtnText, isFlashed && styles.actionBtnTextActive]}>
            {isFlashed ? '✓ Flashé' : 'Marquer comme flashé'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onNavigate(inv.lat, inv.lng)}>
          <Text style={styles.actionBtnText}>Y aller</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Panneau résultat : compteur + filtre + liste ─────────────────────────────

function RoutePanel({ allInvaders, displayInvaders, flashed, statusColors, showOnlyUnflashed, onToggleFilter, onSelectInvader }) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const total = allInvaders.length;
  const unflashedCount = allInvaders.filter((inv) => !flashed.has(inv.id)).length;
  return (
    <View style={styles.routePanel}>
      <View style={styles.routePanelHeader}>
        <View style={{ flex: 1, marginRight: 10 }}>
          {total === 0 ? (
            <Text style={styles.routeSummary}>Aucun Invader sur ce trajet</Text>
          ) : (
            <Text style={styles.routeSummary} numberOfLines={2}>
              {`${total} Invader${total > 1 ? 's' : ''} sur ce trajet`}
              {unflashedCount > 0 ? `, dont ${unflashedCount} à flasher` : ''}
            </Text>
          )}
        </View>
        {total > 0 && (
          <View style={styles.toggleWrap}>
            <Text style={styles.toggleLabel}>À faire</Text>
            <Switch
              value={showOnlyUnflashed}
              onValueChange={onToggleFilter}
              trackColor={{ false: theme.border, true: theme.statusOk }}
              thumbColor={theme.bg}
            />
          </View>
        )}
      </View>
      {total === 0 ? null : displayInvaders.length === 0 ? (
        <Text style={styles.listEmpty}>Tous les Invaders de ce trajet sont flashés !</Text>
      ) : (
        <FlatList
          data={displayInvaders}
          keyExtractor={(inv) => inv.id}
          style={styles.routeList}
          renderItem={({ item: inv }) => (
            <RouteInvaderRow
              inv={inv}
              isFlashed={flashed.has(inv.id)}
              statusColors={statusColors}
              onPress={() => onSelectInvader(inv)}
            />
          )}
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
  const depInputRef = useRef(null);
  const arrInputRef = useRef(null);
  const depDebounce = useRef(null);
  const arrDebounce = useRef(null);

  const { flashed, toggleFlash, labels, labelDefs, colorOverrides, statusColors, mapsApp, setMapsAppPref } = useAppContext();
  const { theme } = useTheme();
  const styles = getStyles(theme);

  // ─── Champs d'adresse ────────────────────────────────────────────────────

  const [depText, setDepText] = useState('');
  const [depCoords, setDepCoords] = useState(null);
  const [depSugg, setDepSugg] = useState([]);
  const [depSearching, setDepSearching] = useState(false);
  const [depFocused, setDepFocused] = useState(false);
  const [depResolving, setDepResolving] = useState(false);
  const [gpsAvailable, setGpsAvailable] = useState(false);

  const [arrText, setArrText] = useState('');
  const [arrCoords, setArrCoords] = useState(null);
  const [arrSugg, setArrSugg] = useState([]);
  const [arrSearching, setArrSearching] = useState(false);
  const [arrFocused, setArrFocused] = useState(false);
  const [arrResolving, setArrResolving] = useState(false);

  // 'route' = appel ORS en cours  |  'invaders' = calcul turf en cours  |  null = inactif
  const [loadingPhase, setLoadingPhase] = useState(null);
  const [error, setError] = useState(null);

  // ─── Résultat de l'itinéraire ─────────────────────────────────────────────

  const [routeCoords, setRouteCoords] = useState(null);
  const [routePolyline, setRoutePolyline] = useState(null);
  const [routeInvaders, setRouteInvaders] = useState(null);
  const [bufferKm, setBufferKm] = useState(0.1);
  const [showOnlyUnflashed, setShowOnlyUnflashed] = useState(false);
  const [selectedRouteInv, setSelectedRouteInv] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [following, setFollowing] = useState(false);
  const [drifted, setDrifted] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const locationSub = useRef(null);

  // ─── GPS au montage ───────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = [loc.coords.longitude, loc.coords.latitude];
      gpsRef.current = coords;
      setGpsAvailable(true);
      setDepCoords(coords);
      setDepText(GPS_TOKEN);
    })();
  }, []);

  // ─── Recalcul du couloir quand routeCoords ou bufferKm changent ──────────

  useEffect(() => {
    if (!routeCoords) { setRouteInvaders(null); setSelectedRouteInv(null); return; }
    try {
      const line = turf.lineString(routeCoords);
      const nearby = INVADERS.filter((inv) => {
        const nearest = turf.nearestPointOnLine(line, turf.point([inv.lng, inv.lat]), { units: 'kilometers' });
        return nearest.properties.dist <= bufferKm;
      });
      console.log('[Trajet] Invaders dans le couloir (source liste) :', nearby.length);
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
  }, [routeCoords, bufferKm]);

  // ─── Cadrage carte — déclenché après que routeInvaders est commité ────────
  // À ce stade le panneau résultat (260 px) est déjà rendu, donc la MapView a
  // sa hauteur définitive et fitToCoordinates utilise les bonnes dimensions.

  useEffect(() => {
    if (!routeInvaders || !routeCoords) return;
    console.log('[Trajet] Markers rendus sur la carte :', routeInvaders.length);
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
      (loc) => setUserPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, heading: loc.coords.heading })
    ).then(sub => {
      if (cancelled) sub.remove();
      else locationSub.current = sub;
    }).catch(() => {});
    return () => {
      cancelled = true;
      locationSub.current?.remove();
      locationSub.current = null;
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

  const displayInvaders = useMemo(() => {
    if (!routeInvaders) return null;
    return showOnlyUnflashed ? routeInvaders.filter((inv) => !flashed.has(inv.id)) : routeInvaders;
  }, [routeInvaders, showOnlyUnflashed, flashed]);

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
        const sugg = await orsAutocomplete(text, gpsRef.current);
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
    setDepText(GPS_TOKEN);
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
      const result = await orsGeocode(depText);
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
        const sugg = await orsAutocomplete(text, gpsRef.current);
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
      const result = await orsGeocode(arrText);
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
    if (!arrText.trim()) { setError("Saisissez une adresse d'arrivée"); return; }
    if (!ORS_API_KEY || ORS_API_KEY === 'VOTRE_CLE_API_ORS_ICI') { setError('Clé API ORS manquante'); return; }

    setLoadingPhase('route');
    setFollowing(false);
    setError(null);
    setRouteCoords(null);
    setRoutePolyline(null);
    setSelectedRouteInv(null);

    try {
      // ─ Départ ─
      let fromCoords = depCoords;
      if (!fromCoords) {
        if (!depText.trim() || depText === GPS_TOKEN) {
          if (!gpsRef.current) throw new Error('Position GPS indisponible. Activez la localisation et réessayez.');
          fromCoords = gpsRef.current;
        } else {
          const result = await orsGeocode(depText);
          fromCoords = result.coords;
          setDepText(result.label);
          setDepCoords(result.coords);
        }
      }

      // ─ Arrivée ─
      let toCoords = arrCoords;
      if (!toCoords) {
        const result = await orsGeocode(arrText);
        toCoords = result.coords;
        setArrText(result.label);
        setArrCoords(result.coords);
      }

      const coords = await orsRoute(fromCoords, toCoords, 'foot-walking');
      const latlngs = coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
      setRoutePolyline(latlngs);
      // Phase 2 : le useEffect([routeCoords]) calcule les Invaders ;
      // le useEffect([routeInvaders]) cadrera la carte une fois le panneau affiché
      setLoadingPhase('invaders');
      setRouteCoords(coords);
    } catch (e) {
      setLoadingPhase(null);
      setError(e.message ?? "Erreur lors du calcul de l'itinéraire");
    }
  }

  // ─── Sélection / navigation ───────────────────────────────────────────────

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
    if (following) {
      setDrifted(false);
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      }, 400);
    } catch {}
  }

  function selectRouteInvader(inv) {
    setSelectedRouteInv(inv);
    mapRef.current?.animateToRegion(
      { latitude: inv.lat, longitude: inv.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      400
    );
  }

  function handleNavigate(lat, lng) {
    if (mapsApp) { openInApp(mapsApp, lat, lng); return; }
    Alert.alert(
      'App de cartes par défaut',
      'Choisissez votre application. Ce choix sera mémorisé et modifiable dans Réglages.',
      [
        { text: 'Plans',       onPress: () => { setMapsAppPref('apple');  openInApp('apple',  lat, lng); } },
        { text: 'Google Maps', onPress: () => { setMapsAppPref('google'); openInApp('google', lat, lng); } },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  }

  // ─── Rendu ───────────────────────────────────────────────────────────────

  // depShowEmpty / arrShowEmpty conditionnés à *Focused : ferme le dropdown après blur
  const depShowEmpty = depText.length >= MIN_CHARS && !depSearching && depSugg.length === 0 && !depCoords && depFocused;
  const arrShowEmpty = arrText.length >= MIN_CHARS && !arrSearching && arrSugg.length === 0 && !arrCoords && arrFocused;
  const showDepGpsOption = gpsAvailable && depFocused && depText !== GPS_TOKEN;

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
          mapType="mutedStandard"
          showsCompass={false}
          showsUserLocation={!!routePolyline}
          initialRegion={PARIS}
          onPress={() => Keyboard.dismiss()}
          onPanDrag={() => { if (following) setDrifted(true); }}
        >
          {routePolyline && (
            <>
              <Polyline coordinates={remainingPolyline ?? routePolyline} strokeColor={theme.accent} strokeWidth={4} lineCap="round" />
              {walkedPolyline && (
                <Polyline coordinates={walkedPolyline} strokeColor={theme.textSecondary} strokeWidth={4} lineCap="round" />
              )}
              {/* Repère départ — masqué en suivi et quand le départ est la position GPS */}
              {!following && depText !== GPS_TOKEN && (
              <Marker
                key="route-dep"
                coordinate={routePolyline[0]}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.pinDep}>
                  <Ionicons name="navigate" size={16} color="#fff" />
                </View>
              </Marker>
              )}
              {/* Repère arrivée */}
              <Marker
                key="route-arr"
                coordinate={routePolyline[routePolyline.length - 1]}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.pinArr}>
                  <Ionicons name="flag" size={16} color="#fff" />
                </View>
              </Marker>
            </>
          )}
          {displayInvaders?.map((inv) => (
            <Marker
              key={inv.id}
              coordinate={{ latitude: inv.lat, longitude: inv.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => selectRouteInvader(inv)}
            >
              <View style={[
                styles.dot,
                { backgroundColor: getMarkerColor(inv, labels, labelDefs, colorOverrides, statusColors, flashed) },
              ]} />
            </Marker>
          ))}
        </MapView>

        {/* ── Carte flottante d'itinéraire (au-dessus de la carte) ── */}
        {!following && (
          <View style={[styles.inputCard, { top: insets.top + 8 }]}>
            {!inputCollapsed && (
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
                  placeholder="Départ : ma position actuelle"
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
                  placeholder="Arrivée : adresse ou lieu"
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
                  <Text style={styles.goBtnText}>Calculer l'itinéraire</Text>
                </TouchableOpacity>
                <View style={styles.bufferSection}>
                  <View style={styles.bufferHeader}>
                    <Text style={styles.bufferLabel}>
                      Couloir : {BUFFER_OPTIONS.find(o => o.value === bufferKm)?.label}
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
                      <Text style={styles.infoText}>
                        Le couloir est la distance maximale autour de ton itinéraire dans laquelle l'app cherche des Invaders. Plus il est large, plus tu en vois — mais certains seront un peu plus loin de ton chemin.
                      </Text>
                    </View>
                  )}
                </View>
                {loadingPhase === 'route' && (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <Text style={styles.loadingText}>Recherche de l'itinéraire…</Text>
                  </View>
                )}
                {loadingPhase === 'invaders' && (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <Text style={styles.loadingText}>Recherche des Invaders sur le trajet…</Text>
                  </View>
                )}
                {!loadingPhase && error ? <Text style={styles.errorText}>{error}</Text> : null}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.collapseBtn} onPress={() => setInputCollapsed(v => !v)}>
              <Ionicons name={inputCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Boutons flottants sur la carte */}
        {routePolyline && (
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
                <Ionicons name="locate-outline" size={22} color={theme.accent} />
              </TouchableOpacity>
            )}
          </View>
        )}
        </View>

        {/* ── Panneau de résultat (masqué en navigation) ── */}
        {!following && routeInvaders !== null && displayInvaders !== null && (
          selectedRouteInv ? (
            <RouteInvaderDetail
              inv={selectedRouteInv}
              isFlashed={flashed.has(selectedRouteInv.id)}
              onToggleFlash={toggleFlash}
              onNavigate={handleNavigate}
              onBack={() => setSelectedRouteInv(null)}
            />
          ) : (
            <RoutePanel
              allInvaders={routeInvaders}
              displayInvaders={displayInvaders}
              flashed={flashed}
              statusColors={statusColors}
              showOnlyUnflashed={showOnlyUnflashed}
              onToggleFilter={setShowOnlyUnflashed}
              onSelectInvader={selectRouteInvader}
            />
          )
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

    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    loadingText: { fontSize: 13, color: t.textSecondary },
    errorText: { fontSize: 13, color: t.destructive, marginTop: 10 },

    // ── Carte ───────────────────────────────────────────────────────────────
    mapContainer: { flex: 1 },
    map: { flex: 1 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
    pinDep: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
    },
    pinArr: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: t.textPrimary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
    },

    mapOverlay: {
      position: 'absolute', bottom: 12, left: 12, right: 12,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
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
    toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    toggleLabel: { fontSize: 13, color: t.textSecondary },
    routeList: { flex: 1 },
    listEmpty: { fontSize: 14, color: t.textSecondary, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },

    routeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, gap: 10 },
    routeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    routeId: { fontWeight: '600', fontSize: 14, color: t.textPrimary, width: 84 },
    routePts: { fontSize: 13, color: t.textSecondary, flex: 1 },
    routeBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: t.surfaceHigh },
    routeBadgeFlashed: { backgroundColor: t.accentDim },
    routeBadgeText: { fontSize: 12, fontWeight: '500', color: t.textSecondary },
    routeBadgeTextFlashed: { color: t.statusOk },

    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 16 },

    // ── Fiche détail ─────────────────────────────────────────────────────────
    detailPanel: {
      backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32,
    },
    detailHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
    },
    backBtn: { fontSize: 16, color: t.link, fontWeight: '500' },
    detailId: { ...typography.arcadeTitle, color: t.textPrimary },
    detailMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    detailPts: { fontSize: 15, color: t.textSecondary },
    hint: { fontSize: 14, color: t.textSecondary, fontStyle: 'italic', marginBottom: 4 },
    detailActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    actionBtn: {
      flex: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: t.surfaceHigh, alignItems: 'center',
    },
    actionBtnActive: { backgroundColor: t.accent },
    actionBtnText: { fontSize: 14, fontWeight: '500', color: t.textPrimary },
    actionBtnTextActive: { color: t.bg },
  });
}
