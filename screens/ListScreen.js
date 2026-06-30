import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import {
  StyleSheet, View, Text, FlatList, TextInput,
  TouchableOpacity, Switch, Alert, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { CITIES } from '../cities/registry';
import { loadCityData, getCityData, checkCityForUpdate } from '../services/invaderData';
import { STATUS_COLOR } from '../constants';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

const ROW_HEIGHT = 56;
const KEY_LIST_CITIES = '@invader_list_cities';

function cityCodeOfId(id) {
  const i = id.lastIndexOf('_');
  return i > 0 ? id.slice(0, i) : id;
}

// ─── Cache de styles thémés ───────────────────────────────────────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

// ─── Ligne ────────────────────────────────────────────────────────────────────

const InvaderRow = memo(function InvaderRow({ item, isFlashed, onToggle, cityLabel, theme }) {
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const meta = `${t(`common.status.${item.status}`)} · ${item.points} ${t('common.pts')}`;
  return (
    <View style={styles.row}>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowId}>{item.id}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {cityLabel ? `${cityLabel} · ${meta}` : meta}
        </Text>
      </View>
      <View style={styles.switchWrap}>
        <Switch
          value={isFlashed}
          onValueChange={onToggle}
          trackColor={{ false: theme.border, true: theme.accent }}
          thumbColor={theme.bg}
          ios_backgroundColor={theme.border}
        />
      </View>
    </View>
  );
});

// ─── Sélecteur de villes ──────────────────────────────────────────────────────

