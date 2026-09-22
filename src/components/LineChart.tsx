/**
 * Minimal SVG line chart for engine output.
 *
 * Deliberately not a charting library: these plots show measured engine values
 * and must state their axes and units, because an unlabelled plot is another
 * undocumented number (§236). Colour is carried by the design tokens so light,
 * dark and high-contrast modes all work.
 */


export interface Series {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  dashed?: boolean;
}

export function LineChart({
  series,
  xLabel,
  yLabel,
  height = 240,
  yMin,
  yMax,
  logY = false,
  note,
}: {
  series: Series[];
  xLabel: string;
  yLabel: string;
  height?: number;
  yMin?: number;
  yMax?: number;
  logY?: boolean;
  note?: string;
}) {
  const width = 720;
  const pad = { l: 76, r: 16, t: 14, b: 42 };

  /**
   * Axis ticks need a compact label. On a log axis the values span many orders
   * of magnitude, so a fixed number of decimals produces labels that overflow
   * the gutter and collide with the axis title.
   */
  const tickLabel = (value: number): string => {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs === 0) return '0';
    if (abs < 0.01 || abs >= 10000) return value.toExponential(1).replace('e+', 'e');
    return Number(value.toPrecision(3)).toString();
  };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.y));
  if (all.length === 0) {
    return <p className="small faint">No data to plot.</p>;
  }

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);

  const transform = (v: number) => (logY ? Math.log10(Math.max(1e-9, v)) : v);
  const rawMin = yMin ?? Math.min(...ys);
  const rawMax = yMax ?? Math.max(...ys);
  const y0 = transform(rawMin);
  const y1raw = transform(rawMax);
  const y1 = y1raw === y0 ? y0 + 1 : y1raw;

  const toX = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * innerW;
  const toY = (y: number) => pad.t + innerH - ((transform(y) - y0) / (y1 - y0)) * innerH;

  const ticks = 5;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const t = y0 + ((y1 - y0) * i) / ticks;
    return logY ? Math.pow(10, t) : t;
  });
  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label={`${yLabel} against ${xLabel}`}
      >
        {yTicks.map((value, i) => (
          <g key={i}>
            <line
              x1={pad.l}
              y1={toY(value)}
              x2={width - pad.r}
              y2={toY(value)}
              stroke="var(--c-border)"
              strokeWidth={0.7}
            />
            <text
              x={pad.l - 8}
              y={toY(value) + 4}
              fontSize={10}
              textAnchor="end"
              fill="var(--c-text-faint)"
            >
              {tickLabel(value)}
            </text>
          </g>
        ))}

        {xTicks.map((value, i) => (
          <text
            key={i}
            x={toX(value)}
            y={height - pad.b + 16}
            fontSize={10}
            textAnchor="middle"
            fill="var(--c-text-faint)"
          >
            {tickLabel(value)}
          </text>
        ))}

        {series.map((s) => {
          const path = s.points
            .filter((p) => Number.isFinite(p.y))
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={s.label}
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth={1.8}
              strokeDasharray={s.dashed ? '5 4' : undefined}
            />
          );
        })}

        <text
          x={pad.l + innerW / 2}
          y={height - 6}
          fontSize={11}
          textAnchor="middle"
          fill="var(--c-text-muted)"
        >
          {xLabel}
        </text>
        <text
          x={14}
          y={pad.t + innerH / 2}
          fontSize={11}
          textAnchor="middle"
          fill="var(--c-text-muted)"
          transform={`rotate(-90 14 ${pad.t + innerH / 2})`}
        >
          {yLabel}
          {logY ? ' (log)' : ''}
        </text>
      </svg>

      <figcaption className="row xs" style={{ marginTop: 'var(--sp-2)' }}>
        {series.map((s) => (
          <span key={s.label} className="row" style={{ gap: 5 }}>
            <span
              style={{
                width: 14,
                height: 2,
                background: s.color,
                display: 'inline-block',
                opacity: s.dashed ? 0.7 : 1,
              }}
            />
            <span className="muted">{s.label}</span>
          </span>
        ))}
        {note ? <span className="faint">{note}</span> : null}
      </figcaption>
    </figure>
  );
}

/** Scatter plot, used for magnetometer clouds and residual patterns. */
export function ScatterPlot({
  groups,
  xLabel,
  yLabel,
  size = 320,
  equalAspect = true,
}: {
  groups: Array<{ label: string; color: string; points: Array<{ x: number; y: number }> }>;
  xLabel: string;
  yLabel: string;
  size?: number;
  equalAspect?: boolean;
}) {
  const pad = 40;
  const inner = size - pad * 2;
  const all = groups.flatMap((g) => g.points);
  if (all.length === 0) return <p className="small faint">No data.</p>;

  let minX = Math.min(...all.map((p) => p.x));
  let maxX = Math.max(...all.map((p) => p.x));
  let minY = Math.min(...all.map((p) => p.y));
  let maxY = Math.max(...all.map((p) => p.y));

  if (equalAspect) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const half = Math.max(maxX - minX, maxY - minY) / 2 || 1;
    minX = cx - half * 1.1;
    maxX = cx + half * 1.1;
    minY = cy - half * 1.1;
    maxY = cy + half * 1.1;
  }

  const toX = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * inner;
  const toY = (y: number) => pad + inner - ((y - minY) / (maxY - minY || 1)) * inner;

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`${yLabel} against ${xLabel}`}>
        <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="var(--c-border)" />
        {/* Origin cross — the reference a hard-iron offset is measured from. */}
        {minX < 0 && maxX > 0 ? (
          <line x1={toX(0)} y1={pad} x2={toX(0)} y2={pad + inner} stroke="var(--c-border-strong)" strokeDasharray="3 3" />
        ) : null}
        {minY < 0 && maxY > 0 ? (
          <line x1={pad} y1={toY(0)} x2={pad + inner} y2={toY(0)} stroke="var(--c-border-strong)" strokeDasharray="3 3" />
        ) : null}

        {groups.map((g) =>
          g.points.map((p, i) => (
            <circle key={`${g.label}-${i}`} cx={toX(p.x)} cy={toY(p.y)} r={2.2} fill={g.color} opacity={0.85} />
          )),
        )}

        <text x={size / 2} y={size - 8} fontSize={10} textAnchor="middle" fill="var(--c-text-muted)">
          {xLabel}
        </text>
        <text x={12} y={size / 2} fontSize={10} textAnchor="middle" fill="var(--c-text-muted)" transform={`rotate(-90 12 ${size / 2})`}>
          {yLabel}
        </text>
      </svg>
      <figcaption className="row xs" style={{ marginTop: 'var(--sp-2)' }}>
        {groups.map((g) => (
          <span key={g.label} className="row" style={{ gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
            <span className="muted">{g.label}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
