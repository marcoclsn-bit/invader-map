import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText } from 'react-native-svg';

/**
 * Courbe cumulative avec dégradé sous la courbe.
 * @param {{key:string,cum:number}[]} points
 * @param {number} width / height
 * @param {string} accent / textSec / border
 * @param {'week'|'month'} unit
 */
export default function AreaChart({
  points = [], width = 320, height = 170, accent = '#3DF96B', textSec = '#8FA39A', border = '#283430', unit = 'week',
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

  function fmt(key) {
    if (unit === 'month') {
      const [, m] = key.split('-');
      return `${m}`;
    }
    const d = new Date(key);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const midIdx = Math.floor((n - 1) / 2);
  const labelIdx = [0, midIdx, n - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
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

      {/* Libellés X */}
      {labelIdx.map((i) => (
        <SvgText key={i} x={toX(i).toFixed(1)} y={height - 6} fontSize={9} fill={textSec}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
          {fmt(points[i].key)}
        </SvgText>
      ))}
    </Svg>
  );
}
