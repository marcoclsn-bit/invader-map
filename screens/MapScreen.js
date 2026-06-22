import { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Linking, Alert } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { INVADERS } from '../data/invaders';
import { useAppContext } from '../context/AppContext';
import { STATUS_LABEL, ALL_STATUSES } from '../constants';
import InvaderMarker from '../components/InvaderMarker';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

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

// ─── Panneau de filtres ───────────────────────────────────────────────────────

function FilterPanel({ filters, onFiltersChange, onClose }) {
  const { labelDefs, statusColors } = useAppContext();
  const { theme } = useTheme();
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
        <Text style={styles.panelId}>Filtres</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Statut</Text>
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
                {STATUS_LABEL[status]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>État</Text>
      <View style={styles.chipRow}>
        {[
          { val: 'all', label: 'Tous' },
          { val: 'flashed', label: '✓ Flashés' },
          { val: 'unflashed', label: 'Reste à faire' },
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

      <Text style={styles.sectionTitle}>Étiquettes</Text>
      {labelDefs.filter((d) => !d.system).length === 0 ? (
        <Text style={styles.emptyNote}>Aucune étiquette définie</Text>
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

function InvaderPanel({ invader, flashed, onToggleFlash, onNavigate, onClose }) {
  const { labelDefs, statusColors, labels, toggleLabel } = useAppContext();
  const { theme } = useTheme();
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
          <Text style={styles.statusText}>{STATUS_LABEL[invader.status] ?? invader.status}</Text>
        </View>
        <Text style={styles.points}>{invader.points} pts</Text>
      </View>

      {invader.hint ? <Text style={styles.hint}>{invader.hint}</Text> : null}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onToggleFlash(invader.id)}
          style={[styles.actionBtn, isFlashed && styles.actionBtnActive]}
        >
          <Text style={[styles.actionBtnText, isFlashed && styles.actionBtnTextActive]}>
            {isFlashed ? '✓ Flashé' : 'Marquer comme flashé'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onNavigate(invader.lat, invader.lng)} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>Y aller</Text>
        </TouchableOpacity>
      </View>

      {labelDefs.filter((d) => !d.system).length > 0 && (
        <View style={styles.labelSection}>
          <Text style={styles.labelSectionTitle}>ÉTIQUETTES</Text>
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
  const { flashed, labels, labelDefs, statusColors, colorOverrides, filters, setFilters, toggleFlash, mapsApp, setMapsAppPref } = useAppContext();
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();

  const mapRef = useRef(null);
  const centeredRef = useRef(false);
  const [selected, setSelected] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

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

  useEffect(() => {
    let positionSub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setLocationGranted(true);
      positionSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 8 },
        (loc) => {
          if (loc.coords.accuracy > 40) return;
          const { latitude, longitude } = loc.coords;
          setUserLocation({ latitude, longitude });
          if (!centeredRef.current) {
            centeredRef.current = true;
            const nearParis = Math.abs(latitude - 48.8566) < 0.45 && Math.abs(longitude - 2.3522) < 0.65;
            if (nearParis) {
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

  const visibleInvaders = useMemo(
    () => applyFilters(INVADERS, filters, flashed, labels),
    [filters, flashed, labels]
  );

  const hasActiveFilters =
    filters.statuses.size < ALL_STATUSES.length ||
    filters.flashedState !== 'all' ||
    filters.activeLabels.size > 0;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="mutedStandard"
        showsCompass={false}
        showsUserLocation={locationGranted}
        initialRegion={{ latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
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
            {hasActiveFilters ? 'Filtres •' : 'Filtres'}
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

      {selected && !showFilters && (
        <InvaderPanel
          invader={selected}
          flashed={flashed}
          onToggleFlash={toggleFlash}
          onNavigate={handleNavigate}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

// ─── Styles thémés ────────────────────────────────────────────────────────────

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },

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
