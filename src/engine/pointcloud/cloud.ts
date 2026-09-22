/**
 * POINT CLOUD ENGINE — Spec §127–§131, §137, Phase 28.
 *
 * The lessons this engine has to carry:
 *
 *   A POINT CLOUD IS NOT TERRAIN (golden principle 16). What the sensor
 *   returns is the surface it could see, including vegetation, equipment,
 *   buildings and noise. Ground comes from CLASSIFICATION, not from capture.
 *
 *   MORE POINTS ARE NOT MORE ACCURACY (golden principle 14, §129). Density
 *   controls what can be RESOLVED. Accuracy is controlled by geometry, control
 *   and calibration — and is measured on independent checkpoints.
 *
 * SIMPLIFIED TRAINING MODEL: points are generated from the terrain function
 * plus modelled cover, rather than reconstructed from imagery. Classification
 * is a progressive morphological ground filter, which is a real algorithm but
 * a basic one — production filters handle steep benches far better.
 */

import { pseudoNoise } from '../sensors/imu';
import { terrainElevation } from '../../data/mine';

export type PointClass =
  | 'unclassified'
  | 'ground'
  | 'vegetation'
  | 'building'
  | 'equipment'
  | 'noise';

export interface CloudPoint {
  e: number;
  n: number;
  rl: number;
  /** True ground RL at this location — known because the site is synthetic. */
  trueGroundRl: number;
  classification: PointClass;
  /** What the point actually is, for scoring the classifier honestly. */
  truth: PointClass;
  intensity: number;
}

export interface CloudOptions {
  bounds: { eMin: number; eMax: number; nMin: number; nMax: number };
  /** Points per square metre. */
  densityPerM2: number;
  /** 1σ ranging/matching noise on the vertical, metres. */
  noiseM: number;
  /** Fraction of the area carrying vegetation. */
  vegetationCover: number;
  /** Typical vegetation height, metres. */
  vegetationHeightM: number;
  /** Fraction of points that are gross outliers (§130). */
  outlierRate: number;
  seed?: number;
}

export interface PointCloud {
  points: CloudPoint[];
  bounds: CloudOptions['bounds'];
  densityPerM2: number;
  /** Mean spacing between neighbouring points, metres. */
  meanSpacingM: number;
}

/**
 * Generate a synthetic cloud over the virtual mine.
 * Deterministic for a given seed so every downstream product is reproducible.
 */
export function generateCloud(options: CloudOptions): PointCloud {
  const seed = options.seed ?? 17;
  const { bounds } = options;
  const areaM2 = (bounds.eMax - bounds.eMin) * (bounds.nMax - bounds.nMin);
  const count = Math.max(4, Math.round(areaM2 * options.densityPerM2));

  const points: CloudPoint[] = [];
  for (let i = 0; i < count; i++) {
    const u = (pseudoNoise(seed + i * 1.37) + 1) / 2;
    const w = (pseudoNoise(seed + i * 2.71) + 1) / 2;
    const e = bounds.eMin + (bounds.eMax - bounds.eMin) * u;
    const n = bounds.nMin + (bounds.nMax - bounds.nMin) * w;
    const groundRl = terrainElevation(e, n);

    const roll = (pseudoNoise(seed + i * 3.91) + 1) / 2;
    const noise = options.noiseM * pseudoNoise(seed + i * 4.53);

    let truth: PointClass = 'ground';
    let rl = groundRl + noise;
    let intensity = 0.4 + 0.3 * ((pseudoNoise(seed + i * 5.17) + 1) / 2);

    if (roll < options.outlierRate) {
      // Gross outlier: a bird, a multipath return, a matching blunder (§130).
      truth = 'noise';
      rl = groundRl + 8 + 30 * ((pseudoNoise(seed + i * 6.23) + 1) / 2);
      intensity = 0.1;
    } else if (roll < options.outlierRate + options.vegetationCover) {
      // Vegetation sits ABOVE the ground it hides — the §137 contamination.
      truth = 'vegetation';
      rl = groundRl + options.vegetationHeightM * (0.3 + 0.7 * ((pseudoNoise(seed + i * 7.31) + 1) / 2)) + noise;
      intensity = 0.7 + 0.2 * ((pseudoNoise(seed + i * 8.11) + 1) / 2);
    }

    points.push({
      e,
      n,
      rl,
      trueGroundRl: groundRl,
      classification: 'unclassified',
      truth,
      intensity,
    });
  }

  return {
    points,
    bounds,
    densityPerM2: options.densityPerM2,
    meanSpacingM: 1 / Math.sqrt(Math.max(1e-9, options.densityPerM2)),
  };
}