function CityPicker({ initial, cityIndex, onValidate, onClose, theme, t }) {
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(() => new Set(initial));
  const [search, setSearch] = useState('');

  const cities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...cityIndex]
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cityIndex, search]);

  const allCodes = useMemo(() => cityIndex.map(c => c.code), [cityIndex]);
  const allSelected = selected.size === allCodes.length && allCodes.length > 0;

  function toggle(code) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allCodes));
  }

  // Estimation du volume (si « toutes » → prévenir)
  const estTotal = useMemo(() => {
    let n = 0;
    for (const c of cityIndex) if (selected.has(c.code)) n += c.count ?? 0;
    return n;
  }, [cityIndex, selected]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('list.picker.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder={t('list.picker.searchPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {/* Toutes les villes */}
      <TouchableOpacity style={styles.cityRow} onPress={toggleAll} activeOpacity={0.7}>
        <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={22} color={allSelected ? theme.accent : theme.textSecondary} />
        <Text style={[styles.cityName, { fontWeight: '700' }]}>{t('list.picker.selectAll')}</Text>
      </TouchableOpacity>
      <View style={styles.separator} />

      <FlatList
        data={cities}
        keyExtractor={c => c.code}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const on = selected.has(item.code);
          return (
            <TouchableOpacity style={styles.cityRow} onPress={() => toggle(item.code)} activeOpacity={0.7}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? theme.accent : theme.textSecondary} />
              <Text style={styles.cityName}>{item.name}</Text>
              {item.count != null && <Text style={styles.cityCount}>{item.count}</Text>}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{ paddingBottom: 110 }}
      />

      <View style={[styles.validateBar, { paddingBottom: insets.bottom + 12 }]}>
        {estTotal > 1500 && (
          <Text style={styles.warnText}>{t('list.picker.warnLarge', { count: estTotal })}</Text>
        )}
        <TouchableOpacity
          style={[styles.validateBtn, selected.size === 0 && styles.validateBtnDisabled]}
          onPress={() => onValidate([...selected])}
          disabled={selected.size === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.validateText}>{t('list.picker.validate', { count: selected.size })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Écran liste ──────────────────────────────────────────────────────────────

export default function ListScreen({ navigation }) {
  const { invaders, flashed, toggleFlash, bulkFlash, bulkUnflash, currentCityCode, cityIndex } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Villes sélectionnées (défaut : ville courante). Persistées.
  const [selectedCities, setSelectedCities] = useState(() => new Set([currentCityCode]));
  const [cityData, setCityData] = useState({});   // code → invaders[] (villes chargées à la demande)
  const [loading, setLoading] = useState(false);
  const prefLoaded = useRef(false);

  // Chargement / sauvegarde de la préférence
  useEffect(() => {
    AsyncStorage.getItem(KEY_LIST_CITIES).then((raw) => {
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) setSelectedCities(new Set(arr));
        } catch (_) {}
      }
      prefLoaded.current = true;
    });
  }, []);
  useEffect(() => {
    if (!prefLoaded.current) return;
    AsyncStorage.setItem(KEY_LIST_CITIES, JSON.stringify([...selectedCities]));
  }, [selectedCities]);

  // Charge les villes sélectionnées manquantes (ne recharge pas ce qui est déjà là).
  // loadCityData renvoie le cache immédiatement et fetch en arrière-plan SANS
  // l'attendre → pour une ville jamais téléchargée, on doit attendre le réseau.
  async function ensureCityInvaders(c) {
    try {
      await loadCityData(c);                 // charge le cache disque (instantané s'il existe)
      let d = getCityData(c);
      if (!d || !d.invaders?.length) {        // pas de cache → on attend le fetch réseau
        await checkCityForUpdate(c);
        d = getCityData(c);
      }
      return [c, d?.invaders ?? []];
    } catch (_) {
      return [c, []];
    }
  }

  useEffect(() => {
    const missing = [...selectedCities].filter(c => c !== currentCityCode && !cityData[c]);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(missing.map(ensureCityInvaders))
      .then((pairs) => {
        if (cancelled) return;
        setCityData(prev => {
          const next = { ...prev };
          for (const [c, inv] of pairs) next[c] = inv;
          return next;
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCities, currentCityCode, cityData]); // eslint-disable-line react-hooks/exhaustive-deps

  const multi = selectedCities.size > 1;
  const allSelected = selectedCities.size === cityIndex.length && cityIndex.length > 0;

  // Ensemble affiché : ville courante depuis le contexte (frais) + autres depuis le cache chargé
  const allInvaders = useMemo(() => {
    const out = [];
    for (const code of selectedCities) {
      if (code === currentCityCode) out.push(...invaders);
      else if (cityData[code]) out.push(...cityData[code]);
    }
    return out;
  }, [selectedCities, currentCityCode, invaders, cityData]);

  const flashedShown = useMemo(
    () => allInvaders.reduce((n, inv) => n + (flashed.has(inv.id) ? 1 : 0), 0),
    [allInvaders, flashed]
  );

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return allInvaders.filter((inv) => {
      if (q && !inv.id.includes(q)) return false;
      if (filter === 'flashed' && !flashed.has(inv.id)) return false;
      if (filter === 'unflashed' && flashed.has(inv.id)) return false;
      return true;
    });
  }, [allInvaders, search, filter, flashed]);

  const getItemLayout = useCallback((_, index) => ({
    length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index,
  }), []);

  const renderItem = useCallback(({ item }) => (
    <InvaderRow
      item={item}
      isFlashed={flashed.has(item.id)}
      onToggle={() => toggleFlash(item.id)}
      cityLabel={multi ? (CITIES[cityCodeOfId(item.id)]?.name ?? null) : null}
      theme={theme}
    />
  ), [flashed, toggleFlash, theme, multi]);

  function confirmBulkFlash() {
    const ids = rows.map(r => r.id);
    Alert.alert(
      t('list.bulkFlash.title'),
      t('list.bulkFlash.msg', { count: ids.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: () => bulkFlash(ids) },
      ]
    );
  }
  function confirmBulkUnflash() {
    const ids = rows.map(r => r.id);
    Alert.alert(
      t('list.bulkUnflash.title'),
      t('list.bulkUnflash.msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: 'destructive', onPress: () => bulkUnflash(ids) },
      ]
    );
  }

  // Libellé du sélecteur de villes
  const citiesLabel = allSelected
    ? t('list.allCities')
    : selectedCities.size === 1
      ? (CITIES[[...selectedCities][0]]?.name ?? [...selectedCities][0])
      : t('list.citiesSelected', { count: selectedCities.size });

  const headerTitle = multi
    ? (allSelected ? t('list.allCities') : t('list.titleMulti', { count: selectedCities.size }))
    : t('list.title', { city: citiesLabel });

  if (pickerOpen) {
    return (
      <CityPicker
        initial={[...selectedCities]}
        cityIndex={cityIndex}
        onClose={() => setPickerOpen(false)}
        onValidate={(codes) => {
          setSelectedCities(new Set(codes.length ? codes : [currentCityCode]));
          setPickerOpen(false);
        }}
        theme={theme}
        t={t}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{headerTitle}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.counter} numberOfLines={1}>{t('list.counter', { flashed: flashedShown, total: allInvaders.length })}</Text>
          <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="menu" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sélecteur de villes */}
      <TouchableOpacity style={styles.cityBar} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
        <Ionicons name="business-outline" size={16} color={theme.accent} />
        <Text style={styles.cityBarText} numberOfLines={1}>{citiesLabel}</Text>
        {loading
          ? <ActivityIndicator size="small" color={theme.textSecondary} />
          : <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />}
      </TouchableOpacity>

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

      {loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.emptyText, { marginTop: 12 }]}>{t('list.loadingCities')}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('list.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          extraData={[flashed, theme, multi]}
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
    title: { ...typography.arcadeTitle, color: t.textPrimary, flexShrink: 1, marginRight: 12 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
    counter: { ...typography.arcadeHeading, fontSize: 12, color: t.textSecondary },

    cityBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: t.surfaceHigh, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    cityBarText: { flex: 1, fontSize: 14, fontWeight: '600', color: t.textPrimary },

    searchInput: {
      marginHorizontal: 16, marginTop: 10, marginBottom: 10,
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
    switchWrap: { alignSelf: 'stretch', justifyContent: 'center' },
    rowId: { fontSize: 15, fontWeight: '600', color: t.textPrimary },
    rowMeta: { fontSize: 12, color: t.textSecondary, marginTop: 1 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 38 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 16, color: t.textSecondary },

    // Picker
    cityRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 18, paddingVertical: 13, backgroundColor: t.surface,
    },
    cityName: { flex: 1, fontSize: 15, color: t.textPrimary },
    cityCount: { fontSize: 13, color: t.textSecondary },
    validateBar: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingHorizontal: 16, paddingTop: 12,
      backgroundColor: t.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },
    validateBtn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    validateBtnDisabled: { opacity: 0.45 },
    validateText: { ...typography.arcadeHeading, fontSize: 14, color: t.bg },
    warnText: { fontSize: 12, color: t.textSecondary, textAlign: 'center', marginBottom: 8 },
  });
}
