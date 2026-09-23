/**
 * SURFACE ENGINE — Spec §132–§144, Phases 29, 30, 35.
 *
 * DSM vs DTM (§134, §135) is the distinction the whole volume chain rests on:
 *
 *   DSM — the surface as OBSERVED, including vegetation, equipment, buildings.
 *   DTM — the TERRAIN, after classification has removed everything that is
 *         not ground. It is an interpretation of the data, not the data.
 *
 * A DTM built from an unclassified cloud is a DSM with a different label, and
 * every volume computed from it is wrong by the height of the cover
 * (§137, §240, golden principle 17).
 *
 * SIMPLIFIED TRAINING MODEL: gridded surfaces with inverse-distance
 * interpolation and a Delaunay TIN. Production tooling offers kriging, spline
 * and breakline-constrained triangulation, none of which are implemented here.
 */

import type { CloudPoint, PointCloud } from '../pointcloud/cloud';
import { pointInPolygon, polygonArea } from '../pointcloud/cloud';

export interface GridSurface {
  /** Surface type, carried with the data so it cannot be mislabelled (§236). */
  kind: 'DSM' | 'DTM' | 'design' | 'previous';
  eMin: number;
  nMin: number;
  cellSizeM: number;
  cols: number;
  rows: number;
  /** Row-major; NaN where no data supported a value. */
  values: Float64Array;
  /** Per-cell count of source points — the evidence behind each value. */
  support: Int32Array;
  /** How values between observations were produced (§133). */
  method: string;
}

export function surfaceValue(surface: GridSurface, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= surface.cols || row >= surface.rows) return NaN;
  return surface.values[row * surface.cols + col]!;
}

/**
 * SURFACE INTERPOLATION — Spec §133.
 *
 * Cells containing points take the mean (or minimum, for a ground surface).
 * Empty cells are filled by inverse-distance weighting from nearby supported
 * cells, up to a search radius. Beyond that radius the surface is left as NaN:
 * a gap in the data is not a flat area, and pretending otherwise is how a
 * hole becomes a volume (§139).
 */
export interface GriddingOptions {
  kind: GridSurface['kind'];
  cellSizeM: number;
  bounds: { eMin: number; eMax: number; nMin: number; nMax: number };
  /** 'mean' for a DSM, 'min' for a ground surface. */
  aggregate: 'mean' | 'min';
  /** Cells to search when filling a gap. 0 leaves gaps as gaps. */
  searchRadiusCells: number;
  /** Only use points of these classes. */
  classes?: Array<CloudPoint['classification']>;
}

export function gridFromCloud(cloud: PointCloud, options: GriddingOptions): GridSurface {
  const { bounds, cellSizeM } = options;
  const cols = Math.max(1, Math.ceil((bounds.eMax - bounds.eMin) / cellSizeM));
  const rows = Math.max(1, Math.ceil((bounds.nMax - bounds.nMin) / cellSizeM));

  const sums = new Float64Array(cols * rows);
  const mins = new Float64Array(cols * rows).fill(Number.POSITIVE_INFINITY);
  const support = new Int32Array(cols * rows);

  const allowed = options.classes ? new Set(options.classes) : null;

  for (const point of cloud.points) {
    if (allowed && !allowed.has(point.classification)) continue;
    const col = Math.floor((point.e - bounds.eMin) / cellSizeM);
    const row = Math.floor((point.n - bounds.nMin) / cellSizeM);
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    const idx = row * cols + col;
    sums[idx]! += point.rl;
    support[idx]! += 1;
    if (point.rl < mins[idx]!) mins[idx] = point.rl;
  }

  const values = new Float64Array(cols * rows);
  for (let i = 0; i < values.length; i++) {
    if (support[i]! === 0) {
      values[i] = Number.NaN;
      continue;
    }
    values[i] = options.aggregate === 'min' ? mins[i]! : sums[i]! / support[i]!;
  }

  if (options.searchRadiusCells > 0) {
    fillGaps(values, support, cols, rows, options.searchRadiusCells);
  }

  return {
    kind: options.kind,
    eMin: bounds.eMin,
    nMin: bounds.nMin,
    cellSizeM,
    cols,
    rows,
    values,
    support,
    method:
      options.searchRadiusCells > 0
        ? `${options.aggregate} per cell, gaps filled by inverse-distance weighting within ${options.searchRadiusCells} cells`
        : `${options.aggregate} per cell, gaps left as no-data`,
  };
}

