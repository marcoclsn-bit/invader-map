import { useState, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrawerActions, useFocusEffect } from '@react-navigation/native';
import i18n from '../i18n';
import { useAppContext } from '../context/AppContext';
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

// Icône + couleur selon le type d'événement
function typeVisual(type, theme) {
  switch (type) {
    case 'added':       return { icon: 'add-circle',     color: theme.accent };       // ajout = accent néon
    case 'destroyed':   return { icon: 'close-circle',   color: '#FF4D4D' };          // destruction = rouge
    case 'reactivated': return { icon: 'refresh-circle', color: '#00C7BE' };          // réactivation = teal
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
    label = t('news.entry.added', { count: event.count, city: cityName(event.city) });
  } else if (event.type === 'destroyed') {
    label = t('news.entry.destroyed', { id: event.id });
  } else if (event.type === 'reactivated') {
    label = t('news.entry.reactivated', { id: event.id });
  } else {
    label = event.id ?? event.city;
  }

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={24} color={color} style={styles.rowIcon} />
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

  function toggle(code) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
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

  function onPressEvent(e) {
    if (e.city !== currentCityCode) setCurrentCity(e.city);
    const params = { _ts: Date.now() };
    if (e.type !== 'added' && e.id) params.focusId = e.id; // ajout groupé = pas d'id unique
    navigation.navigate('Tabs', { screen: 'Carte', params });
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
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="menu" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
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
    title: { ...typography.arcadeTitle, color: t.textPrimary },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.surface,
    },
    rowIcon: { width: 24 },
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
