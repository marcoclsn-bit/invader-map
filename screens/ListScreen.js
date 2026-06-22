import { useState, useMemo, useCallback, memo } from 'react';
import {
  StyleSheet, View, Text, FlatList, TextInput,
  TouchableOpacity, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INVADERS } from '../data/invaders';
import { useAppContext } from '../context/AppContext';
import { STATUS_COLOR, STATUS_LABEL } from '../constants';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

const TOTAL = INVADERS.length;
const ROW_HEIGHT = 56;

// ─── Cache de styles thémés ───────────────────────────────────────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

// ─── Ligne ────────────────────────────────────────────────────────────────────

const InvaderRow = memo(function InvaderRow({ item, isFlashed, onToggle, theme }) {
  const styles = getStyles(theme);
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
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={theme.bg}
        ios_backgroundColor={theme.border}
      />
    </View>
  );
});

// ─── Écran liste ──────────────────────────────────────────────────────────────

export default function ListScreen({ navigation }) {
  const { flashed, toggleFlash, bulkFlash, bulkUnflash } = useAppContext();
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return INVADERS.filter((inv) => {
      if (q && !inv.id.includes(q)) return false;
      if (filter === 'flashed' && !flashed.has(inv.id)) return false;
      if (filter === 'unflashed' && flashed.has(inv.id)) return false;
      return true;
    });
  }, [search, filter, flashed]);

  const getItemLayout = useCallback((_, index) => ({
    length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index,
  }), []);

  const renderItem = useCallback(({ item }) => (
    <InvaderRow
      item={item}
      isFlashed={flashed.has(item.id)}
      onToggle={() => toggleFlash(item.id)}
      theme={theme}
    />
  ), [flashed, toggleFlash, theme]);

  function confirmBulkFlash() {
    Alert.alert('Tout marquer comme flashé', `Marquer les ${TOTAL} Invaders comme flashés ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: bulkFlash },
    ]);
  }

  function confirmBulkUnflash() {
    Alert.alert('Tout démarquer', 'Retirer le marquage de tous les Invaders ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', style: 'destructive', onPress: bulkUnflash },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Invaders Paris</Text>
        <View style={styles.headerRight}>
          <Text style={styles.counter}>{flashed.size} / {TOTAL} flashés</Text>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate('Réglages')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Rechercher (ex : 42 ou PA_42)"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
        clearButtonMode="while-editing"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <View style={styles.filterRow}>
        {[['all', 'Tous'], ['flashed', 'Flashés'], ['unflashed', 'Reste à faire']].map(([val, label]) => (
          <TouchableOpacity
            key={val}
            onPress={() => setFilter(val)}
            style={[styles.chip, filter === val && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === val && styles.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.bulkRow}>
        <TouchableOpacity style={styles.bulkBtn} onPress={confirmBulkFlash}>
          <Text style={styles.bulkBtnText}>✓ Tout flasher</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.bulkBtn, styles.bulkBtnDestructive]} onPress={confirmBulkUnflash}>
          <Text style={[styles.bulkBtnText, { color: theme.destructive }]}>✕ Tout démarquer</Text>
        </TouchableOpacity>
      </View>

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
          extraData={[flashed, theme]}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
          removeClippedSubviews
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

// ─── Styles thémés ────────────────────────────────────────────────────────────

function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
      backgroundColor: t.surface,
    },
    title: { ...typography.arcadeTitle, color: t.textPrimary },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    counter: { ...typography.arcadeHeading, fontSize: 12, color: t.textSecondary },

    searchInput: {
      marginHorizontal: 16, marginTop: 12, marginBottom: 10,
      backgroundColor: t.surfaceHigh,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      fontSize: 15, color: t.textPrimary,
    },

    filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
    chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: t.surfaceHigh },
    chipActive: { backgroundColor: t.accent },
    chipText: { fontSize: 13, fontWeight: '500', color: t.textSecondary },
    chipTextActive: { color: t.bg },

    bulkRow: {
      flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    bulkBtn: {
      flex: 1, backgroundColor: t.surfaceHigh, borderRadius: 8,
      paddingVertical: 9, alignItems: 'center',
    },
    bulkBtnDestructive: { backgroundColor: t.surfaceHigh },
    bulkBtnText: { fontSize: 13, fontWeight: '500', color: t.textPrimary },

    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, height: ROW_HEIGHT,
      backgroundColor: t.surface,
    },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    rowInfo: { flex: 1 },
    rowId: { fontSize: 15, fontWeight: '600', color: t.textPrimary },
    rowMeta: { fontSize: 12, color: t.textSecondary, marginTop: 1 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 38 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 16, color: t.textSecondary },
  });
}
