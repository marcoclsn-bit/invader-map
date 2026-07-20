import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';

/**
 * Histogramme simple — flashs par jour sur la semaine glissante.
 * @param {{label:string, value:number}[]} bars   (7 entrées, du plus ancien à aujourd'hui)
 * @param {number} width / height
 * @param {string} accent / textSec / border
 */
export default function BarChart({
  bars = [], width = 320, height = 170, accent = '#3DF96B', textSec = '#8FA39A', border = '#283430',
}) {
  const pad = { t: 18, r: 8, b: 24, l: 8 };
  const cw = width - pad.l - pad.r;
  const ch = height - pad.t - pad.b;
  const n = bars.length;
  if (n === 0) return null;

  const maxVal = Math.max(1, ...bars.map((b) => b.value));
  const slot = cw / n;
  const barW = Math.min(28, slot * 0.55);

  return (
    <Svg width={width} height={height}>
      {/* ligne de base */}
      <Line x1={pad.l} y1={pad.t + ch} x2={pad.l + cw} y2={pad.t + ch} stroke={border} strokeWidth={1} />
      {bars.map((b, i) => {
        const h = (b.value / maxVal) * (ch - 4);
        const x = pad.l + i * slot + (slot - barW) / 2;
        const y = pad.t + ch - h;
        return (
          <Rect
            key={`b${i}`}
            x={x} y={y} width={barW} height={Math.max(h, b.value > 0 ? 3 : 0)}
            rx={4}
            fill={accent}
            opacity={b.value > 0 ? 1 : 0}
          />
        );
      })}
      {/* valeur au-dessus de chaque barre (masquée si 0) */}
      {bars.map((b, i) => b.value > 0 && (
        <SvgText
          key={`v${i}`}
          x={pad.l + i * slot + slot / 2}
          y={pad.t + ch - (b.value / maxVal) * (ch - 4) - 6}
          fontSize={11} fontWeight="700" fill={accent} textAnchor="middle"
        >
          {b.value}
        </SvgText>
      ))}
      {/* étiquette du jour */}
      {bars.map((b, i) => (
        <SvgText
          key={`l${i}`}
          x={pad.l + i * slot + slot / 2}
          y={pad.t + ch + 16}
          fontSize={10} fill={textSec} textAnchor="middle"
        >
          {b.label}
        </SvgText>
      ))}
    </Svg>
  );
}
