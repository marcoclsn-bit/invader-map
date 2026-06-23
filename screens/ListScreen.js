import { useState, useMemo, useCallback, memo } from 'react';
import {
  StyleSheet, View, Text, FlatList, TextInput,
  TouchableOpacity, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { STATUS_COLOR } from '../constants';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

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
  const { t } = useTranslation();
  const styles = getStyles(theme);
  return (
    <View style={styles.row}>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowId}>{item.id}</Text>
        <Text style={styles.rowMeta}>{t(`common.status.${item.status}`)} · {item.points} {t('common.pts')}</Text>
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
  const { invaders, flashed, toggleFlash, bulkFlash, bulkUnflash } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return invaders.filter((inv) => {
      if (q && !inv.id.includes(q)) return false;
      if (filter === 'flashed' && !flashed.has(inv.id)) return false;
      if (filter === 'unflashed' && flashed.has(inv.id)) return false;
      return true;
    });
  }, [invaders, search, filter, flashed]);

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
    Alert.alert(
      t('list.bulkFlash.title'),
      t('list.bulkFlash.msg', { count: invaders.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: bulkFlash },
      ]
    );
  }

  function confirmBulkUnflash() {
    Alert.alert(
      t('list.bulkUnflash.title'),
      t('list.bulkUnflash.msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: 'destructive', onPress: bulkUnflash },
      ]
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('list.title')}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.counter}>{t('list.counter', { flashed: flashed.size, total: invaders.length })}</Text>
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
        placeholder={t('list.searchPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
        clearButtonMode="while-editing"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <View style={styles.filterRow}>
        {[['all', t('list.all')], ['flashed', t('list.flashed')], ['unflashed', t('list.unflashed')]].map(([val, label]) => (
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
          <Text style={styles.bulkBtnText}>{t('list.bulkFlashBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.bulkBtn, styles.bulkBtnDestructive]} onPress={confirmBulkUnflash}>
          <Text style={[styles.bulkBtnText, { color: theme.destructive }]}>{t('list.bulkUnflashBtn')}</Text>
        </TouchableOpacity>
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('list.empty')}</Text>
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
