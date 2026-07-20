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

// ─── Projection Web Mercator (pour aligner le tracé sur la carte Mapbox statique) ──
const _mercX = (lon) => (lon + 180) / 360;
const _mercY = (lat) => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const _latFromMercY = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;

/**
 * Construit la carte statique Mapbox (fond réel) + la projection pour l'overlay.
 * Renvoie { url, project(lon,lat)->{x,y} } ou null si géométrie/token manquants.
 */
export function buildStaticMap(coords, pins, token) {
  if (!token) return null;
  const geo = [];
  if (Array.isArray(coords)) for (const c of coords) geo.push(c);
  if (Array.isArray(pins)) for (const p of pins) geo.push([p.lng, p.lat]);
  if (geo.length === 0) return null;

  let mnLon = Infinity, mxLon = -Infinity, mnLat = Infinity, mxLat = -Infinity;
  for (const [lon, lat] of geo) {
    if (lon < mnLon) mnLon = lon; if (lon > mxLon) mxLon = lon;
    if (lat < mnLat) mnLat = lat; if (lat > mxLat) mxLat = lat;
  }
  const pad = 30;
  const fracX = Math.max(_mercX(mxLon) - _mercX(mnLon), 1e-9);
  const fracY = Math.max(_mercY(mnLat) - _mercY(mxLat), 1e-9);
  let zoom = Math.log2(Math.min((MAP_W - 2 * pad) / (fracX * 512), (MAP_H - 2 * pad) / (fracY * 512)));
  zoom = Math.max(1, Math.min(zoom, 18));
  const cLon = (mnLon + mxLon) / 2;
  const cLat = _latFromMercY((_mercY(mnLat) + _mercY(mxLat)) / 2);
  const worldSize = 512 * Math.pow(2, zoom);
  const project = (lon, lat) => ({
    x: MAP_W / 2 + (_mercX(lon) - _mercX(cLon)) * worldSize,
    y: MAP_H / 2 + (_mercY(lat) - _mercY(cLat)) * worldSize,
  });
  const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/`
    + `${cLon.toFixed(6)},${cLat.toFixed(6)},${zoom.toFixed(4)},0/${MAP_W}x${MAP_H}@2x?access_token=${token}`;
  return { url, project };
}

// Dessine le tracé néon + les pins (utilisé sur carte réelle OU fond stylisé).
function RouteAndPins({ coords, pins, project }) {
  const pts = Array.isArray(coords) ? coords : [];
  const routeStr = pts.length >= 2
    ? pts.map(([lng, lat]) => { const p = project(lng, lat); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ')
    : null;
  return (
    <>
      {routeStr && (
        <>
          <Polyline points={routeStr} fill="none" stroke={dark.accent} strokeOpacity="0.28"
            strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
          <Polyline points={routeStr} fill="none" stroke={dark.accent}
            strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
      {(pins ?? []).map((p, i) => {
        const c = pinColor(p.points ?? 0);
        const xy = project(p.lng, p.lat);
        return (
          <G key={i}>
            <Circle cx={xy.x} cy={xy.y} r={6} fill={c} opacity={0.22} />
            <Circle cx={xy.x} cy={xy.y} r={3} fill={c} stroke={dark.bg} strokeWidth={0.8} />
          </G>
        );
      })}
      {pts.length >= 2 && (() => {
        const s = project(pts[0][0], pts[0][1]);
        const e = project(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        return (
          <>
            <Circle cx={s.x} cy={s.y} r={5} fill={dark.accent} stroke={dark.bg} strokeWidth={1.5} />
            <Circle cx={e.x} cy={e.y} r={6} fill={dark.accentScore} stroke={dark.bg} strokeWidth={1.5} />
          </>
        );
      })()}
    </>
  );
}

// Fond stylisé (repli sans réseau) : projection linéaire + grille façon « rues ».
function StylizedMap({ coords, pins }) {
  const geo = [];
  if (Array.isArray(coords)) for (const c of coords) geo.push(c);
  if (Array.isArray(pins)) for (const p of pins) geo.push([p.lng, p.lat]);
  if (geo.length === 0) return null;
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  for (const [lng, lat] of geo) { if (lng < mnX) mnX = lng; if (lng > mxX) mxX = lng; if (lat < mnY) mnY = lat; if (lat > mxY) mxY = lat; }
  const pad = 26;
  const spanX = Math.max(mxX - mnX, 1e-6), spanY = Math.max(mxY - mnY, 1e-6);
  const scale = Math.min((MAP_W - 2 * pad) / spanX, (MAP_H - 2 * pad) / spanY);
  const offX = (MAP_W - spanX * scale) / 2, offY = (MAP_H - spanY * scale) / 2;
  const project = (lng, lat) => ({ x: offX + (lng - mnX) * scale, y: MAP_H - (offY + (lat - mnY) * scale) });
  const grid = [];
  for (let i = 1; i < 7; i++) { const y = (MAP_H / 7) * i; grid.push(<Line key={`h${i}`} x1="0" y1={y} x2={MAP_W} y2={y - 14} stroke={dark.border} strokeWidth="0.5" opacity="0.5" />); }
  for (let i = 1; i < 8; i++) { const x = (MAP_W / 8) * i; grid.push(<Line key={`v${i}`} x1={x} y1="0" x2={x + 12} y2={MAP_H} stroke={dark.border} strokeWidth="0.5" opacity="0.5" />); }
  return (
    <Svg width={MAP_W} height={MAP_H}>
      <Defs><LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={dark.accent} stopOpacity="0.12" /><Stop offset="1" stopColor={dark.accent} stopOpacity="0" /></LinearGradient></Defs>
      <Rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#glow)" />
      {grid}
      <RouteAndPins coords={coords} pins={pins} project={project} />
    </Svg>
  );
}

/**
 * Visuel de partage néon (capturé via react-native-view-shot).
 * @param session { distanceKm, durationSec, invaderIds, routeCoords }
 * @param cityName nom de ville
 * @param pins array de { lng, lat, points } — Invaders attrapés
 * @param map { url, project } de buildStaticMap (carte réelle) ; null → fond stylisé
 */
const ShareStory = forwardRef(function ShareStory({ session, cityName, pins, map }, ref) {
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

  const hasGeo = (Array.isArray(session?.routeCoords) && session.routeCoords.length >= 2)
    || (Array.isArray(pins) && pins.length > 0);

  return (
    <View ref={ref} collapsable={false} style={styles.root}>
      <Text style={styles.wordmark}>INVADER<Text style={styles.wordmarkAccent}>QUEST</Text></Text>
      <Text style={styles.headline}>{headline}</Text>

      <View style={styles.mapZone}>
        {!hasGeo && <Text style={styles.bigAlien}>👾</Text>}
        {hasGeo && map && (
          <>
            <Image source={{ uri: map.url }} style={styles.mapImg} resizeMode="cover" />
            <Svg width={MAP_W} height={MAP_H} style={StyleSheet.absoluteFill}>
              <RouteAndPins coords={session.routeCoords} pins={pins} project={map.project} />
            </Svg>
          </>
        )}
        {hasGeo && !map && <StylizedMap coords={session.routeCoords} pins={pins} />}

        {hasKm && <View style={[styles.badge, styles.badgeTL]}><Text style={styles.badgeText}>🚶 {kmStr} km</Text></View>}
        <View style={[styles.badge, styles.badgeTR]}><Text style={styles.badgeText}>👾 {aliens}</Text></View>
      </View>

      <View style={styles.stats}>
        <Stat value={kmStr} label={t('session.recap.km')} />
        <Stat value={timeStr} label={t('session.recap.time')} />
        <Stat value={String(aliens)} label={t('session.recap.aliens')} accent={dark.accentScore} />
      </View>

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
  mapImg: { position: 'absolute', width: MAP_W, height: MAP_H },
  bigAlien: { fontSize: 96 },
  badge: {
    position: 'absolute', backgroundColor: 'rgba(11,15,14,0.82)',
    borderWidth: 1, borderColor: dark.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  badgeTL: { top: 12, left: 12 },
  badgeTR: { top: 12, right: 12, borderColor: dark.accentScore },
  // Police système (pas pixel) : « 4,2 km » doit rester lisible dans la carte.
  badgeText: { fontSize: 14, fontWeight: '800', color: dark.textPrimary },
  stats: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'PressStart2P_400Regular', fontSize: 20, color: dark.accent },
  statLabel: { fontFamily: 'Silkscreen_400Regular', fontSize: 10, color: dark.textSecondary, marginTop: 8, letterSpacing: 0.5 },
  footer: { alignItems: 'center', gap: 8 },
  logo: { width: 46, height: 46, borderRadius: 11 },
  url: { fontFamily: 'Silkscreen_400Regular', fontSize: 11, color: dark.textSecondary },
});

export default ShareStory;
