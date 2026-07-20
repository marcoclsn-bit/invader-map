import { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Defs, LinearGradient, Stop, Rect, G } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { dark } from '../../theme/tokens';

// Format fixe 9:16 (capturé puis upscalé ×3 par react-native-view-shot → ~1080×1920)
export const STORY_W = 360;
export const STORY_H = 640;

const LOGO = require('../../assets/LogoFinal.png');
const MAP_W = STORY_W - 48;
const MAP_H = 300;

// Couleur d'un pin selon la valeur en points (donne le côté « coloré » de la story).
function pinColor(points) {
  if (points >= 50) return '#FFD23F'; // or — rares / haute valeur
  if (points >= 30) return '#4CE0FF'; // cyan — valeur moyenne
  return dark.accent;                  // vert — valeur standard
}

// Carte néon : route lumineuse (halo par strokes superposés) + pins des Invaders.
function NeonMap({ coords, pins }) {
  const pts = [];
  if (Array.isArray(coords)) for (const c of coords) pts.push(c);
  const allPins = Array.isArray(pins) ? pins : [];
  // Points à cadrer : le tracé + les pins.
  const box = [...pts, ...allPins.map((p) => [p.lng, p.lat])];
  if (box.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [lng, lat] of box) {
    if (lng < minX) minX = lng; if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat; if (lat > maxY) maxY = lat;
  }
  const pad = 26;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((MAP_W - 2 * pad) / spanX, (MAP_H - 2 * pad) / spanY);
  const offX = (MAP_W - spanX * scale) / 2;
  const offY = (MAP_H - spanY * scale) / 2;
  const toX = (lng) => offX + (lng - minX) * scale;
  const toY = (lat) => MAP_H - (offY + (lat - minY) * scale); // nord en haut

  const routeStr = pts.length >= 2
    ? pts.map(([lng, lat]) => `${toX(lng).toFixed(1)},${toY(lat).toFixed(1)}`).join(' ')
    : null;

  // Grille stylisée (fausses « rues », très discrète)
  const grid = [];
  for (let i = 1; i < 7; i++) {
    const y = (MAP_H / 7) * i;
    grid.push(<Line key={`h${i}`} x1="0" y1={y} x2={MAP_W} y2={y - 14} stroke={dark.border} strokeWidth="0.5" opacity="0.5" />);
  }
  for (let i = 1; i < 8; i++) {
    const x = (MAP_W / 8) * i;
    grid.push(<Line key={`v${i}`} x1={x} y1="0" x2={x + 12} y2={MAP_H} stroke={dark.border} strokeWidth="0.5" opacity="0.5" />);
  }

  return (
    <Svg width={MAP_W} height={MAP_H}>
      <Defs>
        <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={dark.accent} stopOpacity="0.12" />
          <Stop offset="1" stopColor={dark.accent} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#glow)" />
      {grid}

      {routeStr && (
        <>
          {/* halo : stroke large translucide sous le trait vif */}
          <Polyline points={routeStr} fill="none" stroke={dark.accent} strokeOpacity="0.25"
            strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
          <Polyline points={routeStr} fill="none" stroke={dark.accent}
            strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}

      {/* Pins des Invaders attrapés (halo + point vif, couleur selon points) */}
      {allPins.map((p, i) => {
        const c = pinColor(p.points ?? 0);
        return (
          <G key={i}>
            <Circle cx={toX(p.lng)} cy={toY(p.lat)} r={6} fill={c} opacity={0.22} />
            <Circle cx={toX(p.lng)} cy={toY(p.lat)} r={3} fill={c} stroke={dark.bg} strokeWidth={0.8} />
          </G>
        );
      })}

      {/* Départ (vert) / arrivée (or) si on a un tracé */}
      {pts.length >= 2 && (
        <>
          <Circle cx={toX(pts[0][0])} cy={toY(pts[0][1])} r={5} fill={dark.accent} stroke={dark.bg} strokeWidth={1.5} />
          <Circle cx={toX(pts[pts.length - 1][0])} cy={toY(pts[pts.length - 1][1])} r={6} fill={dark.accentScore} stroke={dark.bg} strokeWidth={1.5} />
        </>
      )}
    </Svg>
  );
}

/**
 * Visuel de partage néon (capturé via react-native-view-shot).
 * @param session { distanceKm, durationSec, invaderIds, routeCoords }
 * @param cityName nom de ville
 * @param pins array de { lng, lat, points } — Invaders attrapés à placer sur la carte
 */
const ShareStory = forwardRef(function ShareStory({ session, cityName, pins }, ref) {
  const { t } = useTranslation();
  const aliens = session?.invaderIds?.length ?? 0;
  const km = session?.distanceKm;
  const hasKm = km != null && km > 0;
  const mins = Math.round((session?.durationSec ?? 0) / 60);
  const kmStr = hasKm ? km.toFixed(1).replace('.', ',') : '—';
  const timeStr = mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${mins}′`;

  const headline = hasKm
    ? t('share.textKm', { km: kmStr, count: aliens, city: cityName })
    : t('share.textNoKm', { count: aliens, city: cityName });

  const hasMap = (Array.isArray(session?.routeCoords) && session.routeCoords.length >= 2)
    || (Array.isArray(pins) && pins.length > 0);

  return (
    <View ref={ref} collapsable={false} style={styles.root}>
      <Text style={styles.wordmark}>INVADER<Text style={styles.wordmarkAccent}>QUEST</Text></Text>

      <Text style={styles.headline}>{headline}</Text>

      {/* Carte néon + badges d'angle */}
      <View style={styles.mapZone}>
        {hasMap
          ? <NeonMap coords={session.routeCoords} pins={pins} />
          : <Text style={styles.bigAlien}>👾</Text>}

        {hasKm && (
          <View style={[styles.badge, styles.badgeTL]}>
            <Text style={styles.badgeText}>🚶 {kmStr} km</Text>
          </View>
        )}
        <View style={[styles.badge, styles.badgeTR]}>
          <Text style={styles.badgeText}>👾 {aliens}</Text>
        </View>
      </View>

      {/* Stats rétro */}
      <View style={styles.stats}>
        <Stat value={kmStr} label={t('session.recap.km')} />
        <Stat value={timeStr} label={t('session.recap.time')} />
        <Stat value={String(aliens)} label={t('session.recap.aliens')} accent={dark.accentScore} />
      </View>

      {/* Pied */}
      <View style={styles.footer}>
        <Image source={LOGO} style={styles.logo} resizeMode="cover" />
        <Text style={styles.url}>{t('share.url')}</Text>
      </View>
    </View>
  );
});

function Stat({ value, label, accent }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: STORY_W, height: STORY_H, backgroundColor: dark.bg,
    paddingHorizontal: 24, paddingVertical: 30, alignItems: 'center', justifyContent: 'space-between',
  },
  wordmark: { fontFamily: 'Silkscreen_700Bold', fontSize: 18, color: dark.textPrimary, letterSpacing: 1 },
  wordmarkAccent: { color: dark.accent },
  headline: {
    fontFamily: 'Silkscreen_400Regular', fontSize: 15, lineHeight: 24, color: dark.textPrimary,
    textAlign: 'center', paddingHorizontal: 4,
  },
  mapZone: {
    width: MAP_W, height: MAP_H, borderRadius: 16, borderWidth: 1, borderColor: dark.border,
    backgroundColor: '#0D1426', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  bigAlien: { fontSize: 96 },
  badge: {
    position: 'absolute', backgroundColor: 'rgba(11,15,14,0.82)',
    borderWidth: 1, borderColor: dark.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  badgeTL: { top: 12, left: 12 },
  badgeTR: { top: 12, right: 12, borderColor: dark.accentScore },
  badgeText: { fontFamily: 'Silkscreen_700Bold', fontSize: 12, color: dark.textPrimary },
  stats: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'PressStart2P_400Regular', fontSize: 20, color: dark.accent },
  statLabel: { fontFamily: 'Silkscreen_400Regular', fontSize: 10, color: dark.textSecondary, marginTop: 8, letterSpacing: 0.5 },
  footer: { alignItems: 'center', gap: 8 },
  logo: { width: 46, height: 46, borderRadius: 11 },
  url: { fontFamily: 'Silkscreen_400Regular', fontSize: 11, color: dark.textSecondary },
});

export default ShareStory;
