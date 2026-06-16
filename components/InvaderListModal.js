import { useState, useMemo, useCallback, memo } from 'react';
import {
  Modal, View, Text, FlatList, TextInput,
  TouchableOpacity, Switch, Alert, StyleSheet,
} from 'react-native';
import { INVADERS } from '../data/invaders';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  ok: '#34C759', damaged: '#FF9500', destroyed: '#FF3B30', unknown: '#8E8E93',
};
const STATUS_LABEL = {
  ok: 'OK', damaged: 'Endommagé', destroyed: 'Détruit', unknown: 'Inconnu',
};

const TOTAL = INVADERS.length;
const ROW_HEIGHT = 56;

// ─── Ligne d'un Invader ───────────────────────────────────────────────────────

const InvaderRow = memo(function InvaderRow({ item, isFlashed, onToggle }) {
  return (
    <View style={styles.row}>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowId}>{item.id}</Text>
        <Text style={styles.rowMeta}>{STATUS_LABEL[item.status]} · {item.points} pts</Text>
      </View>
      <Switch
        value={isFlashed}
        onValueChange={onToggle}
        trackColor={{ false: '#E5E5EA', true: '#34C759' }}
      />
    </View>
  );
});

// ─── Modal liste ──────────────────────────────────────────────────────────────

export function InvaderListModal({ visible, flashed, onToggleFlash, onBulkFlash, onBulkUnflash, onClose }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'flashed' | 'unflashed'

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return INVADERS.filter((inv) => {
      if (q && !inv.id.includes(q)) return false;
      if (filter === 'flashed' && !flashed.has(inv.id)) return false;
      if (filter === 'unflashed' && flashed.has(inv.id)) return false;
      return true;
    });
  }, [search, filter, flashed]);

  // Hauteur fixe → getItemLayout évite de mesurer chaque ligne
  const getItemLayout = useCallback((_, index) => ({
    length: ROW_HEIGHT,
    offset: ROW_HEIGHT * index,
    index,
  }), []);

  const renderItem = useCallback(({ item }) => (
    <InvaderRow
      item={item}
      isFlashed={flashed.has(item.id)}
      onToggle={() => onToggleFlash(item.id)}
    />
  ), [flashed, onToggleFlash]);

  function confirmBulkFlash() {
    Alert.alert(
      'Tout marquer comme flashé',
      `Marquer les ${TOTAL} Invaders comme flashés ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: onBulkFlash },
      ]
    );
  }

  function confirmBulkUnflash() {
    Alert.alert(
      'Tout démarquer',
      'Retirer le marquage de tous les Invaders ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', style: 'destructive', onPress: onBulkUnflash },
      ]
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>

        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.title}>Invaders Paris</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.closeBtn}>Fermer</Text>
          </TouchableOpacity>
        </View>

        {/* Compteur */}
        <Text style={styles.counter}>{flashed.size} / {TOTAL} flashés</Text>

        {/* Recherche */}
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher (ex : 42 ou PA_42)"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        {/* Filtres */}
        <View style={styles.filterRow}>
          {[['all', 'Tous'], ['flashed', 'Flashés'], ['unflashed', 'Reste à faire']].map(([val, label]) => (
            <TouchableOpacity
              key={val}
              onPress={() => setFilter(val)}
              style={[styles.chip, filter === val && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === val && styles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Actions groupées */}
        <View style={styles.bulkRow}>
          <TouchableOpacity style={styles.bulkBtn} onPress={confirmBulkFlash}>
            <Text style={styles.bulkBtnText}>✓ Tout flasher</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, styles.bulkBtnDestructive]} onPress={confirmBulkUnflash}>
            <Text style={styles.bulkBtnText}>✕ Tout démarquer</Text>
          </TouchableOpacity>
        </View>

        {/* Liste */}
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucun résultat</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            extraData={flashed}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={5}
            removeClippedSubviews
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  closeBtn: {
    fontSize: 16,
    color: '#007AFF',
  },
  counter: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 13,
    color: '#8E8E93',
  },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
  },
  chipActive: {
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
  bulkRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  bulkBtn: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  bulkBtnDestructive: {
    backgroundColor: '#FFEAEA',
  },
  bulkBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  // Ligne
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: ROW_HEIGHT,
    backgroundColor: '#fff',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  rowInfo: {
    flex: 1,
  },
  rowId: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  rowMeta: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 38,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#C7C7CC',
  },
});
