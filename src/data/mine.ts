/**
 * THE VIRTUAL MINE — Spec §4, §5 (digital-twin principle), §70 (local grid).
 *
 * ONE dataset drives every view. The 3D scene, the plan view, the profile and
 * every later product (point cloud, DSM, DTM, ortho, contours, volume) must be
 * generated from `terrainElevation()` and the feature list below — never from
 * separate hand-drawn illustrations. That is what makes "follow one rock"
 * (§6) and "follow one height" (§7) possible.
 *
 * SIMULATED TRAINING DATA. The site is fictitious. No real mine coordinates,
 * flight logs or imagery appear anywhere in this repository (§199, safety
 * framework "public repository rule").
 */

import type { CrsDescriptor, Coordinate, HeightDescriptor } from '../engine/geodesy/coordinate';

/**
 * Project CRS. A deliberately explicit local engineering grid (§70): the
 * learner must state a transformation before any coordinate leaves the site.
 */
export const MINE_CRS: CrsDescriptor = {
  name: 'Hillock Ridge Mine Local Grid (SIMULATED)',
  kind: 'local-engineering',
  datum: 'Local site datum, defined by monument SM-01 (simulated)',
  ellipsoid: 'Not applicable — plane grid',
  axisOrder: 'easting-northing',
  units: 'm',
};

/** Vertical reference for every height in this dataset. */
export const MINE_HEIGHT_REF: HeightDescriptor = {
  type: 'local-RL',
  reference: 'Mine RL datum, benchmark BM-07 = 500.000 m (simulated)',
  units: 'm',
};

/** Nominal geographic position used only for convergence/declination lessons. */
export const MINE_NOMINAL_POSITION = {
  latDeg: 23.75,
  lonDeg: 86.42,
  note: 'Approximate, fictitious. Used only to demonstrate convergence and zone selection.',
};

/** Plan extent of the site model, in local grid metres. */
export const MINE_EXTENT = {
  eMin: 0,
  eMax: 1600,
  nMin: 0,
  nMax: 1400,
};

export const PIT = {
  centreE: 700,
  centreN: 700,
  /** Crest radius of the pit rim. */
  crestRadius: 420,
  crestRl: 520,
  /** Floor level at the bottom of the pit. */
  floorRl: 400,
  benchHeight: 12,
  benchWidth: 18,
  /** Inter-ramp face angle, degrees from horizontal. */
  faceAngleDeg: 68,
};

/**
 * Piles sit on a prepared pad cut to the natural ground level at their centre,
 * so `baseRl` is derived rather than asserted. Hard-coding it risks burying the
 * pile under the terrain — and a pile that does not stand above the ground
 * produces no contours, no volume and no lesson.
 */
export const STOCKPILE = {
  id: 'SP-01',
  name: 'ROM stockpile SP-01',
  centreE: 1240,
  centreN: 430,
  baseRadius: 95,
  height: 26,
  baseRl: roundTo(naturalGround(1240, 430), 0.1),
  /** Bulk density used in reconciliation exercises, t/m³ (§148). */
  bulkDensityTm3: 1.62,
};

