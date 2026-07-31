import { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Defs, LinearGradient, Stop, Rect, G } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { haversineKm } from '../../utils/session';
import { dark } from '../../theme/tokens';

// Rayon de confidentialité (km) : on masque le tracé près du départ et de l'arrivée
// (façon Strava) pour ne pas révéler l'adresse exacte de l'utilisateur.
const PRIVACY_KM = 0.12;

// Rogne le début/la fin du tracé dans un rayon de confidentialité autour des extrémités.
export function trimRouteEnds(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return coords ?? null;
  const [fLng, fLat] = coords[0];
  const [lLng, lLat] = coords[coords.length - 1];
  let a = 0;
  while (a < coords.length - 1 && haversineKm(fLat, fLng, coords[a][1], coords[a][0]) < PRIVACY_KM) a++;
  let b = coords.length - 1;
  while (b > a && haversineKm(lLat, lLng, coords[b][1], coords[b][0]) < PRIVACY_KM) b--;
  const out = coords.slice(a, b + 1);
  return out.length >= 2 ? out : coords; // garde-fou : trajet trop court → pas de rognage
}

// Format fixe 9:16 (capturé puis upscalé ×3 par react-native-view-shot → ~1080×1920)
export const STORY_W = 360;
export const STORY_H = 640;

