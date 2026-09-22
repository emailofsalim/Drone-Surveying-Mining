/**
 * PLAN VIEW + PROFILE — Spec §4 (view switching), §141 (contours), §142 (profile).
 *
 * Both are SVG, both read `terrainElevation()`. Consistency between views is a
 * specification requirement, so they share the source rather than the picture.
 */

import { useMemo } from 'react';
import {
  MINE_EXTENT,
  MINE_FEATURES,
  sampleTerrainGrid,
  terrainProfile,
  type MineFeature,
} from '../../data/mine';
import { formatNumber } from '../../engine/units/units';

const FEATURE_COLOR: Record<string, string> = {
  monument: '#e6edf3',
  gcp: '#e2703a',
  checkpoint: '#4ec9a5',
  launch: '#62a8e5',
  building: '#9aa8b8',
  crusher: '#9aa8b8',
  powerline: '#e9b949',
  water: '#3b7ea1',
  hemm: '#e5645f',
  exclusion: '#e5645f',
  stockpile: '#b09a56',
  dump: '#8d7a4e',
};

const PLAN_W = 800;
const PLAN_H = 700;

/**
 * Marching-squares contour extraction at a single level.
 * Educational implementation: linear interpolation on cell edges, segments
 * emitted individually rather than chained into polylines. Adequate for
 * display; a production contour engine would also handle saddle disambiguation
 * and polyline assembly (§141).
 */
function contourSegments(
  grid: { cols: number; rows: number; spacing: number; values: Float32Array },
  level: number,
): Array<[number, number, number, number]> {
  const segs: Array<[number, number, number, number]> = [];
  const { cols, rows, spacing, values } = grid;
  const at = (c: number, r: number) => values[r * cols + c]!;

  const interp = (v1: number, v2: number) => (level - v1) / (v2 - v1 || 1e-9);

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = at(c, r + 1);
      const tr = at(c + 1, r + 1);
      const br = at(c + 1, r);
      const bl = at(c, r);

      const x0 = c * spacing;
      const y0 = r * spacing;
      const x1 = x0 + spacing;
      const y1 = y0 + spacing;

      const idx =
        (bl > level ? 1 : 0) | (br > level ? 2 : 0) | (tr > level ? 4 : 0) | (tl > level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;

      const left: [number, number] = [x0, y0 + spacing * interp(bl, tl)];
      const right: [number, number] = [x1, y0 + spacing * interp(br, tr)];
      const bottom: [number, number] = [x0 + spacing * interp(bl, br), y0];
      const top: [number, number] = [x0 + spacing * interp(tl, tr), y1];

      const push = (a: [number, number], b: [number, number]) =>
        segs.push([a[0], a[1], b[0], b[1]]);

      switch (idx) {
        case 1:
        case 14:
          push(left, bottom);
          break;
        case 2:
        case 13:
          push(bottom, right);
          break;
        case 3:
        case 12:
          push(left, right);
          break;
        case 4:
        case 11:
          push(top, right);
          break;
        case 6:
        case 9:
          push(bottom, top);
          break;
        case 7:
        case 8:
          push(left, top);
          break;
        case 5:
          push(left, bottom);
          push(top, right);
          break;
        case 10:
          push(left, top);
          push(bottom, right);
          break;
        default:
          break;
      }
    }
  }
  return segs;
}

export function PlanView({
  contourInterval,
  sectionFrom,
  sectionTo,
  selected,
  onSelect,
}: {
  contourInterval: number;
  sectionFrom: { e: number; n: number };
  sectionTo: { e: number; n: number };
  selected: MineFeature | null;
  onSelect: (f: MineFeature) => void;
}) {
  const grid = useMemo(() => sampleTerrainGrid(10), []);

  const contours = useMemo(() => {
    const out: Array<{ level: number; segments: Array<[number, number, number, number]> }> = [];
    const start = Math.ceil(grid.minRl / contourInterval) * contourInterval;
    for (let level = start; level <= grid.maxRl; level += contourInterval) {
      out.push({ level, segments: contourSegments(grid, level) });
    }
    return out;
  }, [grid, contourInterval]);

  // Local grid metres → SVG units. +N is up, so the Y axis is inverted.
  const sx = PLAN_W / (MINE_EXTENT.eMax - MINE_EXTENT.eMin);
  const sy = PLAN_H / (MINE_EXTENT.nMax - MINE_EXTENT.nMin);
  const toX = (e: number) => (e - MINE_EXTENT.eMin) * sx;
  const toY = (n: number) => PLAN_H - (n - MINE_EXTENT.nMin) * sy;

  return (
    <svg
      viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
      style={{ width: '100%', height: 'auto', background: 'var(--c-bg)', borderRadius: 8 }}
      role="img"
      aria-label="Plan view of the simulated mine with contours, control and site features"
    >
      <rect width={PLAN_W} height={PLAN_H} fill="var(--c-surface)" />

      {contours.map((c) => {
        const isIndex = Math.abs(c.level % (contourInterval * 5)) < 1e-6;
        return (
          <g
            key={c.level}
            stroke={isIndex ? 'var(--c-accent)' : 'var(--c-border-strong)'}
            strokeWidth={isIndex ? 1.2 : 0.6}
            opacity={isIndex ? 0.9 : 0.55}
          >
            {c.segments.map((s, i) => (
              <line
                key={i}
                x1={s[0] * sx}
                y1={PLAN_H - s[1] * sy}
                x2={s[2] * sx}
                y2={PLAN_H - s[3] * sy}
              />
            ))}
          </g>
        );
      })}

      {/* Section line — identical endpoints to the 3D view and the profile. */}
      <line
        x1={toX(sectionFrom.e)}
        y1={toY(sectionFrom.n)}
        x2={toX(sectionTo.e)}
        y2={toY(sectionTo.n)}
        stroke="var(--c-accent)"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      <text x={toX(sectionFrom.e) + 6} y={toY(sectionFrom.n) - 6} fill="var(--c-accent)" fontSize={13}>
        A
      </text>
      <text x={toX(sectionTo.e) + 6} y={toY(sectionTo.n) - 6} fill="var(--c-accent)" fontSize={13}>
        A′
      </text>

      {MINE_FEATURES.map((f) => {
        const isSelected = selected?.id === f.id;
        return (
          <g
            key={f.id}
            transform={`translate(${toX(f.e)} ${toY(f.n)})`}
            onClick={() => onSelect(f)}
            style={{ cursor: 'pointer' }}
          >
            <circle
              r={isSelected ? 7 : 4.5}
              fill={FEATURE_COLOR[f.kind] ?? '#e6edf3'}
              stroke="var(--c-bg)"
              strokeWidth={1.2}
            />
            <text
              x={9}
              y={4}
              fontSize={10}
              fill={isSelected ? 'var(--c-text)' : 'var(--c-text-faint)'}
              style={{ pointerEvents: 'none' }}
            >
              {f.id}
            </text>
          </g>
        );
      })}

      {/* North arrow: grid north, since this is a plane grid (§53). */}
      <g transform={`translate(${PLAN_W - 52} 46)`}>
        <path d="M0 22 L0 -14 M0 -18 L-6 -6 L0 -10 L6 -6 Z" stroke="var(--c-text)" fill="var(--c-text)" strokeWidth={1.4} />
        <text x={-16} y={38} fontSize={10} fill="var(--c-text-muted)">
          GRID N
        </text>
      </g>

      <text x={12} y={PLAN_H - 12} fontSize={10} fill="var(--c-text-faint)">
        Contour interval {contourInterval} m · RL {formatNumber(grid.minRl, 0)}–
        {formatNumber(grid.maxRl, 0)} m · SIMULATED
      </text>
    </svg>
  );
}