export const WASTE_DUMP = {
  id: 'WD-01',
  name: 'Waste dump WD-01',
  centreE: 320,
  centreN: 1150,
  baseRadius: 210,
  height: 34,
  baseRl: roundTo(naturalGround(320, 1150), 0.1),
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Haul ramp: a spiral descending the pit wall from the crest to the floor. */
export const RAMP = {
  startAzimuthDeg: 35,
  /** Ramp gradient, rise over run. 1:10 ≈ 10%. */
  gradient: 0.1,
  widthM: 24,
};

export type FeatureKind =
  | 'monument'
  | 'gcp'
  | 'checkpoint'
  | 'launch'
  | 'building'
  | 'crusher'
  | 'powerline'
  | 'water'
  | 'hemm'
  | 'exclusion'
  | 'stockpile'
  | 'dump';

export interface MineFeature {
  id: string;
  name: string;
  kind: FeatureKind;
  e: number;
  n: number;
  /** RL in metres. Omitted features sit on the terrain surface. */
  rl?: number;
  notes?: string;
}

/**
 * Survey control and site features.
 * GCPs constrain a future adjustment; checkpoints validate it and must never
 * be fed into the adjustment (§112, §152).
 */
export const MINE_FEATURES: MineFeature[] = [
  { id: 'SM-01', name: 'Survey monument SM-01 (grid origin)', kind: 'monument', e: 120, n: 120, rl: 512.443 },
  { id: 'BM-07', name: 'Benchmark BM-07 (RL datum)', kind: 'monument', e: 150, n: 1260, rl: 500.0 },

  { id: 'GCP-01', name: 'GCP-01 crest north', kind: 'gcp', e: 700, n: 1180, rl: 519.2 },
  { id: 'GCP-02', name: 'GCP-02 crest east', kind: 'gcp', e: 1160, n: 700, rl: 518.4 },
  { id: 'GCP-03', name: 'GCP-03 crest south', kind: 'gcp', e: 700, n: 250, rl: 520.6 },
  { id: 'GCP-04', name: 'GCP-04 crest west', kind: 'gcp', e: 255, n: 700, rl: 517.9 },
  { id: 'GCP-05', name: 'GCP-05 pit floor', kind: 'gcp', e: 700, n: 700, rl: 400.3 },
  { id: 'GCP-06', name: 'GCP-06 ramp mid-bench', kind: 'gcp', e: 940, n: 930, rl: 462.1 },

  { id: 'CP-01', name: 'Checkpoint CP-01 stockpile toe', kind: 'checkpoint', e: 1180, n: 380, rl: 505.1 },
  { id: 'CP-02', name: 'Checkpoint CP-02 haul road', kind: 'checkpoint', e: 520, n: 1020, rl: 514.8 },
  { id: 'CP-03', name: 'Checkpoint CP-03 dump flank', kind: 'checkpoint', e: 245, n: 1075 },
  { id: 'CP-04', name: 'Checkpoint CP-04 pit bench 3', kind: 'checkpoint', e: 560, n: 520, rl: 472.4 },

  { id: 'LZ-01', name: 'Launch/recovery pad LZ-01', kind: 'launch', e: 180, n: 300, rl: 513.0, notes: 'Clear of HEMM routes and the powerline corridor.' },
  { id: 'CR-01', name: 'Primary crusher', kind: 'crusher', e: 1420, n: 640, notes: 'Dust and vibration source; magnetic disturbance near steel structure (§49).' },
  { id: 'OF-01', name: 'Site office and muster point', kind: 'building', e: 130, n: 220 },
  { id: 'PL-01', name: '33 kV powerline corridor', kind: 'powerline', e: 900, n: 1320, notes: 'Vertical hazard. Conductors are hard to see from the aircraft (§102, SOP-019).' },
  { id: 'WT-01', name: 'Pit dewatering sump', kind: 'water', e: 760, n: 640, notes: 'Water surface returns no usable photogrammetric texture (§241).' },
  { id: 'EX-01', name: 'Blast exclusion zone (scheduled)', kind: 'exclusion', e: 620, n: 560, notes: 'Interface controlled by SOP-018.' },
  { id: 'HM-01', name: 'Haul truck on ramp', kind: 'hemm', e: 980, n: 980, notes: 'Moving obstacle; also a large steel mass near the flight path.' },
  { id: 'SP-01', name: STOCKPILE.name, kind: 'stockpile', e: STOCKPILE.centreE, n: STOCKPILE.centreN },
  { id: 'WD-01', name: WASTE_DUMP.name, kind: 'dump', e: WASTE_DUMP.centreE, n: WASTE_DUMP.centreN },
];

/** RL of a feature: its stated value, or the surface model where none is given. */
export function featureRl(feature: MineFeature): number {
  return feature.rl ?? terrainElevation(feature.e, feature.n);
}

export function featureCoordinate(feature: MineFeature): Coordinate {
  return {
    x: feature.e,
    y: feature.n,
    z: featureRl(feature),
    crs: MINE_CRS,
    height: MINE_HEIGHT_REF,
    source: 'Simulated site model v0.1',
    quality: 'SIMULATED — not a surveyed observation',
  };
}

/* ------------------------------------------------------------------ *
 * Terrain model — the single source of truth for every view (§4, §5)
 * ------------------------------------------------------------------ */

/** Natural ground surface before mining: a gentle ridge falling to the east. */
function naturalGround(e: number, n: number): number {
  const ridge = 18 * Math.sin((n / MINE_EXTENT.nMax) * Math.PI);
  const slope = -0.012 * (e - MINE_EXTENT.eMin);
  const undulation =
    3.5 * Math.sin(e / 190) * Math.cos(n / 240) + 2.0 * Math.sin((e + n) / 310);
  return 525 + ridge + slope + undulation;
}

/** Radius at which the pit wall reaches a given RL, following the bench profile. */
function pitRadiusAtRl(rl: number): number {
  if (rl >= PIT.crestRl) return PIT.crestRadius;
  if (rl <= PIT.floorRl) return PIT.crestRadius - totalHorizontalRun();
  const depthBelowCrest = PIT.crestRl - rl;
  const benches = depthBelowCrest / PIT.benchHeight;
  const faceRun = PIT.benchHeight / Math.tan((PIT.faceAngleDeg * Math.PI) / 180);
  return PIT.crestRadius - benches * (faceRun + PIT.benchWidth);
}

function totalHorizontalRun(): number {
  const benches = (PIT.crestRl - PIT.floorRl) / PIT.benchHeight;
  const faceRun = PIT.benchHeight / Math.tan((PIT.faceAngleDeg * Math.PI) / 180);
  return benches * (faceRun + PIT.benchWidth);
}

/** Pit surface RL at a plan radius from the pit centre. Benched, not conical. */
function pitSurfaceAtRadius(radius: number): number {
  const faceRun = PIT.benchHeight / Math.tan((PIT.faceAngleDeg * Math.PI) / 180);
  const stride = faceRun + PIT.benchWidth;
  const inward = PIT.crestRadius - radius;
  if (inward <= 0) return PIT.crestRl;
  const benchIndex = Math.floor(inward / stride);
  const withinBench = inward - benchIndex * stride;
  const rlAtBenchTop = PIT.crestRl - benchIndex * PIT.benchHeight;
  // Descend the face, then run flat across the bench.
  const drop =
    withinBench <= faceRun ? (withinBench / faceRun) * PIT.benchHeight : PIT.benchHeight;
  return Math.max(PIT.floorRl, rlAtBenchTop - drop);
}

/**
 * Conical pile surface (stockpile, waste dump), sitting on a pad cut to
 * `baseRl` and blended back into natural ground over an apron.
 */
const PILE_APRON_M = 25;

function coneSurface(
  e: number,
  n: number,
  cone: { centreE: number; centreN: number; baseRadius: number; height: number; baseRl: number },
): number | null {
  const r = Math.hypot(e - cone.centreE, n - cone.centreN);
  if (r > cone.baseRadius + PILE_APRON_M) return null;
  if (r <= cone.baseRadius) {
    // Slightly rounded crown rather than a sharp apex — closer to a real pile
    // and it keeps the surface differentiable for contouring.
    const t = 1 - r / cone.baseRadius;
    return cone.baseRl + cone.height * Math.pow(t, 1.35);
  }
  // Apron: the pad level returns to natural ground, so there is no cliff at the toe.
  const s = (r - cone.baseRadius) / PILE_APRON_M;
  return cone.baseRl + (naturalGround(e, n) - cone.baseRl) * s;
}

/**
 * Haul ramp: a descending spiral cut into the pit wall. Returns the ramp RL
 * when (e,n) lies on the ramp, otherwise null.
 */
function rampSurface(e: number, n: number): number | null {
  const dE = e - PIT.centreE;
  const dN = n - PIT.centreN;
  const r = Math.hypot(dE, dN);
  if (r > PIT.crestRadius + 5 || r < 40) return null;

  const azimuth = ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360;
  // Descent proportional to accumulated turn from the ramp entry.
  const turned = (azimuth - RAMP.startAzimuthDeg + 360) % 360;
  const arcLength = (turned / 360) * 2 * Math.PI * r;
  const rampRl = PIT.crestRl - arcLength * RAMP.gradient;
  if (rampRl < PIT.floorRl) return null;

  // The ramp sits where the wall is at that RL; accept a corridor around it.
  const targetRadius = pitRadiusAtRl(rampRl);
  if (Math.abs(r - targetRadius) > RAMP.widthM / 2) return null;
  return rampRl;
}

/**
 * ELEVATION OF THE SIMULATED GROUND SURFACE at a local-grid position.
 * RL in metres on the mine vertical datum.
 *
 * Every view in the application must call this function. Consistency between
 * the 3D view, plan view, profile and later derived products is a specification
 * requirement (§4: "the same physical feature must remain spatially consistent
 * between all views").
 */
export function terrainElevation(e: number, n: number): number {
  const r = Math.hypot(e - PIT.centreE, n - PIT.centreN);

  if (r <= PIT.crestRadius) {
    // Inside the crest the pit always wins; no pile is placed there.
    const ramp = rampSurface(e, n);
    return ramp ?? pitSurfaceAtRadius(r);
  }

  // A pile replaces the natural surface rather than sitting on top of it: its
  // pad may be cut into the ground as well as built up from it.
  const pile = coneSurface(e, n, STOCKPILE) ?? coneSurface(e, n, WASTE_DUMP);
  if (pile !== null) return pile;

  // Blend the crest into natural ground over 60 m so the rim is not a cliff.
  const ground = naturalGround(e, n);
  const blend = Math.min(1, (r - PIT.crestRadius) / 60);
  return PIT.crestRl + (ground - PIT.crestRl) * blend;
}

/** Sampled grid of the surface — used by the 3D mesh and the contour/plan views. */
export function sampleTerrainGrid(resolution = 12): {
  cols: number;
  rows: number;
  spacing: number;
  minRl: number;
  maxRl: number;
  /** Row-major: index = row * cols + col, row along +N, col along +E. */
  values: Float32Array;
} {
  const cols = Math.floor((MINE_EXTENT.eMax - MINE_EXTENT.eMin) / resolution) + 1;
  const rows = Math.floor((MINE_EXTENT.nMax - MINE_EXTENT.nMin) / resolution) + 1;
  const values = new Float32Array(cols * rows);
  let minRl = Infinity;
  let maxRl = -Infinity;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const rl = terrainElevation(
        MINE_EXTENT.eMin + col * resolution,
        MINE_EXTENT.nMin + row * resolution,
      );
      values[row * cols + col] = rl;
      if (rl < minRl) minRl = rl;
      if (rl > maxRl) maxRl = rl;
    }
  }
  return { cols, rows, spacing: resolution, minRl, maxRl, values };
}