function fillGaps(
  values: Float64Array,
  support: Int32Array,
  cols: number,
  rows: number,
  radius: number,
): void {
  const source = Float64Array.from(values);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (support[idx]! > 0) continue;

      let weightSum = 0;
      let valueSum = 0;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
          const neighbour = r * cols + c;
          if (support[neighbour]! === 0) continue;
          const distance = Math.hypot(dr, dc);
          if (distance === 0 || distance > radius) continue;
          const weight = 1 / (distance * distance);
          weightSum += weight;
          valueSum += weight * source[neighbour]!;
        }
      }
      values[idx] = weightSum > 0 ? valueSum / weightSum : Number.NaN;
    }
  }
}

/** Sample a surface at an arbitrary position by bilinear interpolation. */
export function sampleSurface(surface: GridSurface, e: number, n: number): number {
  const fx = (e - surface.eMin) / surface.cellSizeM - 0.5;
  const fy = (n - surface.nMin) / surface.cellSizeM - 0.5;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const tx = fx - c0;
  const ty = fy - r0;

  const v00 = surfaceValue(surface, c0, r0);
  const v10 = surfaceValue(surface, c0 + 1, r0);
  const v01 = surfaceValue(surface, c0, r0 + 1);
  const v11 = surfaceValue(surface, c0 + 1, r0 + 1);

  // Any missing corner makes the interpolated value unsupported.
  if ([v00, v10, v01, v11].some((v) => Number.isNaN(v))) {
    return Number.isNaN(v00) ? Number.NaN : v00;
  }

  return (
    v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty
  );
}

export interface SurfaceStats {
  min: number;
  max: number;
  mean: number;
  /** Cells with no supporting data. */
  noDataCells: number;
  /** Cells whose value came from interpolation rather than observation. */
  interpolatedCells: number;
  cells: number;
}

