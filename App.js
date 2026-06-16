import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import Svg, { Path } from 'react-native-svg';
import { INVADERS } from './data/invaders';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  ok: '#34C759',
  damaged: '#FF9500',
  destroyed: '#FF3B30',
  unknown: '#8E8E93',
};

const STATUS_LABEL = {
  ok: 'OK',
  damaged: 'Endommagé',
  destroyed: 'Détruit',
  unknown: 'Inconnu',
};

const ALL_STATUSES = ['ok', 'damaged', 'destroyed', 'unknown'];

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

// ─── Marqueur utilisateur (point bleu + cône de direction) ───────────────────

const UserMarker = memo(function UserMarker({ coordinate }) {
  const [heading, setHeading] = useState(0);
  const lastHeading = useRef(0);

  // Heading géré ici pour ne pas re-rendre App + les 1528 marqueurs
  useEffect(() => {
    let sub = null;
    (async () => {
      sub = await Location.watchHeadingAsync((h) => {
        const raw = h.trueHeading >= 0 ? h.trueHeading : (h.magHeading ?? 0);
        // Ignore les micro-variations < 3° pour stopper le tremblement
        const diff = Math.abs(raw - lastHeading.current);
        const delta = diff > 180 ? 360 - diff : diff;
        if (delta >= 3) {
          lastHeading.current = raw;
          setHeading(raw);
        }
      });
    })();
    return () => { sub?.remove(); };
  }, []);

  if (!coordinate) return null;

  return (
    <Marker coordinate={coordinate} flat anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
      <View style={styles.userMarker}>
        {/* Cône — pivote selon le heading */}
        <View style={[styles.coneWrapper, { transform: [{ rotate: `${heading}deg` }] }]}>
          <Svg width={80} height={80}>
            <Path
              d="M40,40 L17,0 L63,0 Z"
              fill="rgba(0,122,255,0.18)"
              stroke="rgba(0,122,255,0.45)"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          </Svg>
        </View>
        {/* Point bleu — ne pivote pas */}
        <View style={styles.userDot} />
      </View>
    </Marker>
  );
},
// Ne re-rend que si les coordonnées changent réellement
(prev, next) =>
  prev.coordinate?.latitude === next.coordinate?.latitude &&
  prev.coordinate?.longitude === next.coordinate?.longitude
);

// ─── Panneau de filtres ───────────────────────────────────────────────────────

