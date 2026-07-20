import { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme/tokens';
import { CITIES } from '../../cities/registry';
import { getBadge } from '../../data/badges';
import { useGamification } from '../../context/GamificationContext';
import { useAppContext } from '../../context/AppContext';
import ShareStory, { STORY_W, STORY_H, buildStaticMap, trimRouteEnds } from '../share/ShareStory';
import { captureAndShare } from '../../services/shareStory';
import { reserveMapboxCall } from '../../services/routing';
import { MAPBOX_TOKEN } from '../../config/mapbox';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtDuration(sec) {
  const m = Math.round((sec ?? 0) / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return `${m}′`;
}

export default function SessionRecap() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { pendingRecap, clearRecap } = useGamification();
  const { invaders } = useAppContext();
  const storyRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [shareMap, setShareMap] = useState(null); // carte réelle Mapbox pour la capture (null = stylisé)

  const session = pendingRecap?.session ?? null;
  const newBadgeIds = pendingRecap?.newBadgeIds ?? [];
  if (!session) return null;

  const cityName = CITIES[session.city]?.name ?? session.city ?? '—';

  // Pins des Invaders attrapés : coordonnées + points, retrouvés dans les données
  // de la ville courante (la session se déroule dans cette ville).
  const invById = new Map((invaders ?? []).map((i) => [i.id, i]));
  const pins = (session.invaderIds ?? [])
    .map((id) => invById.get(id))
    .filter(Boolean)
    .map((i) => ({ lng: i.lng, lat: i.lat, points: i.points ?? 0 }));

  // Tracé rogné (confidentialité : masque le départ/arrivée près du domicile).
  const shareRoute = trimRouteEnds(session.routeCoords);
  const km = session.distanceKm;
  const hasKm = km != null && km > 0;
  const aliens = session.invaderIds?.length ?? 0;

  async function onShare() {
    setBusy(true);
    // Carte réelle Mapbox en fond (1 appel, compté dans le plafond quotidien).
    // Si pas de token / plafond atteint / hors-ligne → repli sur le fond stylisé.
    let map = null;
    if (shareRoute?.length >= 2 || pins.length > 0) {
      try {
        if (MAPBOX_TOKEN && (await reserveMapboxCall())) {
          const m = buildStaticMap(shareRoute, pins, MAPBOX_TOKEN);
          if (m) { await Image.prefetch(m.url); map = m; }
        }
      } catch { map = null; } // hors-ligne / erreur → stylisé
    }
    setShareMap(map);
    await sleep(map ? 450 : 120); // laisse le rendu hors-écran se stabiliser (image chargée)
    const r = await captureAndShare(storyRef);
    setShareMap(null);
    setBusy(false);
    if (r === 'unavailable') Alert.alert('InvaderQuest', t('share.unavailable'));
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={clearRecap}>
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
            <Stat value={String(aliens)} label={t('session.recap.aliens')} theme={theme} accent={theme.accentScore} />
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

          {/* Actions */}
          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: theme.accent }]} onPress={onShare} disabled={busy} activeOpacity={0.85}>
            {busy
              ? <ActivityIndicator color={theme.bg} />
              : <><Ionicons name="share-social" size={18} color={theme.bg} /><Text style={[styles.shareText, { color: theme.bg }]}>{t('session.recap.share')}</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={clearRecap} activeOpacity={0.7}>
            <Text style={[styles.closeText, { color: theme.textSecondary }]}>{t('session.recap.close')}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Visuel de partage rendu hors écran pour la capture */}
        <View style={styles.offscreen} pointerEvents="none">
          <ShareStory ref={storyRef} session={session} cityName={cityName} pins={pins} map={shareMap} route={shareRoute} />
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
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, width: '100%', marginTop: 32 },
  shareText: { fontSize: 15, fontWeight: '700' },
  closeBtn: { paddingVertical: 14, marginTop: 6 },
  closeText: { fontSize: 14 },
  offscreen: { position: 'absolute', left: -10000, top: 0, width: STORY_W, height: STORY_H },
});
