import { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { INVADERS } from './data/invaders';

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

function InvaderPanel({ invader, onClose }) {
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

      {/* Zone d'actions futures : "déjà flashé", étiquettes, signaler… */}
    </View>
  );
}

export default function App() {
  const [selected, setSelected] = useState(null);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        mapType="mutedStandard"
        initialRegion={{
          latitude: 48.8566,
          longitude: 2.3522,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        }}
        onPress={() => setSelected(null)}
      >
        {INVADERS.map((invader) => (
          <Marker
            key={invader.id}
            coordinate={{ latitude: invader.lat, longitude: invader.lng }}
            pinColor={STATUS_COLOR[invader.status] ?? '#8E8E93'}
            stopPropagation
            onPress={() => setSelected(invader)}
          />
        ))}
      </MapView>

      {selected && <InvaderPanel invader={selected} onClose={() => setSelected(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

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
    marginBottom: 14,
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
});