/**
 * POINT-CLOUD CLEANING — Spec §130.
 * Statistical outlier removal: a point whose height departs from its local
 * neighbourhood by more than k standard deviations is dropped.
 */
export function removeOutliers(cloud: PointCloud, k = 2.5, cellSizeM = 10): PointCloud {
  const cells = binByCell(cloud.points, cloud.bounds, cellSizeM);
  const keep: CloudPoint[] = [];

  for (const cell of cells.values()) {
    if (cell.length < 4) {
      keep.push(...cell);
      continue;
    }
    const heights = cell.map((p) => p.rl);
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    const sd = Math.sqrt(
      heights.reduce((a, h) => a + (h - mean) ** 2, 0) / heights.length,
    );
    if (sd < 1e-9) {
      keep.push(...cell);
      continue;
    }
    for (const point of cell) {
      if (Math.abs(point.rl - mean) <= k * sd) keep.push(point);
      else keep.push({ ...point, classification: 'noise' });
    }
  }

  return { ...cloud, points: keep.filter((p) => p.classification !== 'noise') };
}

function binByCell(
  points: CloudPoint[],
  bounds: CloudOptions['bounds'],
  cellSizeM: number,
): Map<string, CloudPoint[]> {
  const cells = new Map<string, CloudPoint[]>();
  for (const point of points) {
    const cx = Math.floor((point.e - bounds.eMin) / cellSizeM);
    const cy = Math.floor((point.n - bounds.nMin) / cellSizeM);
    const key = `${cx}:${cy}`;
    const list = cells.get(key) ?? [];
    list.push(point);
    cells.set(key, list);
  }
  return cells;
}

/**
 * CLASSIFICATION — Spec §131.
 *
 * Morphological ground filter: within each cell the lowest point is a ground
 * seed; anything more than `thresholdM` above the local ground estimate is
 * classified as cover. The cell size matters — too large and a bench crest is
 * filtered away as if it were a tree; too small and vegetation survives as
 * "ground". That trade-off is the lesson, so both are parameters.
 */
export interface ClassificationOptions {
  cellSizeM: number;
  /** Height above the local ground seed at which a point becomes non-ground. */
  thresholdM: number;
  /** Allowance for genuine terrain slope within a cell, metres per metre. */
  slopeTolerance: number;
}

export interface ClassificationResult {
  cloud: PointCloud;
  groundCount: number;
  coverCount: number;
  /** Ground points the filter wrongly rejected — terrain thrown away. */
  falseNegatives: number;
  /** Cover points the filter wrongly kept — contamination left in (§137). */
  falsePositives: number;
  /** Fraction of true ground correctly identified. */
  recall: number;
  /** Fraction of points called ground that really are. */
  precision: number;
}