export function surfaceStats(surface: GridSurface): SurfaceStats {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let valid = 0;
  let noData = 0;
  let interpolated = 0;

  for (let i = 0; i < surface.values.length; i++) {
    const v = surface.values[i]!;
    if (Number.isNaN(v)) {
      noData++;
      continue;
    }
    if (surface.support[i]! === 0) interpolated++;
    valid++;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return {
    min: valid > 0 ? min : NaN,
    max: valid > 0 ? max : NaN,
    mean: valid > 0 ? sum / valid : NaN,
    noDataCells: noData,
    interpolatedCells: interpolated,
    cells: surface.values.length,
  };
}

/**
 * SURFACE DIFFERENCE — Spec §143, §144.
 * ΔZ = A − B, cell by cell, and the cut/fill split that follows from it.
 */
export interface DifferenceResult {
  surface: GridSurface;
  cutVolumeM3: number;
  fillVolumeM3: number;
  netVolumeM3: number;
  cutAreaM2: number;
  fillAreaM2: number;
  noChangeAreaM2: number;
  /** Cells that could not be compared because one side had no data. */
  unusableCells: number;
}

export function differenceSurfaces(
  a: GridSurface,
  b: GridSurface,
  noChangeBandM = 0.05,
): DifferenceResult {
  if (a.cols !== b.cols || a.rows !== b.rows || a.cellSizeM !== b.cellSizeM) {
    throw new Error(
      'Surfaces must share a grid to be differenced. Resample one onto the other first — ' +
        'differencing across mismatched grids silently invents change.',
    );
  }

  const values = new Float64Array(a.values.length);
  const support = new Int32Array(a.values.length);
  const cellArea = a.cellSizeM * a.cellSizeM;

  let cut = 0;
  let fill = 0;
  let cutArea = 0;
  let fillArea = 0;
  let noChangeArea = 0;
  let unusable = 0;

  for (let i = 0; i < values.length; i++) {
    const va = a.values[i]!;
    const vb = b.values[i]!;
    if (Number.isNaN(va) || Number.isNaN(vb)) {
      values[i] = Number.NaN;
      unusable++;
      continue;
    }
    const delta = va - vb;
    values[i] = delta;
    support[i] = 1;

    if (Math.abs(delta) <= noChangeBandM) {
      noChangeArea += cellArea;
    } else if (delta > 0) {
      fill += delta * cellArea;
      fillArea += cellArea;
    } else {
      cut += -delta * cellArea;
      cutArea += cellArea;
    }
  }

  return {
    surface: {
      kind: 'design',
      eMin: a.eMin,
      nMin: a.nMin,
      cellSizeM: a.cellSizeM,
      cols: a.cols,
      rows: a.rows,
      values,
      support,
      method: `cell-by-cell difference of ${a.kind} minus ${b.kind}`,
    },
    cutVolumeM3: cut,
    fillVolumeM3: fill,
    netVolumeM3: fill - cut,
    cutAreaM2: cutArea,
    fillAreaM2: fillArea,
    noChangeAreaM2: noChangeArea,
    unusableCells: unusable,
  };
}

/**
 * VOLUME — Spec §145, §146, §147.
 *
 * A volume is not a number. It is a number PLUS the surface, the boundary,
 * the base/reference, the method and the units that produced it
 * (golden principle 18). The result type carries all of them, so the
 * application cannot report a volume without its methodology.
 */
export type BaseSurface =
  | { type: 'plane'; rl: number }
  | { type: 'best-fit-plane' }
  | { type: 'lowest-perimeter' }
  | { type: 'surface'; surface: GridSurface };

export interface VolumeRequest {
  surface: GridSurface;
  boundary: Array<{ e: number; n: number }>;
  base: BaseSurface;
  /** Grid method sums cell prisms; TIN method sums triangle prisms (§146). */
  method: 'grid-prism' | 'tin-prism';
}

export interface VolumeResult {
  volumeM3: number;
  cutM3: number;
  fillM3: number;
  planAreaM2: number;
  /** Cells inside the boundary that had no data — the coverage gap (§240). */
  missingCells: number;
  missingAreaM2: number;
  meanHeightM: number;
  /** Full methodology statement — required for the number to mean anything. */
  methodology: {
    surfaceKind: string;
    surfaceMethod: string;
    boundaryVertices: number;
    base: string;
    method: string;
    cellSizeM: number;
    units: string;
  };
  warnings: string[];
}

export function computeVolume(request: VolumeRequest): VolumeResult {
  const { surface, boundary, base } = request;
  const cellArea = surface.cellSizeM * surface.cellSizeM;
  const warnings: string[] = [];

  const inside: Array<{ idx: number; e: number; n: number; value: number }> = [];
  let missingCells = 0;

  for (let row = 0; row < surface.rows; row++) {
    for (let col = 0; col < surface.cols; col++) {
      const e = surface.eMin + (col + 0.5) * surface.cellSizeM;
      const n = surface.nMin + (row + 0.5) * surface.cellSizeM;
      if (!pointInPolygon(e, n, boundary)) continue;
      const idx = row * surface.cols + col;
      const value = surface.values[idx]!;
      if (Number.isNaN(value)) {
        missingCells++;
        continue;
      }
      inside.push({ idx, e, n, value });
    }
  }

  const baseRlAt = makeBaseEvaluator(base, surface, boundary, inside);

  let cut = 0;
  let fill = 0;
  let heightSum = 0;

  for (const cell of inside) {
    const baseRl = baseRlAt(cell.e, cell.n);
    if (Number.isNaN(baseRl)) {
      missingCells++;
      continue;
    }
    const delta = cell.value - baseRl;
    heightSum += delta;
    if (delta >= 0) fill += delta * cellArea;
    else cut += -delta * cellArea;
  }

  const planArea = polygonArea(boundary);
  const missingArea = missingCells * cellArea;

  if (missingCells > 0) {
    warnings.push(
      `${missingCells} cells inside the boundary (${missingArea.toFixed(0)} m²) had no supporting data ` +
        'and contributed nothing. A coverage gap understates the volume — it does not average out (§240).',
    );
  }
  if (surface.kind === 'DSM') {
    warnings.push(
      'This volume was computed from a DSM. Anything standing on the ground — vegetation, ' +
        'equipment, a truck parked on the pile — is being measured as material (§137, §240).',
    );
  }
  if (base.type === 'plane') {
    warnings.push(
      'The base is a horizontal plane. Real ground beneath a stockpile is rarely flat, and the ' +
        'difference between the assumed plane and the true base goes straight into the answer.',
    );
  }

  return {
    volumeM3: fill - cut,
    cutM3: cut,
    fillM3: fill,
    planAreaM2: planArea,
    missingCells,
    missingAreaM2: missingArea,
    meanHeightM: inside.length > 0 ? heightSum / inside.length : NaN,
    methodology: {
      surfaceKind: surface.kind,
      surfaceMethod: surface.method,
      boundaryVertices: boundary.length,
      base: describeBase(base),
      method: request.method,
      cellSizeM: surface.cellSizeM,
      units: 'm³',
    },
    warnings,
  };
}

function describeBase(base: BaseSurface): string {
  switch (base.type) {
    case 'plane':
      return `horizontal plane at RL ${base.rl.toFixed(3)} m`;
    case 'best-fit-plane':
      return 'plane least-squares fitted to the boundary perimeter';
    case 'lowest-perimeter':
      return 'horizontal plane at the lowest perimeter elevation';
    case 'surface':
      return `previous/design surface (${base.surface.kind})`;
  }
}

function makeBaseEvaluator(
  base: BaseSurface,
  surface: GridSurface,
  boundary: Array<{ e: number; n: number }>,
  inside: Array<{ e: number; n: number; value: number }>,
): (e: number, n: number) => number {
  switch (base.type) {
    case 'plane':
      return () => base.rl;

    case 'surface':
      return (e, n) => sampleSurface(base.surface, e, n);

    case 'lowest-perimeter': {
      const perimeter = boundary
        .map((v) => sampleSurface(surface, v.e, v.n))
        .filter((v) => !Number.isNaN(v));
      const lowest = perimeter.length > 0 ? Math.min(...perimeter) : NaN;
      return () => lowest;
    }

    case 'best-fit-plane': {
      // Least-squares plane through the boundary perimeter: z = a·e + b·n + c.
      const samples = boundary
        .map((v) => ({ e: v.e, n: v.n, z: sampleSurface(surface, v.e, v.n) }))
        .filter((s) => !Number.isNaN(s.z));
      if (samples.length < 3) {
        const fallback = inside.length > 0 ? Math.min(...inside.map((c) => c.value)) : NaN;
        return () => fallback;
      }
      const plane = fitPlane(samples);
      return (e, n) => plane.a * e + plane.b * n + plane.c;
    }
  }
}

export function fitPlane(
  samples: Array<{ e: number; n: number; z: number }>,
): { a: number; b: number; c: number } {
  let See = 0;
  let Snn = 0;
  let Sen = 0;
  let Se = 0;
  let Sn = 0;
  let S1 = 0;
  let Sez = 0;
  let Snz = 0;
  let Sz = 0;

  for (const s of samples) {
    See += s.e * s.e;
    Snn += s.n * s.n;
    Sen += s.e * s.n;
    Se += s.e;
    Sn += s.n;
    S1 += 1;
    Sez += s.e * s.z;
    Snz += s.n * s.z;
    Sz += s.z;
  }

  const A = [
    [See, Sen, Se],
    [Sen, Snn, Sn],
    [Se, Sn, S1],
  ];
  const rhs = [Sez, Snz, Sz];

  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(A[pivot]![col]!) < 1e-12) return { a: 0, b: 0, c: Sz / (S1 || 1) };
    [A[col], A[pivot]] = [A[pivot]!, A[col]!];
    [rhs[col], rhs[pivot]] = [rhs[pivot]!, rhs[col]!];

    const d = A[col]![col]!;
    for (let j = col; j < 3; j++) A[col]![j]! /= d;
    rhs[col]! /= d;

    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = A[r]![col]!;
      if (f === 0) continue;
      for (let j = col; j < 3; j++) A[r]![j]! -= f * A[col]![j]!;
      rhs[r]! -= f * rhs[col]!;
    }
  }

  return { a: rhs[0]!, b: rhs[1]!, c: rhs[2]! };
}