/** Terrain profile along a straight line — the PROFILE view of §4. */
export function terrainProfile(
  from: { e: number; n: number },
  to: { e: number; n: number },
  samples = 240,
): Array<{ chainage: number; e: number; n: number; rl: number }> {
  const total = Math.hypot(to.e - from.e, to.n - from.n);
  const out: Array<{ chainage: number; e: number; n: number; rl: number }> = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const e = from.e + (to.e - from.e) * t;
    const n = from.n + (to.n - from.n) * t;
    out.push({ chainage: total * t, e, n, rl: terrainElevation(e, n) });
  }
  return out;
}

/**
 * Plan area and volume of the stockpile from the analytic model.
 * These are the "truth" values the processing labs will later be compared
 * against (§220 truth dataset) — the learner's measured volume should
 * approach, but will not exactly equal, this number.
 */
export function stockpileTruth(): { planAreaM2: number; volumeM3: number; tonnes: number } {
  // V = ∫0^R (h·(1−r/R)^1.35)·2πr dr  — evaluated numerically for clarity.
  const steps = 2000;
  const dr = STOCKPILE.baseRadius / steps;
  let volume = 0;
  for (let i = 0; i < steps; i++) {
    const r = (i + 0.5) * dr;
    const h = STOCKPILE.height * Math.pow(1 - r / STOCKPILE.baseRadius, 1.35);
    volume += h * 2 * Math.PI * r * dr;
  }
  const planArea = Math.PI * STOCKPILE.baseRadius ** 2;
  return {
    planAreaM2: planArea,
    volumeM3: volume,
    tonnes: volume * STOCKPILE.bulkDensityTm3,
  };
}