export function classifyGround(
  cloud: PointCloud,
  options: ClassificationOptions,
): ClassificationResult {
  const cells = binByCell(cloud.points, cloud.bounds, options.cellSizeM);
  const classified: CloudPoint[] = [];

  for (const cell of cells.values()) {
    const lowest = cell.reduce((min, p) => (p.rl < min.rl ? p : min), cell[0]!);
    for (const point of cell) {
      const planDistance = Math.hypot(point.e - lowest.e, point.n - lowest.n);
      const allowance = options.thresholdM + options.slopeTolerance * planDistance;
      const above = point.rl - lowest.rl;
      classified.push({
        ...point,
        classification: above <= allowance ? 'ground' : point.truth === 'noise' ? 'noise' : 'vegetation',
      });
    }
  }

  const groundCount = classified.filter((p) => p.classification === 'ground').length;
  const trueGround = classified.filter((p) => p.truth === 'ground');
  const falseNegatives = trueGround.filter((p) => p.classification !== 'ground').length;
  const falsePositives = classified.filter(
    (p) => p.classification === 'ground' && p.truth !== 'ground',
  ).length;

  return {
    cloud: { ...cloud, points: classified },
    groundCount,
    coverCount: classified.length - groundCount,
    falseNegatives,
    falsePositives,
    recall: trueGround.length > 0 ? (trueGround.length - falseNegatives) / trueGround.length : NaN,
    precision: groundCount > 0 ? (groundCount - falsePositives) / groundCount : NaN,
  };
}

/**
 * POINT-DENSITY LAB — Spec §129.
 *
 * Density controls RESOLUTION: the smallest feature that can be represented.
 * It does not control ACCURACY, which is set by geometry, control and
 * calibration. The two are reported separately here precisely so the learner
 * can see one change without the other.
 */
export interface DensityAssessment {
  densityPerM2: number;
  meanSpacingM: number;
  /** Smallest feature that can carry several points across it. */
  resolvableFeatureM: number;
  /**
   * Vertical precision of a SURFACE fitted through n points in a cell —
   * σ/√n. It improves with density, but only as the square root, and only
   * for random error. A systematic error is untouched by density.
   */
  surfaceSigmaM: number;
  pointsPerCell: number;
  note: string;
}

export function assessDensity(
  densityPerM2: number,
  pointNoiseM: number,
  cellSizeM: number,
): DensityAssessment {
  const pointsPerCell = densityPerM2 * cellSizeM * cellSizeM;
  const spacing = 1 / Math.sqrt(Math.max(1e-9, densityPerM2));
  return {
    densityPerM2,
    meanSpacingM: spacing,
    // A feature needs roughly three points across it to be represented at all.
    resolvableFeatureM: spacing * 3,
    surfaceSigmaM: pointsPerCell > 0 ? pointNoiseM / Math.sqrt(pointsPerCell) : NaN,
    pointsPerCell,
    note:
      'Density sets what can be resolved and averages down RANDOM error as 1/√n. ' +
      'It does nothing to a systematic error — a wrong geoid, a wrong base coordinate or an ' +
      'uncalibrated boresight stays exactly as wrong at any density (golden principle 14).',
  };
}

/**
 * Clip a cloud to a polygon boundary — the first step of any volume (§147).
 * Ray-casting point-in-polygon.
 */
export function clipToPolygon(
  cloud: PointCloud,
  polygon: Array<{ e: number; n: number }>,
): PointCloud {
  return { ...cloud, points: cloud.points.filter((p) => pointInPolygon(p.e, p.n, polygon)) };
}

export function pointInPolygon(
  e: number,
  n: number,
  polygon: Array<{ e: number; n: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.n > n !== b.n > n && e < ((b.e - a.e) * (n - a.n)) / (b.n - a.n) + a.e;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** A regular polygon boundary, used for stockpile exercises. */
export function circularBoundary(
  centreE: number,
  centreN: number,
  radiusM: number,
  vertices = 48,
): Array<{ e: number; n: number }> {
  return Array.from({ length: vertices }, (_, i) => {
    const angle = (2 * Math.PI * i) / vertices;
    return { e: centreE + radiusM * Math.cos(angle), n: centreN + radiusM * Math.sin(angle) };
  });
}

/** Plan area of a closed polygon, by the shoelace formula. */
export function polygonArea(polygon: Array<{ e: number; n: number }>): number {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += (polygon[j]!.e + polygon[i]!.e) * (polygon[j]!.n - polygon[i]!.n);
  }
  return Math.abs(sum / 2);
}