/**
 * CONTOURS — Spec §141.
 * Marching squares over a grid surface. No-data cells are skipped, so a
 * contour never crosses a gap in the evidence.
 */
export interface ContourSegment {
  e1: number;
  n1: number;
  e2: number;
  n2: number;
}

export function contourSurface(surface: GridSurface, level: number): ContourSegment[] {
  const segments: ContourSegment[] = [];
  const { cols, rows, cellSizeM, eMin, nMin } = surface;
  const at = (c: number, r: number) => surface.values[r * cols + c]!;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const bl = at(c, r);
      const br = at(c + 1, r);
      const tr = at(c + 1, r + 1);
      const tl = at(c, r + 1);
      if ([bl, br, tr, tl].some((v) => Number.isNaN(v))) continue;

      const x0 = eMin + c * cellSizeM;
      const y0 = nMin + r * cellSizeM;
      const x1 = x0 + cellSizeM;
      const y1 = y0 + cellSizeM;
      const interp = (v1: number, v2: number) => (level - v1) / (v2 - v1 || 1e-9);

      const idx =
        (bl > level ? 1 : 0) | (br > level ? 2 : 0) | (tr > level ? 4 : 0) | (tl > level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;

      const left = { e: x0, n: y0 + cellSizeM * interp(bl, tl) };
      const right = { e: x1, n: y0 + cellSizeM * interp(br, tr) };
      const bottom = { e: x0 + cellSizeM * interp(bl, br), n: y0 };
      const top = { e: x0 + cellSizeM * interp(tl, tr), n: y1 };
      const push = (a: { e: number; n: number }, b: { e: number; n: number }) =>
        segments.push({ e1: a.e, n1: a.n, e2: b.e, n2: b.n });

      switch (idx) {
        case 1: case 14: push(left, bottom); break;
        case 2: case 13: push(bottom, right); break;
        case 3: case 12: push(left, right); break;
        case 4: case 11: push(top, right); break;
        case 6: case 9: push(bottom, top); break;
        case 7: case 8: push(left, top); break;
        case 5: push(left, bottom); push(top, right); break;
        case 10: push(left, top); push(bottom, right); break;
        default: break;
      }
    }
  }
  return segments;
}

