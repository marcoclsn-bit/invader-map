import { useState, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrawerActions, useFocusEffect } from '@react-navigation/native';
import i18n from '../i18n';
import { useAppContext } from '../context/AppContext';
import InvaderPhoto from '../components/InvaderPhoto';
import { getCityData, loadCityData, checkCityForUpdate } from '../services/invaderData';
import { CITIES } from '../cities/registry';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

// ─── Cache de styles thémés ───────────────────────────────────────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

// Type d'événement → statut (pour le placeholder pixel-art de la vignette)
const TYPE_STATUS = {
  destroyed: 'destroyed', damaged: 'damaged',
  added: 'ok', reactivated: 'ok', updated: 'unknown',
};

// Icône + couleur selon le type d'événement
function typeVisual(type, theme) {
  switch (type) {
    case 'added':       return { icon: 'add-circle',     color: theme.accent };       // ajout = accent néon
    case 'destroyed':   return { icon: 'close-circle',   color: '#FF4D4D' };          // destruction = rouge
    case 'damaged':     return { icon: 'warning',        color: '#FFB020' };          // dégradation = ambre
    case 'reactivated': return { icon: 'refresh-circle', color: '#00C7BE' };          // réactivation = teal
    case 'updated':     return { icon: 'information-circle', color: theme.textSecondary }; // mise à jour statut
    default:            return { icon: 'ellipse',        color: theme.textSecondary };
  }
}

function cityName(code) {
  return CITIES[code]?.name ?? code;
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

// ─── Ligne d'événement ────────────────────────────────────────────────────────
function EventRow({ event, isNew, onPress, theme, t }) {
  const styles = getStyles(theme);
  const { icon, color } = typeVisual(event.type, theme);

  let label;
  if (event.type === 'added') {
    // invader-spotter : ajout d'un Invader précis (id) ; ancien format : ajout groupé (count)
    label = event.id
      ? t('news.entry.addedOne', { id: event.id })
      : t('news.entry.added', { count: event.count, city: cityName(event.city) });
  } else if (event.type === 'destroyed') {
    label = t('news.entry.destroyed', { id: event.id });
  } else if (event.type === 'damaged') {
    label = t('news.entry.damaged', { id: event.id });
  } else if (event.type === 'reactivated') {
    label = t('news.entry.reactivated', { id: event.id });
  } else if (event.type === 'updated') {
    label = t('news.entry.updated', { id: event.id });
  } else {
    label = event.id ?? event.city;
  }

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.thumbWrap}>
        <InvaderPhoto photoUrl={event.photoUrl} status={TYPE_STATUS[event.type] ?? 'unknown'} style={styles.thumb} />
        <View style={[styles.typeBadge, { backgroundColor: color }]}>
          <Ionicons name={icon} size={12} color="#fff" />
        </View>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowMeta}>{formatDate(event.date)}</Text>
      </View>
      {isNew && (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>{t('news.newBadge')}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </TouchableOpacity>
  );
}

