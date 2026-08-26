import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Switch, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { passagesISS } from '../utils/issPassages';
import { obtenirTle } from '../services/issTle';
import { planNotificationsISS } from '../utils/issNotifications';
import { rechercherVilles } from '../utils/villesSearch';
import { track } from '../services/analytics';

// ─── Réglages de recherche des passages ──────────────────────────────────────
// 16 jours : assez pour montrer plusieurs occasions sans faire tourner le SGP4
// trop longtemps. 80° = seuil « flashable » (à confirmer sur le terrain).
const FENETRE_JOURS = 16;
const SEUIL_DEG = 80;

const CLE_LIEU = '@invader_iss_lieu';
const CLE_ALERTES = '@invader_iss_alertes';

// ─── Cache de styles thémés (même motif que les autres écrans) ────────────────
let _styleCache = null;
function getStyles(theme) {
  if (_styleCache?.theme === theme) return _styleCache.styles;
  const styles = makeStyles(theme);
  _styleCache = { theme, styles };
  return styles;
}

export default function IssScreen({ navigation }) {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = getStyles(theme);

  const [lieu, setLieu] = useState(null);           // { nom, label, lat, lng }
  const [choix, setChoix] = useState(false);        // mode « recherche de lieu »
  const [requete, setRequete] = useState('');
  const [tle, setTle] = useState(null);             // { tle1, tle2, ageMs }
  const [tleStatut, setTleStatut] = useState('loading'); // loading | ready | error
  const [passages, setPassages] = useState(null);   // null = pas encore calculé
  const [calcul, setCalcul] = useState(false);
  const [armes, setArmes] = useState(() => new Set()); // picMs alarmés (persistés)
  const [maintenant] = useState(() => Date.now());

  // ── Chargement initial : lieu mémorisé, alertes mémorisées, TLE ──────────────
  useEffect(() => {
    (async () => {
      try {
        const brut = await AsyncStorage.getItem(CLE_LIEU);
        if (brut) setLieu(JSON.parse(brut)); else setChoix(true);
      } catch { setChoix(true); }
      try {
        const a = await AsyncStorage.getItem(CLE_ALERTES);
        if (a) setArmes(new Set(JSON.parse(a)));
      } catch { /* pas grave */ }
    })();

    (async () => {
      const res = await obtenirTle(Date.now());
      if (res) { setTle(res); setTleStatut('ready'); }
      else setTleStatut('error');
    })();
  }, []);

  // ── Recalcul des passages dès que lieu ou TLE change ─────────────────────────
  useEffect(() => {
    if (!lieu || !tle) return;
    setCalcul(true);
    setPassages(null);
    // Différé d'un tick : le SGP4 sur 16 jours ne doit pas bloquer le premier rendu.
    const id = setTimeout(() => {
      try {
        const ps = passagesISS({
          tle1: tle.tle1, tle2: tle.tle2,
          lat: lieu.lat, lng: lieu.lng,
          debutMs: Date.now(), dureeJours: FENETRE_JOURS, seuilDeg: SEUIL_DEG,
        });
        setPassages(ps);
      } catch {
        setPassages([]);
        setTleStatut('error');
      }
      setCalcul(false);
    }, 0);
    return () => clearTimeout(id);
  }, [lieu, tle]);

  // ── Choix d'un lieu ──────────────────────────────────────────────────────────
  const resultats = useMemo(() => rechercherVilles(requete, 8), [requete]);

  const choisirLieu = useCallback((v) => {
    setLieu(v);
    setChoix(false);
    setRequete('');
    Keyboard.dismiss();
    AsyncStorage.setItem(CLE_LIEU, JSON.stringify(v)).catch(() => {});
    track('iss_lieu_choisi', { label: v.label });
  }, []);

  // ── Armer / désarmer une alerte pour un passage ──────────────────────────────
  const basculerAlerte = useCallback((pic) => {
    setArmes((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(pic)) suivant.delete(pic); else suivant.add(pic);
      AsyncStorage.setItem(CLE_ALERTES, JSON.stringify([...suivant])).catch(() => {});
      return suivant;
    });
  }, []);

  // ── Formatage des dates (langue de l'app, fuseau de l'appareil) ──────────────
  // Même motif que SortiesScreen : toLocale*, éprouvé sous Hermes.
  const jourDe = (ms) => new Date(ms).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
  const heureDe = (ms) => new Date(ms).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  function relatif(ms) {
    const a = new Date(maintenant); a.setHours(0, 0, 0, 0);
    const b = new Date(ms); b.setHours(0, 0, 0, 0);
    const n = Math.round((b - a) / 86400000);
    if (n <= 0) return t('iss.today');
    if (n === 1) return t('iss.tomorrow');
    return t('iss.inDays', { n });
  }

  // Description des rappels qu'arme la cloche, adaptée à l'heure du passage.
  function descriptionAlertes(p) {
    const plan = planNotificationsISS([p], Date.now());
    return plan.map((e) => {
      if (e.type === 'veille') return t('iss.reminderVeille');
      if (e.type === 'matin') return t('iss.reminderMatin');
      return t('iss.reminderImminent');
    });
  }

  const fenetreSec = (p) => Math.max(1, Math.round((p.flashableFinMs - p.flashableDebutMs) / 1000));

  // ── Rendu ─────────────────────────────────────────────────────────────────────
  const capitale = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('iss.headerTitle')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Identité SPACE_02 ── */}
        <View style={styles.identity}>
          <View style={styles.chip}>
            <Text style={{ fontSize: 26 }}>👾</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.idName}>SPACE_02</Text>
            <Text style={styles.idSub}>{t('iss.subtitle')}</Text>
          </View>
          <View style={styles.pts}>
            <Text style={styles.ptsValue}>100 + 100</Text>
            <Text style={styles.ptsLabel}>PTS</Text>
          </View>
        </View>
        <Text style={styles.intro}>{t('iss.intro')}</Text>

        {/* ── Sélecteur de lieu ── */}
        {lieu && !choix ? (
          <TouchableOpacity style={styles.lieuRow} onPress={() => setChoix(true)} activeOpacity={0.7}>
            <Ionicons name="location" size={18} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lieuNom}>{lieu.nom}</Text>
              <Text style={styles.lieuLabel}>{lieu.label}</Text>
            </View>
            <Text style={styles.changer}>{t('iss.changeLocation')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.searchBox}>
            <Text style={styles.searchTitle}>{t('iss.searchTitle')}</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                style={styles.input}
                value={requete}
                onChangeText={setRequete}
                placeholder={t('iss.searchPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                autoCorrect={false}
                autoFocus={choix && !lieu}
              />
              {requete.length > 0 && (
                <TouchableOpacity onPress={() => setRequete('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {resultats.map((v, i) => (
              <TouchableOpacity key={`${v.nom}-${v.lat}-${i}`} style={styles.result} onPress={() => choisirLieu(v)}>
                <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
                <Text style={styles.resultNom}>{v.nom}</Text>
                <Text style={styles.resultLabel} numberOfLines={1}>{v.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Corps : passages ── */}
        {lieu && !choix && (
          <View style={{ paddingHorizontal: 16 }}>
            {tleStatut === 'error' && (
              <Text style={styles.stateMsg}>{t('iss.unavailable')}</Text>
            )}

            {tleStatut !== 'error' && (calcul || passages === null) && (
              <View style={styles.stateRow}>
                <ActivityIndicator color={theme.accent} />
                <Text style={styles.stateMsg}>{t('iss.computing')}</Text>
              </View>
            )}

            {tleStatut === 'ready' && !calcul && passages && passages.length === 0 && (
              <Text style={styles.stateMsg}>
                {t('iss.noPass', { city: lieu.nom, days: FENETRE_JOURS })}
              </Text>
            )}

            {tleStatut === 'ready' && !calcul && passages && passages.length > 0 && (
              <>
                {/* Prochain passage — vedette */}
                <Text style={styles.sectionLabel}>{t('iss.nextPass')}</Text>
                {renderHero(passages[0])}

                {/* Passages suivants */}
                {passages.length > 1 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 22 }]}>{t('iss.otherPasses')}</Text>
                    {passages.slice(1).map((p) => renderRow(p))}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* ── Note « comment ça marche » ── */}
        <View style={styles.note}>
          <Text style={styles.noteText}>{t('iss.flashNote')}</Text>
        </View>
      </ScrollView>
    </View>
  );

  // ── Sous-rendus ────────────────────────────────────────────────────────────
  function renderHero(p) {
    const arme = armes.has(p.picMs);
    return (
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroDay}>{capitale(jourDe(p.picMs))}</Text>
          <Text style={styles.heroRelatif}>{relatif(p.picMs)}</Text>
        </View>
        <Text style={styles.heroTime}>{heureDe(p.picMs)}</Text>
        <View style={styles.facts}>
          <View style={styles.fact}>
            <Text style={styles.factValue}>{Math.round(p.elevationMaxDeg)}°</Text>
            <Text style={styles.factLabel}>{t('iss.elevation')}</Text>
          </View>
          <View style={styles.fact}>
            <Text style={styles.factValue}>{fenetreSec(p)} s</Text>
            <Text style={styles.factLabel}>{t('iss.window')}</Text>
          </View>
        </View>
        {renderAlerte(p, arme)}
      </View>
    );
  }

  function renderRow(p) {
    const arme = armes.has(p.picMs);
    return (
      <View key={p.picMs} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowDate}>
            {capitale(jourDe(p.picMs))} · {heureDe(p.picMs)}
          </Text>
          <Text style={styles.rowMeta}>
            {Math.round(p.elevationMaxDeg)}° · {fenetreSec(p)} s
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => basculerAlerte(p.picMs)}
          style={[styles.bell, arme && styles.bellOn]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={arme ? 'notifications' : 'notifications-outline'}
            size={18}
            color={arme ? theme.accent : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>
    );
  }

  function renderAlerte(p, arme) {
    return (
      <View style={styles.alerteBox}>
        <View style={styles.alerteHead}>
          <Text style={styles.alerteTitle}>{t('iss.alert')}</Text>
          <Switch
            value={arme}
            onValueChange={() => basculerAlerte(p.picMs)}
            trackColor={{ true: theme.accentDim, false: theme.surfaceHigh }}
            thumbColor={arme ? theme.accent : theme.textSecondary}
          />
        </View>
        {arme && descriptionAlertes(p).map((d, i) => (
          <View key={i} style={styles.alerteLine}>
            <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
            <Text style={styles.alerteLineText}>{d}</Text>
          </View>
        ))}
      </View>
    );
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 16, paddingVertical: 12,
    },
    headerTitle: { ...typography.arcadeTitle, color: theme.textPrimary },

    identity: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, marginTop: 6,
    },
    chip: {
      width: 46, height: 46, borderRadius: 12,
      backgroundColor: theme.flashedDim, borderWidth: 1, borderColor: theme.flashed,
      alignItems: 'center', justifyContent: 'center',
    },
    idName: { ...typography.arcadeHeading, color: theme.textPrimary },
    idSub: { fontSize: 12.5, color: theme.flashed, marginTop: 2 },
    pts: { alignItems: 'flex-end' },
    ptsValue: { fontSize: 14, fontWeight: '800', color: theme.accentScore },
    ptsLabel: { fontSize: 10, letterSpacing: 1, color: theme.textSecondary },
    intro: {
      paddingHorizontal: 16, marginTop: 12, marginBottom: 18,
      fontSize: 13.5, lineHeight: 20, color: theme.textSecondary,
    },

    // Sélecteur de lieu
    lieuRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: 16, padding: 14, borderRadius: 13,
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    },
    lieuNom: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
    lieuLabel: { fontSize: 12.5, color: theme.textSecondary, marginTop: 1 },
    changer: { fontSize: 12.5, fontWeight: '700', color: theme.accent },

    searchBox: { marginHorizontal: 16 },
    searchTitle: {
      ...typography.fieldLabel, color: theme.textSecondary, marginBottom: 8,
    },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
      borderRadius: 13, paddingHorizontal: 12, height: 46,
    },
    input: { flex: 1, fontSize: 16, color: theme.textPrimary, paddingVertical: 0 },
    result: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
    },
    resultNom: { fontSize: 15, color: theme.textPrimary },
    resultLabel: { flex: 1, textAlign: 'right', fontSize: 12.5, color: theme.textSecondary },

    // États
    stateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
    stateMsg: { fontSize: 13.5, lineHeight: 20, color: theme.textSecondary, marginTop: 20 },

    sectionLabel: {
      ...typography.fieldLabel, color: theme.accent, marginTop: 22, marginBottom: 10,
    },

    // Vedette
    hero: {
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
      borderRadius: 18, padding: 18,
    },
    heroTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    heroDay: { fontSize: 14, color: theme.textSecondary },
    heroRelatif: { fontSize: 12.5, fontWeight: '700', color: theme.accentScore },
    heroTime: { fontSize: 42, fontWeight: '800', color: theme.textPrimary, marginTop: 4, letterSpacing: 1 },
    facts: { flexDirection: 'row', gap: 8, marginTop: 14 },
    fact: {
      flex: 1, backgroundColor: theme.surfaceHigh, borderRadius: 11,
      paddingVertical: 10, alignItems: 'center',
    },
    factValue: { fontSize: 18, fontWeight: '800', color: theme.textPrimary },
    factLabel: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.textSecondary, marginTop: 2 },

    // Bloc alerte
    alerteBox: { marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 14 },
    alerteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    alerteTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
    alerteLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    alerteLineText: { flex: 1, fontSize: 12.5, color: theme.textSecondary },

    // Ligne de passage
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border,
    },
    rowDate: { fontSize: 14, color: theme.textPrimary },
    rowMeta: { fontSize: 12.5, color: theme.textSecondary, marginTop: 2 },
    bell: {
      width: 38, height: 38, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface,
    },
    bellOn: { borderColor: theme.accent, backgroundColor: theme.accentDim },

    note: {
      marginTop: 26, marginHorizontal: 16, padding: 14,
      backgroundColor: theme.flashedDim, borderLeftWidth: 2, borderLeftColor: theme.flashed,
      borderRadius: 10,
    },
    noteText: { fontSize: 12.5, lineHeight: 19, color: theme.textSecondary },
  });
}