/** PROFILE — Spec §142. Sample a surface along a line. */
export function surfaceProfile(
  surface: GridSurface,
  from: { e: number; n: number },
  to: { e: number; n: number },
  samples = 200,
): Array<{ chainage: number; e: number; n: number; rl: number }> {
  const total = Math.hypot(to.e - from.e, to.n - from.n);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    const e = from.e + (to.e - from.e) * t;
    const n = from.n + (to.n - from.n) * t;
    return { chainage: total * t, e, n, rl: sampleSurface(surface, e, n) };
  });
}

/**
 * STOCKPILE RECONCILIATION — Spec §148.
 *
 * The specification is explicit: do NOT convert volume to tonnage
 * automatically. Density is a measured property with its own uncertainty, and
 * a survey volume compared against an operational record is comparing two
 * different measurement systems.
 */
export interface ReconciliationInput {
  surveyVolumeM3: number;
  /** 1σ of the survey volume, from the error budget. */
  volumeSigmaM3: number;
  bulkDensityTm3: number;
  /** 1σ of the density determination. */
  densitySigmaTm3: number;
  /** Tonnage from the operational record, if being compared. */
  recordedTonnes?: number;
}

export interface ReconciliationResult {
  tonnes: number;
  /** Propagated 1σ on the tonnage. */
  tonnesSigma: number;
  /** Relative contribution of volume vs density to the total uncertainty. */
  volumeContribution: number;
  densityContribution: number;
  differenceTonnes?: number;
  differencePercent?: number;
  /** True when the difference is within the combined uncertainty. */
  reconciles?: boolean;
  notes: string[];
}

export function reconcile(input: ReconciliationInput): ReconciliationResult {
  const tonnes = input.surveyVolumeM3 * input.bulkDensityTm3;

  // T = V·ρ  ⇒  (σT/T)² = (σV/V)² + (σρ/ρ)²
  const relVolume = input.surveyVolumeM3 !== 0 ? input.volumeSigmaM3 / input.surveyVolumeM3 : NaN;
  const relDensity = input.bulkDensityTm3 !== 0 ? input.densitySigmaTm3 / input.bulkDensityTm3 : NaN;
  const relTotal = Math.hypot(relVolume, relDensity);
  const tonnesSigma = Math.abs(tonnes) * relTotal;

  const notes: string[] = [
    'Volume and tonnage are different quantities. The conversion requires a density determined ' +
      'for this material, in this condition, by a stated method — not a handbook figure (§148).',
  ];

  if (relDensity > relVolume) {
    notes.push(
      'Density dominates the tonnage uncertainty here. Refining the survey further will not ' +
        'improve the answer; determining the density better will.',
    );
  } else {
    notes.push('The survey volume dominates the tonnage uncertainty here.');
  }

  const result: ReconciliationResult = {
    tonnes,
    tonnesSigma,
    volumeContribution: relTotal > 0 ? (relVolume / relTotal) ** 2 : NaN,
    densityContribution: relTotal > 0 ? (relDensity / relTotal) ** 2 : NaN,
    notes,
  };

  if (input.recordedTonnes !== undefined) {
    const difference = tonnes - input.recordedTonnes;
    result.differenceTonnes = difference;
    result.differencePercent = input.recordedTonnes !== 0 ? (difference / input.recordedTonnes) * 100 : NaN;
    result.reconciles = Math.abs(difference) <= 2 * tonnesSigma;
    notes.push(
      result.reconciles
        ? 'The difference falls within twice the combined uncertainty, so the two figures are ' +
          'consistent. That is not the same as either being correct.'
        : 'The difference exceeds twice the combined uncertainty. Something other than random ' +
          'error is present — investigate the boundary, the base, the density or the record itself.',
    );
  }

  return result;
}
