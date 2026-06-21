import { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  FlatList, Switch, Alert, Linking, Keyboard, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as turf from '@turf/turf';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INVADERS } from '../data/invaders';
import { STATUS_COLOR, STATUS_LABEL } from '../constants';
import { ORS_API_KEY } from '../config/ors';
import { useAppContext } from '../context/AppContext';
import { getMarkerColor } from '../utils/markerColor';

const PARIS = { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

// Limite les résultats ORS à la France ; focus.point suffit pour prioriser Paris
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

async function orsGeocode(text) {
  const url =
    `https://api.openrouteservice.org/geocode/search` +
    `?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}` +
    `&focus.point.lat=48.8566&focus.point.lon=2.3522&${ORS_COUNTRY}&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Adresse introuvable');
  const json = await res.json();
  if (!json.features?.length) throw new Error(`Adresse introuvable : « ${text} »`);
  return json.features[0].geometry.coordinates;
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
    // ORS renvoie parfois un JSON d'erreur exploitable
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

// ─── Champ d'adresse avec autocomplétion ─────────────────────────────────────
// searching : requête ORS en cours
// showEmpty : texte suffisant, requête terminée, 0 résultat

function AddressInput({ inputRef, value, onChange, onSelect, onBlur, onSubmitEditing, onFallback, searching, showEmpty, suggestions, placeholder }) {
  const showDropdown = searching || showEmpty || suggestions.length > 0;
  return (
    <View>
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#C7C7CC"
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        onSubmitEditing={onSubmitEditing}
        keyboardType="default"
        returnKeyType="done"
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="sentences"
      />
      {showDropdown && (
        <View style={styles.suggestions}>
          {searching ? (
            // ─ Recherche en cours ─
            <View style={styles.suggState}>
              <ActivityIndicator size="small" color="#8E8E93" />
              <Text style={styles.suggStateText}>Recherche…</Text>
            </View>
          ) : showEmpty ? (
            // ─ Aucun résultat + filet de sécurité ─
            <>
              <View style={styles.suggState}>
                <Text style={styles.suggStateText}>Aucun résultat</Text>
              </View>
              <TouchableOpacity style={[styles.suggItem, styles.suggBorder]} onPress={onFallback}>
                <Text style={styles.suggFallbackText} numberOfLines={1}>
                  Utiliser « {value} »
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            // ─ Suggestions ─
            suggestions.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.suggItem, i > 0 && styles.suggBorder]}
                onPress={() => onSelect(s)}
              >
                <Text style={styles.suggText} numberOfLines={1}>{s.label}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── Ligne d'un Invader dans la liste ────────────────────────────────────────

function RouteInvaderRow({ inv, isFlashed, statusColors, onPress }) {
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
              trackColor={{ false: '#E5E5EA', true: '#34C759' }}
              thumbColor="#fff"
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

  // ─── Champs d'adresse ────────────────────────────────────────────────────

  const [depText, setDepText] = useState('');
  const [depCoords, setDepCoords] = useState(null);
  const [depSugg, setDepSugg] = useState([]);
  const [depSearching, setDepSearching] = useState(false);

  const [arrText, setArrText] = useState('');
  const [arrCoords, setArrCoords] = useState(null);
  const [arrSugg, setArrSugg] = useState([]);
  const [arrSearching, setArrSearching] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ─── Résultat de l'itinéraire ─────────────────────────────────────────────

  const [routeCoords, setRouteCoords] = useState(null);
  const [routePolyline, setRoutePolyline] = useState(null);
  const [routeInvaders, setRouteInvaders] = useState(null);
  const [bufferKm, setBufferKm] = useState(0.1);
  const [showOnlyUnflashed, setShowOnlyUnflashed] = useState(false);
  const [selectedRouteInv, setSelectedRouteInv] = useState(null);

  // ─── GPS au montage ───────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = [loc.coords.longitude, loc.coords.latitude];
      gpsRef.current = coords;
      setDepCoords(coords);
      setDepText('Ma Position');
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
      setRouteInvaders(nearby);
      setSelectedRouteInv(null);
    } catch {
      setRouteInvaders([]);
    }
  }, [routeCoords, bufferKm]);

  // ─── Invaders affichés selon le filtre ───────────────────────────────────

  const displayInvaders = useMemo(() => {
    if (!routeInvaders) return null;
    return showOnlyUnflashed ? routeInvaders.filter((inv) => !flashed.has(inv.id)) : routeInvaders;
  }, [routeInvaders, showOnlyUnflashed, flashed]);

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

  function onDepBlur() {
    setTimeout(() => { setDepSugg([]); setDepSearching(false); }, 150);
  }

  function selectDep(s) {
    setDepText(s.label);
    setDepCoords(s.coords);
    setDepSugg([]);
    setDepSearching(false);
    Keyboard.dismiss();
  }

  function onDepFallback() {
    // Accepte le texte tel quel ; orsGeocode le résoudra au moment du calcul
    setDepSugg([]);
    setDepSearching(false);
    Keyboard.dismiss();
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

  function onArrBlur() {
    setTimeout(() => { setArrSugg([]); setArrSearching(false); }, 150);
  }

  function selectArr(s) {
    setArrText(s.label);
    setArrCoords(s.coords);
    setArrSugg([]);
    setArrSearching(false);
    Keyboard.dismiss();
  }

  function onArrFallback() {
    setArrSugg([]);
    setArrSearching(false);
    Keyboard.dismiss();
  }

  // ─── Calcul de l'itinéraire ───────────────────────────────────────────────

  async function calculate() {
    Keyboard.dismiss();
    if (!arrText.trim()) { setError("Saisissez une adresse d'arrivée"); return; }
    if (!ORS_API_KEY || ORS_API_KEY === 'VOTRE_CLE_API_ORS_ICI') { setError('Clé API ORS manquante'); return; }

    setLoading(true);
    setError(null);
    setRouteCoords(null);
    setRoutePolyline(null);
    setSelectedRouteInv(null);

    try {
      let fromCoords = depCoords;
      if (!fromCoords) {
        if (!depText.trim()) {
          if (!gpsRef.current) throw new Error('Position GPS indisponible');
          fromCoords = gpsRef.current;
        } else {
          fromCoords = await orsGeocode(depText);
        }
      }
      const toCoords = arrCoords ?? await orsGeocode(arrText);
      const coords = await orsRoute(fromCoords, toCoords, 'foot-walking');
      const latlngs = coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
      setRoutePolyline(latlngs);
      setRouteCoords(coords);
      mapRef.current?.fitToCoordinates(latlngs, {
        edgePadding: { top: 40, right: 40, bottom: 20, left: 40 },
        animated: true,
      });
    } catch (e) {
      setError(e.message ?? 'Erreur lors du calcul de l\'itinéraire');
    } finally {
      setLoading(false);
    }
  }

  // ─── Sélection / navigation ───────────────────────────────────────────────

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

  // showEmpty : assez de texte + pas en train de chercher + 0 résultat
  const depShowEmpty = depText.length >= MIN_CHARS && !depSearching && depSugg.length === 0 && !depCoords;
  const arrShowEmpty = arrText.length >= MIN_CHARS && !arrSearching && arrSugg.length === 0 && !arrCoords;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* ── Zone de saisie (scrollable pour que le bouton reste accessible clavier ouvert) ── */}
        <ScrollView
          style={styles.inputArea}
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
            onBlur={onDepBlur}
            onSubmitEditing={() => arrInputRef.current?.focus()}
            onFallback={onDepFallback}
            searching={depSearching}
            showEmpty={depShowEmpty}
            suggestions={depSugg}
            placeholder="Départ : ma position actuelle"
          />
          <View style={styles.inputDivider} />
          <AddressInput
            inputRef={arrInputRef}
            value={arrText}
            onChange={onArrChange}
            onSelect={selectArr}
            onBlur={onArrBlur}
            onSubmitEditing={calculate}
            onFallback={onArrFallback}
            searching={arrSearching}
            showEmpty={arrShowEmpty}
            suggestions={arrSugg}
            placeholder="Arrivée : adresse ou lieu"
          />

          {/* Calculer */}
          <TouchableOpacity
            style={[styles.goBtn, styles.goBtnFull, loading && styles.goBtnDisabled]}
            onPress={calculate}
            disabled={loading}
          >
            <Text style={styles.goBtnText}>Calculer l'itinéraire</Text>
          </TouchableOpacity>

          {/* Largeur du couloir */}
          <View style={styles.controlRow}>
            <Text style={styles.bufferLabel}>Couloir :</Text>
            {BUFFER_OPTIONS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[styles.bufferBtn, bufferKm === value && styles.bufferBtnActive]}
                onPress={() => setBufferKm(value)}
              >
                <Text style={[styles.bufferBtnText, bufferKm === value && styles.bufferBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* État du calcul */}
          {loading && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Recherche de l'itinéraire…</Text>
            </View>
          )}
          {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        {/* ── Carte ── */}
        <MapView
          ref={mapRef}
          style={styles.map}
          mapType="mutedStandard"
          showsCompass={false}
          initialRegion={PARIS}
          onPress={() => Keyboard.dismiss()}
        >
          {routePolyline && (
            <Polyline coordinates={routePolyline} strokeColor="#007AFF" strokeWidth={4} lineCap="round" />
          )}
          {displayInvaders?.map((inv) => (
            <Marker
              key={inv.id}
              coordinate={{ latitude: inv.lat, longitude: inv.lng }}
              pinColor={getMarkerColor(inv, labels, labelDefs, colorOverrides, statusColors, flashed)}
              tracksViewChanges={false}
              onPress={() => selectRouteInvader(inv)}
            />
          ))}
        </MapView>

        {/* ── Panneau de résultat ── */}
        {routeInvaders !== null && displayInvaders !== null && (
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // ── Zone de saisie ────────────────────────────────────────────────────────
  inputArea: {
    flexGrow: 0,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  inputContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },

  input: { fontSize: 15, color: '#1C1C1E', paddingVertical: 10 },
  inputDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA' },

  // Dropdown de suggestions (en flux — apparaît sous le champ)
  suggestions: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
    overflow: 'hidden',
  },
  suggItem: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#fff' },
  suggBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E5EA' },
  suggText: { fontSize: 14, color: '#1C1C1E' },
  // États : recherche / aucun résultat
  suggState: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  suggStateText: { fontSize: 14, color: '#8E8E93' },
  suggFallbackText: { fontSize: 14, color: '#007AFF', fontStyle: 'italic' },

  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  goBtn: {
    backgroundColor: '#007AFF', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 8, alignItems: 'center',
  },
  goBtnFull: { marginTop: 10, paddingVertical: 12 },
  goBtnDisabled: { opacity: 0.55 },
  goBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  bufferLabel: { fontSize: 13, color: '#8E8E93', marginRight: 2 },
  bufferBtn: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#F2F2F7' },
  bufferBtnActive: { backgroundColor: '#1C1C1E' },
  bufferBtnText: { fontSize: 13, fontWeight: '500', color: '#636366' },
  bufferBtnTextActive: { color: '#fff' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  loadingText: { fontSize: 13, color: '#636366' },
  errorText: { fontSize: 13, color: '#FF3B30', marginTop: 10 },

  // ── Carte ─────────────────────────────────────────────────────────────────
  map: { flex: 1 },

  // ── Panneau résultat ──────────────────────────────────────────────────────
  routePanel: {
    height: 260,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  routePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  routeSummary: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', lineHeight: 20 },
  toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 13, color: '#636366' },
  routeList: { flex: 1 },
  listEmpty: { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },

  routeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeId: { fontWeight: '600', fontSize: 14, color: '#1C1C1E', width: 84 },
  routePts: { fontSize: 13, color: '#636366', flex: 1 },
  routeBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#F2F2F7' },
  routeBadgeFlashed: { backgroundColor: '#E8F9EE' },
  routeBadgeText: { fontSize: 12, fontWeight: '500', color: '#636366' },
  routeBadgeTextFlashed: { color: '#34C759' },

  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginLeft: 16 },

  // ── Fiche détail ──────────────────────────────────────────────────────────
  detailPanel: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  backBtn: { fontSize: 16, color: '#007AFF', fontWeight: '500' },
  detailId: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  detailMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  detailPts: { fontSize: 15, color: '#3C3C43' },
  hint: { fontSize: 14, color: '#636366', fontStyle: 'italic', marginBottom: 4 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#F2F2F7', alignItems: 'center',
  },
  actionBtnActive: { backgroundColor: '#34C759' },
  actionBtnText: { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  actionBtnTextActive: { color: '#fff' },
});
