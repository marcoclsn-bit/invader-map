import { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { dark } from '../../theme/tokens';

// Format fixe 9:16 (capturé puis upscalé par react-native-view-shot)
export const STORY_W = 360;
export const STORY_H = 640;

const LOGO = require('../../assets/LogoFinal.png');
const MAP_W = STORY_W - 56;
const MAP_H = 260;

function RouteMap({ coords }) {
  if (!coords || coords.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minX) minX = lng; if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat; if (lat > maxY) maxY = lat;
  }
  const pad = 18;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((MAP_W - 2 * pad) / spanX, (MAP_H - 2 * pad) / spanY);
  const offX = (MAP_W - spanX * scale) / 2;
  const offY = (MAP_H - spanY * scale) / 2;
  const toX = (lng) => offX + (lng - minX) * scale;
  const toY = (lat) => MAP_H - (offY + (lat - minY) * scale); // flip Y (nord en haut)

  const pts = coords.map(([lng, lat]) => `${toX(lng).toFixed(1)},${toY(lat).toFixed(1)}`).join(' ');
  const [sLng, sLat] = coords[0];
  const [eLng, eLat] = coords[coords.length - 1];

  return (
    <Svg width={MAP_W} height={MAP_H}>
      <Defs>
        <LinearGradient id="storyGlow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={dark.accent} stopOpacity="0.10" />
          <Stop offset="1" stopColor={dark.accent} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={MAP_W} height={MAP_H} rx="14" fill="url(#storyGlow)" />
      <Polyline points={pts} fill="none" stroke={dark.accent} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={toX(sLng)} cy={toY(sLat)} r={6} fill={dark.accent} />
      <Circle cx={toX(eLng)} cy={toY(eLat)} r={7} fill={dark.accentScore} stroke={dark.bg} strokeWidth={2} />
    </Svg>
  );
}

/**
 * Visuel de partage. Passe une ref pour la capture (react-native-view-shot).
 * @param session { distanceKm, durationSec, invaderIds, routeCoords }
 * @param cityName nom de ville à afficher
 */
const ShareStory = forwardRef(function ShareStory({ session, cityName }, ref) {
  const { t } = useTranslation();
  const aliens = session?.invaderIds?.length ?? 0;
  const km = session?.distanceKm;
  const hasKm = km != null && km > 0;
  const mins = Math.round((session?.durationSec ?? 0) / 60);

  const headline = hasKm
    ? t('share.textKm', { km: km.toFixed(1).replace('.', ','), count: aliens, city: cityName })
    : t('share.textNoKm', { count: aliens, city: cityName });

  return (
    <View ref={ref} collapsable={false} style={styles.root}>
      {/* En-tête wordmark */}
      <Text style={styles.wordmark}>INVADERQUEST</Text>

      {/* Carte stylisée ou bloc épuré */}
      <View style={styles.mapZone}>
        {session?.routeCoords
          ? <RouteMap coords={session.routeCoords} />
          : <Text style={styles.bigAlien}>👾</Text>}
      </View>

      {/* Accroche */}
      <Text style={styles.headline}>{headline}</Text>

      {/* Stats rétro */}
      <View style={styles.stats}>
        <Stat value={hasKm ? km.toFixed(1).replace('.', ',') : '—'} label={t('session.recap.km')} />
        <Stat value={mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${mins}′`} label={t('session.recap.time')} />
        <Stat value={String(aliens)} label={t('session.recap.aliens')} />
      </View>

      {/* Pied : logo + url */}
      <View style={styles.footer}>
        <Image source={LOGO} style={styles.logo} resizeMode="cover" />
        <Text style={styles.url}>{t('share.url')}</Text>
      </View>
    </View>
  );
});

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: STORY_W, height: STORY_H, backgroundColor: dark.bg,
    paddingHorizontal: 28, paddingVertical: 36, alignItems: 'center', justifyContent: 'space-between',
  },
  wordmark: { fontFamily: 'Silkscreen_700Bold', fontSize: 18, color: dark.accent, letterSpacing: 1 },
  mapZone: {
    width: MAP_W, height: MAP_H, borderRadius: 14, borderWidth: 1, borderColor: dark.border,
    backgroundColor: dark.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  bigAlien: { fontSize: 96 },
  headline: {
    fontFamily: 'Silkscreen_400Regular', fontSize: 15, lineHeight: 24, color: dark.textPrimary,
    textAlign: 'center', paddingHorizontal: 4,
  },
  stats: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'PressStart2P_400Regular', fontSize: 20, color: dark.accent },
  statLabel: { fontFamily: 'Silkscreen_400Regular', fontSize: 10, color: dark.textSecondary, marginTop: 8, letterSpacing: 0.5 },
  footer: { alignItems: 'center', gap: 8 },
  logo: { width: 48, height: 48, borderRadius: 11 },
  url: { fontFamily: 'Silkscreen_400Regular', fontSize: 11, color: dark.textSecondary },
});

export default ShareStory;