const ALIEN = require('../../assets/markers/alien_flashed.png'); // pins = Invaders flashés (cohérent carte)
// Plein cadre : la carte n'est plus une vignette encadrée mais le fond de
// l'image. La boîte arrondie isolait le fond de carte et soulignait son vide ;
// en fond, il donne une texture et une couleur sans réclamer d'attention.
const MAP_W = STORY_W;
const MAP_H = STORY_H;
// Le parcours se cadre dans les 62 % supérieurs, son centre ancré à 34 % de la
// hauteur : le bas appartient au score. Centrer le tracé dans l'image entière
// en enterrait la moitié sous le voile.
const ZONE_H = 0.62;
const ANCRE_Y = 0.34;
const PIN_SIZE = 20;

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
  let zoom = Math.log2(Math.min((MAP_W - 2 * pad) / (fracX * 512), (ZONE_H * MAP_H - 2 * pad) / (fracY * 512)));
  // Plafond bas quand il n'y a qu'une poignée de points très proches : sans lui,
  // une session sans marche cadrerait au ras du trottoir.
  zoom = Math.max(1, Math.min(zoom, geo.length < 4 ? 15.5 : 18));
  const cLon = (mnLon + mxLon) / 2;
  const worldSizeTmp = 512 * Math.pow(2, zoom);
  // On décale le centre de la CARTE vers le sud pour que le centre du TRACÉ
  // remonte à ANCRE_Y — écran_y = H/2 + (mercY - mercY(centre)) × worldSize.
  const mC = (_mercY(mnLat) + _mercY(mxLat)) / 2;
  const cLat = _latFromMercY(mC + (0.5 - ANCRE_Y) * MAP_H / worldSizeTmp);
  const worldSize = 512 * Math.pow(2, zoom);
  const project = (lon, lat) => ({
    x: MAP_W / 2 + (_mercX(lon) - _mercX(cLon)) * worldSize,
    y: MAP_H / 2 + (_mercY(lat) - _mercY(cLat)) * worldSize,
  });
  const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/`
    + `${cLon.toFixed(6)},${cLat.toFixed(6)},${zoom.toFixed(4)},0/${MAP_W}x${MAP_H}@2x?access_token=${token}`;
  return { url, project };
}

// Projection linéaire (repli stylisé sans carte réelle). Renvoie project(lon,lat)->{x,y}.
function linearProject(coords, pins) {
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
  return (lng, lat) => ({ x: offX + (lng - mnX) * scale, y: MAP_H - (offY + (lat - mnY) * scale) });
}

// Dessine le tracé néon (halo + trait). Les pins/repères sont des images à part.
function RouteLine({ coords, project }) {
  const pts = Array.isArray(coords) ? coords : [];
  if (pts.length < 2) return null;
  const routeStr = pts.map(([lng, lat]) => { const p = project(lng, lat); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  return (
    <>
      <Polyline points={routeStr} fill="none" stroke={dark.accent} strokeOpacity="0.28"
        strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <Polyline points={routeStr} fill="none" stroke={dark.accent}
        strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
}

// Pins = images alien flashé, posées aux coordonnées projetées (cohérent avec la carte).
function PinImages({ pins, project }) {
  return (pins ?? []).map((p, i) => {
    const xy = project(p.lng, p.lat);
    return (
      <Image key={i} source={ALIEN}
        style={{ position: 'absolute', width: PIN_SIZE, height: PIN_SIZE, left: xy.x - PIN_SIZE / 2, top: xy.y - PIN_SIZE / 2 }}
        resizeMode="contain" />
    );
  });
}

/**
 * Visuel de partage néon (capturé via react-native-view-shot).
 * @param session { distanceKm, durationSec, invaderIds, routeCoords }
 * @param cityName nom de ville
 * @param pins array de { lng, lat, points } — Invaders attrapés
 * @param map { url, project } de buildStaticMap (carte réelle) ; null → fond stylisé
 */
const ShareStory = forwardRef(function ShareStory({ session, cityName, pins, map, route, sessionPoints }, ref) {
  const { t } = useTranslation();
  const aliens = session?.invaderIds?.length ?? 0;
  const pts = sessionPoints ?? 0;
  const km = session?.distanceKm;
  const hasKm = km != null && km > 0;
  const mins = Math.round((session?.durationSec ?? 0) / 60);
  const kmStr = hasKm ? km.toFixed(1).replace('.', ',') : '—';
  const timeStr = mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${mins}′`;


  // Tracé déjà rogné (confidentialité) fourni par l'appelant ; repli sur le brut.
  const routeCoords = Array.isArray(route) ? route : session?.routeCoords;
  const hasGeo = (Array.isArray(routeCoords) && routeCoords.length >= 2)
    || (Array.isArray(pins) && pins.length > 0);

  // Projection : carte réelle (mercator) ou repli linéaire — partagée par l'overlay et les repères.
  const project = hasGeo ? (map?.project ?? linearProject(routeCoords, pins)) : null;

  // Ligne de contexte : n'énonce QUE ce qui existe. « 0,0 km » est l'inverse
  // d'une vantardise, et « 0′ » ne vaut pas mieux — c'étaient pourtant les deux
  // premières choses qu'on remarquait après une sortie courte.
  const contexte = [cityName, hasKm ? `${kmStr} KM` : null, mins > 0 ? timeStr.toUpperCase() : null]
    .filter(Boolean).join('  ·  ');

  return (
    <View ref={ref} collapsable={false} style={styles.root}>
      {/* ── Fond : carte réelle plein cadre, ou repli stylisé ── */}
      {map
        ? <Image source={{ uri: map.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0D1426' }]} />}

      {hasGeo && project && (
        <Svg width={MAP_W} height={MAP_H} style={StyleSheet.absoluteFill}>
          {!map && <StylizedGrid />}
          <RouteLine coords={routeCoords} project={project} />
        </Svg>
      )}

      {hasGeo && project && <PinImages pins={pins} project={project} />}

      {/* ── Voile : assombrit le sommet pour le logotype et le pied pour le
             score, en laissant le parcours respirer au milieu. Dégradé SVG et
             non expo-linear-gradient, qui embarquerait du code natif. ── */}
      <Svg width={MAP_W} height={MAP_H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="voile" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"    stopColor={dark.bg} stopOpacity="0.88" />
            <Stop offset="0.16" stopColor={dark.bg} stopOpacity="0.06" />
            <Stop offset="0.55" stopColor={dark.bg} stopOpacity="0.06" />
            <Stop offset="0.74" stopColor={dark.bg} stopOpacity="0.94" />
            <Stop offset="1"    stopColor={dark.bg} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#voile)" />
      </Svg>

      <Text style={styles.wordmark}>INVADER<Text style={styles.wordmarkAccent}>QUEST</Text></Text>

      {/* ── Le score domine : chaque fait n'apparaît qu'UNE fois ── */}
      <View style={styles.bloc}>
        <Text style={styles.chiffre}>{aliens}</Text>
        <Text style={styles.legende}>{t('share.flashed')}</Text>
        <Text style={styles.contexte}>{contexte}</Text>
        <Text style={styles.points}>+{pts} {t('session.recap.points')}</Text>
      </View>

      <Text style={styles.url}>{t('share.url')}</Text>
      <Text style={styles.attrib}>© Mapbox © OpenStreetMap</Text>
    </View>
  );
});

// Grille façon « rues » du repli sans réseau (le fond Mapbox la remplace).
function StylizedGrid() {
  const g = [];
  for (let i = 1; i < 12; i++) { const y = (MAP_H / 12) * i; g.push(<Line key={`h${i}`} x1="0" y1={y} x2={MAP_W} y2={y - 18} stroke={dark.border} strokeWidth="0.5" opacity="0.5" />); }
  for (let i = 1; i < 8; i++)  { const x = (MAP_W / 8) * i;  g.push(<Line key={`v${i}`} x1={x} y1="0" x2={x + 16} y2={MAP_H} stroke={dark.border} strokeWidth="0.5" opacity="0.5" />); }
  return <G>{g}</G>;
}

// Roboto Mono partout plutôt que Silkscreen : à 70 points, un pixel-art devient
// un empilement de blocs qu'on déchiffre au lieu de le lire. La monospace garde
// le caractère technique du sujet sans ce coût.
const MONO = 'RobotoMono_700Bold';
const MONO_R = 'RobotoMono_400Regular';

const styles = StyleSheet.create({
  root: { width: STORY_W, height: STORY_H, backgroundColor: dark.bg, overflow: 'hidden' },

  wordmark: {
    position: 'absolute', top: 32, left: 0, right: 0, textAlign: 'center',
    fontFamily: MONO, fontSize: 17, color: dark.textPrimary, letterSpacing: 2.5,
  },
  wordmarkAccent: { color: dark.accent },

  // Bloc du score, ancré en bas : c'est lui qu'on doit lire en vignette.
  bloc: { position: 'absolute', left: 0, right: 0, bottom: 74, alignItems: 'center' },
  chiffre: {
    fontFamily: MONO, fontSize: 104, lineHeight: 112, color: dark.accent,
    textShadowColor: dark.accentGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18,
  },
  legende: { fontFamily: MONO, fontSize: 15, color: dark.textPrimary, letterSpacing: 3.5, marginTop: 4 },
  contexte: { fontFamily: MONO_R, fontSize: 13, color: dark.textSecondary, letterSpacing: 0.6, marginTop: 18 },
  points: { fontFamily: MONO, fontSize: 14, color: dark.accentScore, letterSpacing: 0.6, marginTop: 8 },

  url: {
    position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center',
    fontFamily: MONO_R, fontSize: 11, color: dark.textSecondary, letterSpacing: 1,
  },
  // Attribution obligatoire du fond de carte, discrète mais présente.
  attrib: { position: 'absolute', bottom: 8, left: 10, fontSize: 7, color: '#697871' },
});

export default ShareStory;