const PROF_W = 900;
const PROF_H = 300;

export function ProfileView({
  from,
  to,
}: {
  from: { e: number; n: number };
  to: { e: number; n: number };
}) {
  const profile = useMemo(() => terrainProfile(from, to, 400), [from, to]);

  const chainageMax = profile[profile.length - 1]?.chainage ?? 1;
  const rls = profile.map((p) => p.rl);
  const minRl = Math.floor(Math.min(...rls) / 10) * 10;
  const maxRl = Math.ceil(Math.max(...rls) / 10) * 10;

  const pad = { l: 56, r: 16, t: 16, b: 34 };
  const innerW = PROF_W - pad.l - pad.r;
  const innerH = PROF_H - pad.t - pad.b;

  const toX = (chainage: number) => pad.l + (chainage / chainageMax) * innerW;
  const toY = (rl: number) => pad.t + innerH - ((rl - minRl) / (maxRl - minRl || 1)) * innerH;

  const path = profile
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.chainage).toFixed(1)} ${toY(p.rl).toFixed(1)}`)
    .join(' ');

  const fill = `${path} L${toX(chainageMax).toFixed(1)} ${pad.t + innerH} L${pad.l} ${pad.t + innerH} Z`;

  const ticks: number[] = [];
  for (let rl = minRl; rl <= maxRl; rl += Math.max(10, Math.round((maxRl - minRl) / 6 / 10) * 10)) {
    ticks.push(rl);
  }

  // Vertical exaggeration, stated explicitly — an unstated exaggeration is a
  // way to make a profile lie (§142).
  const horizontalScale = chainageMax / innerW;
  const verticalScale = (maxRl - minRl) / innerH;
  const exaggeration = horizontalScale / verticalScale;

  return (
    <svg
      viewBox={`0 0 ${PROF_W} ${PROF_H}`}
      style={{ width: '100%', height: 'auto', background: 'var(--c-surface)', borderRadius: 8 }}
      role="img"
      aria-label="Terrain profile along the section line"
    >
      {ticks.map((rl) => (
        <g key={rl}>
          <line
            x1={pad.l}
            y1={toY(rl)}
            x2={PROF_W - pad.r}
            y2={toY(rl)}
            stroke="var(--c-border)"
            strokeWidth={0.6}
          />
          <text x={pad.l - 8} y={toY(rl) + 4} fontSize={10} textAnchor="end" fill="var(--c-text-faint)">
            {rl}
          </text>
        </g>
      ))}

      <path d={fill} fill="var(--c-accent-dim)" />
      <path d={path} fill="none" stroke="var(--c-accent)" strokeWidth={1.8} />

      <text x={pad.l} y={PROF_H - 10} fontSize={11} fill="var(--c-text-muted)">
        A
      </text>
      <text x={PROF_W - pad.r} y={PROF_H - 10} fontSize={11} textAnchor="end" fill="var(--c-text-muted)">
        A′ · {formatNumber(chainageMax, 0)} m
      </text>
      <text x={PROF_W / 2} y={PROF_H - 10} fontSize={10} textAnchor="middle" fill="var(--c-text-faint)">
        Vertical exaggeration ≈ {formatNumber(exaggeration, 1)}× · RL in metres · SIMULATED
      </text>
      <text
        x={14}
        y={PROF_H / 2}
        fontSize={10}
        fill="var(--c-text-faint)"
        transform={`rotate(-90 14 ${PROF_H / 2})`}
        textAnchor="middle"
      >
        RL (m)
      </text>
    </svg>
  );
}
