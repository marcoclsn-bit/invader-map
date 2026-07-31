import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme/tokens';
import { CITIES } from '../../cities/registry';
import { getBadge } from '../../data/badges';
import { useGamification } from '../../context/GamificationContext';
import { useAppContext } from '../../context/AppContext';
import ShareStory, { FORMATS, FORMAT_DEFAUT, buildStaticMap, trimRouteEnds } from '../share/ShareStory';
import { captureAndShare } from '../../services/shareStory';
import { reserveMapboxCall } from '../../services/routing';
import { MAPBOX_TOKEN } from '../../config/mapbox';
import { track } from '../../services/analytics';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ordre des formats dans le sélecteur : le plus courant d'abord.
const ORDRE = ['story', 'post', 'square'];
const RATIOS = { story: '9:16', post: '4:5', square: '1:1' };

// Encombrement maximal de l'aperçu. La story est le format le plus haut ; à
// 300 px elle laisse la place au tableau de score et aux boutons sans imposer
// de défilement sur un petit écran.
const APERCU_H_MAX = 300;

function fmtDuration(sec) {
  const m = Math.round((sec ?? 0) / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return `${m}′`;
}

// Coquille : `pendingRecap` peut être absent, les hooks du corps ne doivent donc
// pas être déclarés ici (ils seraient conditionnels).
export default function SessionRecap() {
  const { pendingRecap, clearRecap } = useGamification();
  if (!pendingRecap?.session) return null;
  return (
    <RecapBody
      session={pendingRecap.session}
      newBadgeIds={pendingRecap.newBadgeIds ?? []}
      onClose={clearRecap}
    />
  );
}

function RecapBody({ session, newBadgeIds, onClose }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { invaders } = useAppContext();
  const { width: screenW } = useWindowDimensions();
  const storyRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [shareMap, setShareMap] = useState(null); // carte réelle Mapbox (null = fond stylisé)
  const [format, setFormat] = useState(FORMAT_DEFAUT);
  // Fond Mapbox déjà obtenu, par format : chaque format a son propre cadrage,
  // donc sa propre image. Sans ce cache, un aller-retour entre deux formats
  // consommerait un appel du plafond quotidien à chaque passage.
  const fondsRef = useRef({});

  const cityName = CITIES[session.city]?.name ?? session.city ?? '—';

  // Pins des Invaders attrapés : coordonnées + points, retrouvés dans les données
  // de la ville courante (la session se déroule dans cette ville).
  const pins = useMemo(() => {
    const invById = new Map((invaders ?? []).map((i) => [i.id, i]));
    return (session.invaderIds ?? [])
      .map((id) => invById.get(id))
      .filter(Boolean)
      .map((i) => ({ lng: i.lng, lat: i.lat, points: i.points ?? 0 }));
  }, [invaders, session.invaderIds]);

  // Points accumulés pendant la session (somme des Invaders flashés).
  const sessionPoints = pins.reduce((s, p) => s + (p.points ?? 0), 0);

  // Tracé rogné (confidentialité : masque le départ/arrivée près du domicile).
  const shareRoute = useMemo(() => trimRouteEnds(session.routeCoords), [session.routeCoords]);
  const km = session.distanceKm;
  const hasKm = km != null && km > 0;
  const aliens = session.invaderIds?.length ?? 0;

  const fmt = FORMATS[format];
  // L'aperçu est le visuel réel, simplement réduit : ce que l'utilisateur voit
  // est exactement ce qu'il partagera.
  const echelle = Math.min(APERCU_H_MAX / fmt.h, (screenW - 96) / fmt.w);
  const apercuW = Math.round(fmt.w * echelle);
  const apercuH = Math.round(fmt.h * echelle);

  // Fond Mapbox du format demandé. Un appel compté dans le plafond quotidien ;
  // sans token, plafond atteint ou hors-ligne → repli sur le fond stylisé.
  const chargerFond = useCallback(async (cle) => {
    if (fondsRef.current[cle] !== undefined) return fondsRef.current[cle];
    let map = null;
    if (shareRoute?.length >= 2 || pins.length > 0) {
      try {
        if (MAPBOX_TOKEN && (await reserveMapboxCall())) {
          const m = buildStaticMap(shareRoute, pins, MAPBOX_TOKEN, FORMATS[cle]);
          if (m) { await Image.prefetch(m.url); map = m; }
        }
      } catch { map = null; } // hors-ligne / erreur → stylisé
    }
    fondsRef.current[cle] = map;
    return map;
  }, [shareRoute, pins]);

  // Le fond est chargé à l'ouverture puis à chaque changement de format : un
  // aperçu qui n'aurait pas encore sa carte ne montrerait pas ce qui sera partagé.
  useEffect(() => {
    let annule = false;
    setBusy(true);
    chargerFond(format).then((m) => {
      if (annule) return;
      setShareMap(m);
      setBusy(false);
    });
    return () => { annule = true; };
  }, [format, chargerFond]);

  async function onShare() {
    setBusy(true);
    track('share_tap', { source: session.source ?? 'unknown', format, invaders: aliens });
    const map = await chargerFond(format);
    setShareMap(map);
    await sleep(map ? 250 : 80); // laisse l'image se poser avant la capture
    const r = await captureAndShare(storyRef, format);
    setBusy(false);
    // `map` distingue la carte Mapbox réelle du repli stylisé : si le repli
    // domine, c'est que le plafond quotidien ou le réseau posent problème.
    track('share_done', { result: r ?? 'ok', format, background: map ? 'mapbox' : 'fallback' });
    if (r === 'unavailable') Alert.alert('InvaderQuest', t('share.unavailable'));
  }

  const visuel = (
    <ShareStory
      session={session} cityName={cityName} pins={pins} map={shareMap}
      route={shareRoute} sessionPoints={sessionPoints} format={format}
    />
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.bg }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[typography.arcadeTitle, styles.title, { color: theme.accent }]}>
            {t('session.recap.title')}
          </Text>
          <Text style={[styles.city, { color: theme.textSecondary }]}>{cityName}</Text>

          {/* Tableau de score rétro */}
          <View style={[styles.board, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Stat value={hasKm ? km.toFixed(1).replace('.', ',') : '—'} label={t('session.recap.km')} theme={theme} />
            <View style={[styles.vsep, { backgroundColor: theme.border }]} />
            <Stat value={fmtDuration(session.durationSec)} label={t('session.recap.time')} theme={theme} />
            <View style={[styles.vsep, { backgroundColor: theme.border }]} />
            <Stat value={String(aliens)} label={t('session.recap.aliens')} theme={theme} />
            <View style={[styles.vsep, { backgroundColor: theme.border }]} />
            <Stat value={`+${sessionPoints}`} label={t('session.recap.points')} theme={theme} accent={theme.accentScore} />
          </View>

          {/* Trophées débloqués */}
          {newBadgeIds.length > 0 && (
            <View style={styles.badges}>
              <Text style={[styles.badgesTitle, { color: theme.textPrimary }]}>
                {t(newBadgeIds.length === 1 ? 'session.recap.newBadge_one' : 'session.recap.newBadge_other', { count: newBadgeIds.length })}
              </Text>
              <View style={styles.badgeRow}>
                {newBadgeIds.map((id) => {
                  const b = getBadge(id);
                  if (!b) return null;
                  return (
                    <View key={id} style={[styles.badgeChip, { backgroundColor: theme.accentDim, borderColor: theme.accent }]}>
                      <Ionicons name={b.iconName} size={18} color={theme.accent} />
                      <Text style={[styles.badgeChipText, { color: theme.textPrimary }]} numberOfLines={1}>
                        {t(`badges.${id}.title`)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Aperçu du visuel, à l'échelle */}
          <View style={[styles.apercuCadre, { width: apercuW, height: apercuH, borderColor: theme.border }]}>
            <View
              style={{
                width: fmt.w, height: fmt.h, transform: [{ scale: echelle }],
                marginLeft: -(fmt.w - apercuW) / 2, marginTop: -(fmt.h - apercuH) / 2,
              }}
              pointerEvents="none"
            >
              {visuel}
            </View>
            {busy && (
              <View style={styles.apercuVoile}>
                <ActivityIndicator color={theme.accent} />
              </View>
            )}
          </View>

          {/* Choix du format */}
          <View style={styles.formats}>
            {ORDRE.map((cle) => {
              const actif = cle === format;
              const f = FORMATS[cle];
              const h = 22, w = Math.round((f.w / f.h) * h);
              return (
                <TouchableOpacity
                  key={cle}
                  onPress={() => setFormat(cle)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: actif }}
                  accessibilityLabel={`${t(`session.recap.format.${cle}`)} ${RATIOS[cle]}`}
                  style={[
                    styles.formatChip,
                    { borderColor: actif ? theme.accent : theme.border, backgroundColor: actif ? theme.accentDim : 'transparent' },
                  ]}
                >
                  <View style={[styles.formatIcone, { width: w, height: h, borderColor: actif ? theme.accent : theme.textSecondary }]} />
                  <Text style={[styles.formatLabel, { color: actif ? theme.textPrimary : theme.textSecondary }]}>
                    {t(`session.recap.format.${cle}`)}
                  </Text>
                  <Text style={[styles.formatRatio, { color: theme.textSecondary }]}>{RATIOS[cle]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Actions */}
          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: theme.accent }]} onPress={onShare} disabled={busy} activeOpacity={0.85}>
            {busy
              ? <ActivityIndicator color={theme.bg} />
              : <><Ionicons name="share-social" size={18} color={theme.bg} /><Text style={[styles.shareText, { color: theme.bg }]}>{t('session.recap.share')}</Text></>}
          </TouchableOpacity>
          {/* Pendant négatif de share_tap : sans lui, un faible taux de partage
              serait indistinguable d'un récap qui ne s'affiche jamais. */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => { track('recap_closed', { source: session.source ?? 'unknown' }); onClose(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.closeText, { color: theme.textSecondary }]}>{t('session.recap.close')}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Copie hors écran, à taille réelle : c'est elle qui est capturée.
            L'aperçu est réduit par une transformation, et react-native-view-shot
            n'est pas fiable sur une vue dont un ancêtre est mis à l'échelle. */}
        <View style={[styles.offscreen, { width: fmt.w, height: fmt.h }]} pointerEvents="none">
          <ShareStory
            ref={storyRef}
            session={session} cityName={cityName} pins={pins} map={shareMap}
            route={shareRoute} sessionPoints={sessionPoints} format={format}
          />
        </View>
      </View>
    </Modal>
  );
}

function Stat({ value, label, theme, accent }) {
  return (
    <View style={styles.stat}>
      <Text style={[typography.arcadeScore, styles.statValue, { color: accent ?? theme.accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { textAlign: 'center', fontSize: 20 },
  city: { fontSize: 13, marginTop: 6, marginBottom: 22 },
  board: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 22, paddingHorizontal: 8, width: '100%',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, lineHeight: 30 },
  statLabel: { fontSize: 10, marginTop: 8, letterSpacing: 0.5 },
  vsep: { width: StyleSheet.hairlineWidth, height: 48 },
  badges: { width: '100%', marginTop: 24, alignItems: 'center' },
  badgesTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  badgeChipText: { fontSize: 12, fontWeight: '600', maxWidth: 130 },
  apercuCadre: { marginTop: 26, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  apercuVoile: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  formats: { flexDirection: 'row', gap: 10, marginTop: 16 },
  formatChip: { alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minWidth: 84 },
  formatIcone: { borderWidth: 1.5, borderRadius: 3 },
  formatLabel: { fontSize: 12, fontWeight: '700' },
  formatRatio: { fontSize: 10, letterSpacing: 0.4 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, width: '100%', marginTop: 24 },
  shareText: { fontSize: 15, fontWeight: '700' },
  closeBtn: { paddingVertical: 14, marginTop: 6 },
  closeText: { fontSize: 14 },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