// ─── Sélecteur de villes ──────────────────────────────────────────────────────
function CityPicker({ initial, onValidate, onCancel, canCancel, theme, t, cityIndex }) {
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {canCancel ? (
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        ) : <View style={{ width: 24 }} />}
        <Text style={styles.title}>{t('news.picker.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.pickerSubtitle}>{t('news.picker.subtitle')}</Text>

      <TextInput
        style={styles.search}
        placeholder={t('news.picker.searchPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {/* Tout suivre / tout désélectionner */}
      <TouchableOpacity style={styles.cityRow} onPress={toggleAll} activeOpacity={0.7}>
        <Ionicons
          name={allSelected ? 'checkbox' : 'square-outline'}
          size={22}
          color={allSelected ? theme.accent : theme.textSecondary}
        />
        <Text style={[styles.cityName, { fontWeight: '700' }]}>
          {allSelected ? t('news.picker.deselectAll') : t('news.picker.selectAll')}
        </Text>
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
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={22}
                color={on ? theme.accent : theme.textSecondary}
              />
              <Text style={styles.cityName}>{item.name}</Text>
              {item.count != null && <Text style={styles.cityCount}>{item.count}</Text>}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <View style={[styles.validateBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.validateBtn, selected.size === 0 && styles.validateBtnDisabled]}
          onPress={() => onValidate([...selected])}
          disabled={selected.size === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.validateText}>
            {t('news.picker.validate', { count: selected.size })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Écran News ───────────────────────────────────────────────────────────────
export default function NewsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);
  const {
    news, newsCities, setNewsCitiesPref, newsLastSeen, markNewsSeen,
    cityIndex, currentCityCode, setCurrentCity,
    newsNotify, setNewsNotifyPref,
  } = useAppContext();

  // Date de dernière consultation, gardée à jour dans un ref pour la lire au focus
  const lastSeenRef = useRef(newsLastSeen);
  lastSeenRef.current = newsLastSeen;
  // « seenDay » fige la date d'AVANT cette consultation → badges « nouveau » de la session
  const [seenDay, setSeenDay] = useState(() => (newsLastSeen ? newsLastSeen.slice(0, 10) : null));

  // À chaque fois que l'écran est affiché : on fige la baseline puis on marque vu
  // (réinitialise le badge du menu). Les écrans du drawer restant montés, on utilise
  // le focus plutôt que le seul montage.
  useFocusEffect(useCallback(() => {
    const prev = lastSeenRef.current;
    setSeenDay(prev ? prev.slice(0, 10) : null);
    markNewsSeen();
  }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerOpen, setPickerOpen] = useState(false);
  const needsInitialChoice = !newsCities;

  // Événements filtrés par villes suivies, plus récents d'abord
  const feed = useMemo(() => {
    if (!newsCities) return [];
    return news.events
      .filter(e => newsCities.has(e.city))
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [news, newsCities]);

  function goToMap(city, focusId) {
    if (city !== currentCityCode) setCurrentCity(city);
    const params = { _ts: Date.now() };
    if (focusId) params.focusId = focusId;
    navigation.navigate('Tabs', { screen: 'Carte', params });
  }

  async function onPressEvent(e) {
    if (!e.id) return goToMap(e.city, null);

    // Cherche l'Invader dans les données de sa ville (cache → réseau si besoin).
    let d = getCityData(e.city);
    if (!d?.invaders?.length) { try { await loadCityData(e.city); } catch {} d = getCityData(e.city); }
    if (!d?.invaders?.length) { try { await checkCityForUpdate(e.city); } catch {} d = getCityData(e.city); }

    // On ne montre le message QUE si on a bien les données de la ville et que
    // l'Invader y est absent (= nouveau, coordonnées pas encore renseignées).
    // Si les données sont indisponibles (hors-ligne), on garde le comportement
    // historique : on ouvre la carte, qui réessaiera d'ouvrir la fiche.
    if (d?.invaders?.length && !d.invaders.some(i => i.id === e.id)) {
      Alert.alert(t('news.comingSoon.title'), t('news.comingSoon.body', { id: e.id }));
      return;
    }
    goToMap(e.city, e.id);
  }

  // ── Sélecteur de villes (premier accès ou bouton filtre) ──
  if (needsInitialChoice || pickerOpen) {
    return (
      <CityPicker
        initial={newsCities ? [...newsCities] : [currentCityCode]}
        canCancel={!needsInitialChoice}
        onCancel={() => setPickerOpen(false)}
        onValidate={(codes) => { setNewsCitiesPref(codes); setPickerOpen(false); }}
        theme={theme}
        t={t}
        cityIndex={cityIndex}
      />
    );
  }

  // ── Fil ──
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setPickerOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="options-outline" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('news.title')}</Text>
        <View style={styles.headerRight}>
          {/* Cloche : active/désactive les alertes de nouveautés */}
          <TouchableOpacity onPress={() => setNewsNotifyPref(!newsNotify)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons
              name={newsNotify ? 'notifications' : 'notifications-off-outline'}
              size={22}
              color={newsNotify ? theme.accent : theme.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="menu" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {feed.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🛰️</Text>
          <Text style={styles.emptyTitle}>{t('news.empty.title')}</Text>
          <Text style={styles.emptyBody}>{t('news.empty.body')}</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(e, i) => `${e.type}-${e.id ?? e.city}-${e.date}-${i}`}
          renderItem={({ item }) => (
            <EventRow
              event={item}
              isNew={!seenDay || (item.date > seenDay)}
              onPress={() => onPressEvent(item)}
              theme={theme}
              t={t}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListFooterComponent={<Text style={styles.credit}>{t('news.credit')}</Text>}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      backgroundColor: t.surface,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    credit: { fontSize: 11, color: t.textSecondary, textAlign: 'center', paddingVertical: 18 },
    title: { ...typography.arcadeTitle, color: t.textPrimary },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.surface,
    },
    thumbWrap: { width: 46, height: 46 },
    thumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: t.surfaceHigh },
    typeBadge: {
      position: 'absolute', right: -3, bottom: -3,
      width: 20, height: 20, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: t.surface,
    },
    rowBody: { flex: 1 },
    rowLabel: { fontSize: 15, color: t.textPrimary, fontWeight: '500' },
    rowMeta: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
    newBadge: {
      backgroundColor: t.accent, borderRadius: 10,
      paddingHorizontal: 8, paddingVertical: 2, marginRight: 4,
    },
    newBadgeText: { fontSize: 10, fontWeight: '700', color: t.bg, letterSpacing: 0.5 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 52 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    emptyEmoji: { fontSize: 44, marginBottom: 12 },
    emptyTitle: { ...typography.arcadeHeading, fontSize: 15, color: t.textPrimary, textAlign: 'center', marginBottom: 8 },
    emptyBody: { fontSize: 14, color: t.textSecondary, textAlign: 'center', lineHeight: 21 },

    // Picker
    pickerSubtitle: { fontSize: 13, color: t.textSecondary, paddingHorizontal: 20, paddingTop: 12 },
    search: {
      marginHorizontal: 16, marginTop: 12, marginBottom: 8,
      backgroundColor: t.surfaceHigh, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: t.textPrimary,
    },
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
    validateBtn: {
      backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    },
    validateBtnDisabled: { opacity: 0.45 },
    validateText: { ...typography.arcadeHeading, fontSize: 14, color: t.bg },
  });
}
