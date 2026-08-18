import { useMemo, useRef, useState } from 'react';
import { View, PanResponder } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle, Text as SvgText } from 'react-native-svg';

/**
 * Courbe cumulative avec dégradé sous la courbe.
 * @param {{key:string,cum:number}[]} points
 * @param {number} width / height
 * @param {string} accent / textSec / border
 * @param {'week'|'month'} unit
 * @param {string} locale  langue de l'app, pour nommer les mois
 * @param {(p:{key:string,cum:number,count?:number}) => string} legende
 *        texte de l'infobulle au toucher ; sans elle, le graphique reste inerte
 */
export default function AreaChart({
  points = [], width = 320, height = 170, accent = '#3DF96B', textSec = '#8FA39A', border = '#283430', unit = 'week',
  locale = 'fr', legende = null,
}) {
  const pad = { t: 14, r: 12, b: 22, l: 30 };
  const cw = width - pad.l - pad.r;
  const ch = height - pad.t - pad.b;
  const n = points.length;
  if (n < 2) return null;

  const maxVal = Math.max(1, ...points.map((p) => p.cum));
  const toX = (i) => pad.l + (i / (n - 1)) * cw;
  const toY = (v) => pad.t + ch - (v / maxVal) * ch;

  const linePts = points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.cum).toFixed(1)}`);
  const linePath = `M${linePts.join(' L')}`;
  const areaPath = `${linePath} L${toX(n - 1).toFixed(1)},${(pad.t + ch).toFixed(1)} L${toX(0).toFixed(1)},${(pad.t + ch).toFixed(1)} Z`;

  // L'axe affichait le SEUL numéro du mois : « 08 … 02 … 08 ». Impossible de
  // savoir s'il s'agissait de jours, de mois ou d'années — et les deux « 08 »,
  // séparés d'un an, étaient rigoureusement identiques. Un historique importé de
  // FlashInvaders s'étale sur plusieurs années : c'est le cas normal, pas un cas
  // limite. Le mois est donc nommé, et l'année suit.
  function fmt(key) {
    if (unit === 'month') {
      const [a, m] = key.split('-');
      const d = new Date(Number(a), Number(m) - 1, 1);
      try {
        return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
      } catch {
        return `${m}/${a.slice(2)}`;   // repli si la locale est inconnue
      }
    }
    const d = new Date(key);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const midIdx = Math.floor((n - 1) / 2);
  const labelIdx = [0, midIdx, n - 1].filter((v, i, a) => a.indexOf(v) === i);

  // ── Lecture au doigt ──────────────────────────────────────────────────────
  //
  // Trois libellés sur l'axe suffisent à donner la FORME, pas à lire une valeur.
  // Poser le doigt sur la courbe donne le mois exact, le total à cette date et
  // ce qui a été flashé pendant la période — ce que douze libellés serrés
  // n'auraient jamais réussi à montrer sur une largeur de téléphone.
  //
  // La sélection PERSISTE après le relâchement : on touche pour lire, et lever
  // le doigt effacerait justement ce qu'on venait chercher.
  const [idx, setIdx] = useState(null);
  const zoneX = useRef({ gauche: pad.l, largeur: Math.max(1, cw) });
  zoneX.current = { gauche: pad.l, largeur: Math.max(1, cw) };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !!legende,
    onMoveShouldSetPanResponder: () => !!legende,
    // Le graphique vit dans une ScrollView : sans ce garde, un défilement
    // vertical amorcé sur la courbe serait capturé et la page se figerait.
    onMoveShouldSetPanResponderCapture: (_e, g) => !!legende && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: (e) => majIdx(e.nativeEvent.locationX),
    onPanResponderMove: (e) => majIdx(e.nativeEvent.locationX),
    onPanResponderTerminationRequest: () => false,
  }), [legende]);

  function majIdx(x) {
    const { gauche, largeur } = zoneX.current;
    const rel = (x - gauche) / largeur;
    const i = Math.round(rel * (n - 1));
    setIdx(Math.max(0, Math.min(n - 1, i)));
  }

  const actif = idx != null && points[idx] ? points[idx] : null;
  const valeur = actif && legende ? legende(actif) : null;
  // Deux ancrages plutôt qu'une bulle unique : la DATE se lit sous le trait de
  // visée, à la place exacte du libellé d'axe qu'elle remplace, et la VALEUR
  // flotte au-dessus du point. Une bulle unique aurait dû tenir « août 26 · 449
  // au total · +81 » sur une seule ligne, illisible à cette largeur.
  const bornerX = (x, marge) => Math.max(pad.l + marge, Math.min(width - pad.r - marge, x));
  const dateX = actif ? bornerX(toX(idx), 26) : 0;
  const valeurX = actif ? bornerX(toX(idx), 52) : 0;
  // Sous le plafond du cadre : au maximum de la courbe, l'étiquette sortirait
  // par le haut. Elle bascule alors sous le point.
  const hautY = actif ? toY(actif.cum) - 10 : 0;
  const valeurY = hautY < pad.t + 8 ? toY(actif.cum) + 16 : hautY;

  return (
    <View {...pan.panHandlers}>
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accent} stopOpacity="0.35" />
          <Stop offset="1" stopColor={accent} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Lignes de repère + libellé max */}
      <Line x1={pad.l} y1={pad.t} x2={width - pad.r} y2={pad.t} stroke={border} strokeWidth={0.5} />
      <Line x1={pad.l} y1={pad.t + ch} x2={width - pad.r} y2={pad.t + ch} stroke={border} strokeWidth={0.5} />
      <SvgText x={pad.l - 6} y={pad.t + 4} fontSize={9} fill={textSec} textAnchor="end">{maxVal}</SvgText>
      <SvgText x={pad.l - 6} y={pad.t + ch + 3} fontSize={9} fill={textSec} textAnchor="end">0</SvgText>

      {/* Aire + courbe */}
      <Path d={areaPath} fill="url(#areaFill)" />
      <Path d={linePath} fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* Libellés X — masqués sous l'infobulle, qui dit la même chose en mieux */}
      {!actif && labelIdx.map((i) => (
        <SvgText key={i} x={toX(i).toFixed(1)} y={height - 6} fontSize={9} fill={textSec}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
          {fmt(points[i].key)}
        </SvgText>
      ))}

      {/* Point lu au doigt : trait de visée, pastille, valeur */}
      {actif && (
        <>
          <Line x1={toX(idx)} y1={pad.t} x2={toX(idx)} y2={pad.t + ch}
            stroke={textSec} strokeWidth={1} strokeDasharray="3 3" />
          <Circle cx={toX(idx)} cy={toY(actif.cum)} r={4.5} fill={accent} />
          <SvgText x={valeurX} y={valeurY} fontSize={10} fill={accent}
            textAnchor="middle" fontWeight="bold">
            {valeur}
          </SvgText>
          <SvgText x={dateX} y={height - 6} fontSize={9.5} fill={accent} textAnchor="middle">
            {fmt(actif.key)}
          </SvgText>
        </>
      )}
    </Svg>
    </View>
  );
}