function FilterPanel({ filters, onFiltersChange, flashed, labels, onClose }) {
  const allLabels = [...new Set(Object.values(labels).flat())];

  function toggleStatus(status) {
    const next = new Set(filters.statuses);
    next.has(status) ? next.delete(status) : next.add(status);
    onFiltersChange({ ...filters, statuses: next });
  }

  function setFlashedState(val) {
    onFiltersChange({ ...filters, flashedState: val });
  }

  function toggleLabel(label) {
    const next = new Set(filters.activeLabels);
    next.has(label) ? next.delete(label) : next.add(label);
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
          return (
            <TouchableOpacity
              key={status}
              onPress={() => toggleStatus(status)}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: STATUS_COLOR[status] }
                  : { backgroundColor: '#F2F2F7', borderColor: STATUS_COLOR[status], borderWidth: 1.5 },
              ]}
            >
              <Text style={[styles.chipText, !active && { color: STATUS_COLOR[status] }]}>
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
      {allLabels.length === 0 ? (
        <Text style={styles.emptyNote}>Aucune étiquette créée</Text>
      ) : (
        <View style={styles.chipRow}>
          {allLabels.map((label) => {
            const active = filters.activeLabels.has(label);
            return (
              <TouchableOpacity
                key={label}
                onPress={() => toggleLabel(label)}
                style={[styles.chip, active && styles.chipActiveNeutral]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Fiche Invader ────────────────────────────────────────────────────────────

function InvaderPanel({ invader, flashed, onToggleFlash, onClose }) {
  const isFlashed = flashed.has(invader.id);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelId}>{invader.id}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panelRow}>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[invader.status] }]}>
          <Text style={styles.statusText}>{STATUS_LABEL[invader.status] ?? invader.status}</Text>
        </View>
        <Text style={styles.points}>{invader.points} pts</Text>
      </View>

      {invader.hint ? <Text style={styles.hint}>{invader.hint}</Text> : null}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onToggleFlash(invader.id)}
          style={[styles.actionBtn, isFlashed && styles.actionBtnActive]}
        >
          <Text style={[styles.actionBtnText, isFlashed && styles.actionBtnTextActive]}>
            {isFlashed ? '✓ Flashé' : 'Marquer comme flashé'}
          </Text>
        </TouchableOpacity>
        {/* Futures actions : étiquettes, signaler… */}
      </View>
    </View>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const mapRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [flashed, setFlashed] = useState(new Set());
  const [labels, setLabels] = useState({});
  const [filters, setFilters] = useState({
    statuses: new Set(ALL_STATUSES),
    flashedState: 'all',
    activeLabels: new Set(),
  });
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    let positionSub = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      positionSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 8 },
        (loc) => {
          // Ignore les fixes GPS imprécis (rayon > 40 m)
          if (loc.coords.accuracy > 40) return;
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    })();

    return () => { positionSub?.remove(); };
  }, []);

  function goToUserLocation() {
    if (!userLocation) return;
    mapRef.current?.animateToRegion({
      ...userLocation,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 600);
  }

  function toggleFlash(id) {
    setFlashed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function closeAll() {
    setSelected(null);
    setShowFilters(false);
  }

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
        showsUserLocation={false}
        initialRegion={{
          latitude: 48.8566,
          longitude: 2.3522,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        }}
        onPress={closeAll}
      >
        {visibleInvaders.map((invader) => (
          <Marker
            key={invader.id}
            coordinate={{ latitude: invader.lat, longitude: invader.lng }}
            pinColor={STATUS_COLOR[invader.status] ?? '#8E8E93'}
            stopPropagation
            onPress={() => { setSelected(invader); setShowFilters(false); }}
          />
        ))}
        <UserMarker coordinate={userLocation} />
      </MapView>

      {/* Boutons flottants — empilés verticalement en haut à droite */}
      <View style={styles.floatingButtons}>
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
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          flashed={flashed}
          labels={labels}
          onClose={() => setShowFilters(false)}
        />
      )}

      {selected && !showFilters && (
        <InvaderPanel
          invader={selected}
          flashed={flashed}
          onToggleFlash={toggleFlash}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  // Boutons flottants
  floatingButtons: {
    position: 'absolute',
    top: 60,
    right: 16,
    alignItems: 'flex-end',
    gap: 10,
  },
  filtersBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  filtersBtnActive: {
    backgroundColor: '#1C1C1E',
  },
  filtersBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  filtersBtnTextActive: {
    color: '#fff',
  },
  locateBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  locateBtnDisabled: {
    opacity: 0.4,
  },
  locateBtnText: {
    fontSize: 20,
    color: '#1C1C1E',
  },

  // Marqueur utilisateur
  userMarker: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coneWrapper: {
    position: 'absolute',
    width: 80,
    height: 80,
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },

  // Panneau générique (partagé entre FilterPanel et InvaderPanel)
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  panelId: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  closeButton: {
    fontSize: 18,
    color: '#8E8E93',
  },

  // Fiche invader
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  points: {
    fontSize: 15,
    color: '#3C3C43',
  },
  hint: {
    marginTop: 12,
    fontSize: 14,
    color: '#636366',
    fontStyle: 'italic',
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F2F2F7',
  },
  actionBtnActive: {
    backgroundColor: '#34C759',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  actionBtnTextActive: {
    color: '#fff',
  },

  // Filtres
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
  },
  chipActiveNeutral: {
    backgroundColor: '#1C1C1E',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#636366',
  },
  chipTextActive: {
    color: '#fff',
  },
  emptyNote: {
    fontSize: 13,
    color: '#C7C7CC',
    fontStyle: 'italic',
  },
});
