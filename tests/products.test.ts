/**
 * Point cloud, surface and volume engine tests — Spec §127–§148, Phases 28–30, 35.
 */

import { describe, expect, it } from 'vitest';

import {
  assessDensity,
  circularBoundary,
  classifyGround,
  clipToPolygon,
  generateCloud,
  pointInPolygon,
  polygonArea,
  removeOutliers,
  type CloudOptions,
} from '../src/engine/pointcloud/cloud';
import {
  computeVolume,
  contourSurface,
  differenceSurfaces,
  fitPlane,
  gridFromCloud,
  reconcile,
  sampleSurface,
  surfaceProfile,
  surfaceStats,
  type GridSurface,
} from '../src/engine/terrain/surfaces';
import { STOCKPILE, stockpileTruth, terrainElevation } from '../src/data/mine';

const PILE_BOUNDS = {
  eMin: STOCKPILE.centreE - 130,
  eMax: STOCKPILE.centreE + 130,
  nMin: STOCKPILE.centreN - 130,
  nMax: STOCKPILE.centreN + 130,
};

const baseCloudOptions: CloudOptions = {
  bounds: PILE_BOUNDS,
  densityPerM2: 2,
  noiseM: 0.02,
  vegetationCover: 0,
  vegetationHeightM: 0,
  outlierRate: 0,
  seed: 5,
};

describe('point cloud generation', () => {
  it('is deterministic for a fixed seed', () => {
    const a = generateCloud(baseCloudOptions);
    const b = generateCloud(baseCloudOptions);
    expect(a.points.length).toBe(b.points.length);
    expect(a.points[100]!.rl).toBeCloseTo(b.points[100]!.rl, 12);
  });

  it('produces roughly the requested density', () => {
    const cloud = generateCloud(baseCloudOptions);
    const area = (PILE_BOUNDS.eMax - PILE_BOUNDS.eMin) * (PILE_BOUNDS.nMax - PILE_BOUNDS.nMin);
    expect(cloud.points.length / area).toBeCloseTo(2, 1);
    expect(cloud.meanSpacingM).toBeCloseTo(1 / Math.sqrt(2), 6);
  });

  it('places clean ground points near the true terrain', () => {
    const cloud = generateCloud(baseCloudOptions);
    for (const point of cloud.points.slice(0, 200)) {
      expect(Math.abs(point.rl - point.trueGroundRl)).toBeLessThan(0.1);
      expect(point.trueGroundRl).toBeCloseTo(terrainElevation(point.e, point.n), 9);
    }
  });

  it('places vegetation above the ground it hides', () => {
    const cloud = generateCloud({ ...baseCloudOptions, vegetationCover: 0.4, vegetationHeightM: 3 });
    const veg = cloud.points.filter((p) => p.truth === 'vegetation');
    expect(veg.length).toBeGreaterThan(50);
    for (const point of veg.slice(0, 100)) {
      expect(point.rl).toBeGreaterThan(point.trueGroundRl);
    }
  });

  it('removes gross outliers while keeping the ground', () => {
    const cloud = generateCloud({ ...baseCloudOptions, outlierRate: 0.05 });
    const before = cloud.points.filter((p) => p.truth === 'noise').length;
    expect(before).toBeGreaterThan(0);
    const cleaned = removeOutliers(cloud, 2.5, 10);
    const after = cleaned.points.filter((p) => p.truth === 'noise').length;
    expect(after).toBeLessThan(before);
    expect(cleaned.points.length).toBeGreaterThan(cloud.points.length * 0.8);
  });
});

describe('classification', () => {
  it('separates ground from vegetation', () => {
    const cloud = generateCloud({ ...baseCloudOptions, vegetationCover: 0.35, vegetationHeightM: 4 });
    const result = classifyGround(cloud, { cellSizeM: 5, thresholdM: 0.6, slopeTolerance: 0.6 });
    expect(result.recall).toBeGreaterThan(0.75);
    expect(result.precision).toBeGreaterThan(0.75);
    expect(result.groundCount).toBeGreaterThan(0);
    expect(result.coverCount).toBeGreaterThan(0);
  });

  it('leaves contamination behind when the threshold is too permissive', () => {
    const cloud = generateCloud({ ...baseCloudOptions, vegetationCover: 0.35, vegetationHeightM: 4 });
    const strict = classifyGround(cloud, { cellSizeM: 5, thresholdM: 0.6, slopeTolerance: 0.6 });
    const loose = classifyGround(cloud, { cellSizeM: 5, thresholdM: 6, slopeTolerance: 0.6 });
    expect(loose.falsePositives).toBeGreaterThan(strict.falsePositives);
  });

  it('throws terrain away when the threshold is too aggressive on a slope', () => {
    // A large cell on a steep pit wall spans a lot of genuine relief.
    const wallBounds = { eMin: 900, eMax: 1060, nMin: 620, nMax: 780 };
    const cloud = generateCloud({ ...baseCloudOptions, bounds: wallBounds, vegetationCover: 0 });
    const tolerant = classifyGround(cloud, { cellSizeM: 30, thresholdM: 0.5, slopeTolerance: 1.2 });
    const harsh = classifyGround(cloud, { cellSizeM: 30, thresholdM: 0.5, slopeTolerance: 0 });
    expect(harsh.falseNegatives).toBeGreaterThan(tolerant.falseNegatives);
  });

  it('classifies everything as ground on bare, flat-cell terrain', () => {
    const cloud = generateCloud(baseCloudOptions);
    const result = classifyGround(cloud, { cellSizeM: 5, thresholdM: 1, slopeTolerance: 1 });
    expect(result.falsePositives).toBe(0);
    expect(result.recall).toBeGreaterThan(0.95);
  });
});

describe('density versus accuracy', () => {
  it('improves resolution with density', () => {
    const sparse = assessDensity(0.5, 0.03, 5);
    const dense = assessDensity(50, 0.03, 5);
    expect(dense.resolvableFeatureM).toBeLessThan(sparse.resolvableFeatureM);
    expect(dense.meanSpacingM).toBeLessThan(sparse.meanSpacingM);
  });

  it('averages random error only as the square root of density', () => {
    const a = assessDensity(4, 0.04, 5);
    const b = assessDensity(16, 0.04, 5);
    // Four times the density halves the surface sigma — not quarters it.
    expect(a.surfaceSigmaM / b.surfaceSigmaM).toBeCloseTo(2, 6);
  });

  it('states that density does nothing for systematic error', () => {
    expect(assessDensity(10, 0.03, 5).note).toMatch(/systematic/i);
  });
});

describe('boundaries', () => {
  it('computes polygon area by the shoelace formula', () => {
    const square = [
      { e: 0, n: 0 },
      { e: 10, n: 0 },
      { e: 10, n: 10 },
      { e: 0, n: 10 },
    ];
    expect(polygonArea(square)).toBeCloseTo(100, 9);
    expect(polygonArea(circularBoundary(0, 0, 50, 512))).toBeCloseTo(Math.PI * 2500, 0);
  });

  it('tests point containment', () => {
    const square = [
      { e: 0, n: 0 },
      { e: 10, n: 0 },
      { e: 10, n: 10 },
      { e: 0, n: 10 },
    ];
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, -1, square)).toBe(false);
  });

  it('clips a cloud to a boundary', () => {
    const cloud = generateCloud(baseCloudOptions);
    const boundary = circularBoundary(STOCKPILE.centreE, STOCKPILE.centreN, 60);
    const clipped = clipToPolygon(cloud, boundary);
    expect(clipped.points.length).toBeLessThan(cloud.points.length);
    for (const point of clipped.points) {
      expect(Math.hypot(point.e - STOCKPILE.centreE, point.n - STOCKPILE.centreN)).toBeLessThan(61);
    }
  });
});

describe('surfaces', () => {
  const cloud = generateCloud({ ...baseCloudOptions, densityPerM2: 4 });

  it('grids a cloud and records the supporting evidence per cell', () => {
    const surface = gridFromCloud(cloud, {
      kind: 'DSM',
      cellSizeM: 4,
      bounds: PILE_BOUNDS,
      aggregate: 'mean',
      searchRadiusCells: 0,
    });
    const stats = surfaceStats(surface);
    expect(surface.cols).toBe(65);
    expect(stats.cells).toBe(surface.cols * surface.rows);
    expect(stats.noDataCells).toBeLessThan(stats.cells * 0.05);
    expect(surface.support.some((s) => s > 0)).toBe(true);
  });

  it('leaves gaps as no-data when no search radius is given', () => {
    const sparse = generateCloud({ ...baseCloudOptions, densityPerM2: 0.01, seed: 9 });
    const surface = gridFromCloud(sparse, {
      kind: 'DSM',
      cellSizeM: 2,
      bounds: PILE_BOUNDS,
      aggregate: 'mean',
      searchRadiusCells: 0,
    });
    expect(surfaceStats(surface).noDataCells).toBeGreaterThan(0);
    expect(surface.method).toMatch(/no-data/);
  });

  it('fills gaps by inverse-distance weighting when asked', () => {
    const sparse = generateCloud({ ...baseCloudOptions, densityPerM2: 0.02, seed: 9 });
    const open = gridFromCloud(sparse, {
      kind: 'DSM', cellSizeM: 2, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 0,
    });
    const filled = gridFromCloud(sparse, {
      kind: 'DSM', cellSizeM: 2, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 6,
    });
    expect(surfaceStats(filled).noDataCells).toBeLessThan(surfaceStats(open).noDataCells);
    expect(surfaceStats(filled).interpolatedCells).toBeGreaterThan(0);
    expect(filled.method).toMatch(/inverse-distance/);
  });

  it('follows the terrain it was built from', () => {
    const surface = gridFromCloud(cloud, {
      kind: 'DSM', cellSizeM: 4, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 2,
    });
    const e = STOCKPILE.centreE + 20;
    const n = STOCKPILE.centreN + 12;
    expect(sampleSurface(surface, e, n)).toBeCloseTo(terrainElevation(e, n), 0);
  });

  it('carries its own kind so a DSM cannot be mislabelled a DTM', () => {
    const dsm = gridFromCloud(cloud, {
      kind: 'DSM', cellSizeM: 4, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 2,
    });
    expect(dsm.kind).toBe('DSM');
    const dtm = gridFromCloud(cloud, {
      kind: 'DTM', cellSizeM: 4, bounds: PILE_BOUNDS, aggregate: 'min', searchRadiusCells: 2,
      classes: ['ground'],
    });
    expect(dtm.kind).toBe('DTM');
  });

  it('puts a DSM above a DTM wherever vegetation stands', () => {
    const vegetated = generateCloud({
      ...baseCloudOptions, densityPerM2: 4, vegetationCover: 0.5, vegetationHeightM: 5, seed: 13,
    });
    const classified = classifyGround(vegetated, { cellSizeM: 5, thresholdM: 0.6, slopeTolerance: 0.6 });

    const dsm = gridFromCloud(classified.cloud, {
      kind: 'DSM', cellSizeM: 5, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 3,
    });
    const dtm = gridFromCloud(classified.cloud, {
      kind: 'DTM', cellSizeM: 5, bounds: PILE_BOUNDS, aggregate: 'min', searchRadiusCells: 3,
      classes: ['ground'],
    });
    expect(surfaceStats(dsm).mean).toBeGreaterThan(surfaceStats(dtm).mean);
  });

  it('profiles a surface along a line', () => {
    const surface = gridFromCloud(cloud, {
      kind: 'DSM', cellSizeM: 4, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 2,
    });
    const profile = surfaceProfile(
      surface,
      { e: PILE_BOUNDS.eMin + 10, n: STOCKPILE.centreN },
      { e: PILE_BOUNDS.eMax - 10, n: STOCKPILE.centreN },
      50,
    );
    expect(profile).toHaveLength(51);
    expect(profile[0]!.chainage).toBeCloseTo(0, 9);
    // The pile crown is higher than either end of the line.
    const crown = profile[25]!.rl;
    expect(crown).toBeGreaterThan(profile[0]!.rl);
  });

  it('contours a surface and skips no-data cells', () => {
    const surface = gridFromCloud(cloud, {
      kind: 'DSM', cellSizeM: 4, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 2,
    });
    const stats = surfaceStats(surface);
    const level = (stats.min + stats.max) / 2;
    const segments = contourSurface(surface, level);
    expect(segments.length).toBeGreaterThan(10);
    // A level above the whole surface yields nothing.
    expect(contourSurface(surface, stats.max + 50)).toHaveLength(0);
  });

  it('fits a least-squares plane', () => {
    const plane = fitPlane([
      { e: 0, n: 0, z: 10 },
      { e: 10, n: 0, z: 20 },
      { e: 0, n: 10, z: 15 },
      { e: 10, n: 10, z: 25 },
    ]);
    expect(plane.a).toBeCloseTo(1, 6);
    expect(plane.b).toBeCloseTo(0.5, 6);
    expect(plane.c).toBeCloseTo(10, 6);
  });
});

describe('surface difference and cut/fill', () => {
  function flatSurface(rl: number, kind: GridSurface['kind'] = 'DTM'): GridSurface {
    const cols = 10;
    const rows = 10;
    return {
      kind, eMin: 0, nMin: 0, cellSizeM: 5, cols, rows,
      values: new Float64Array(cols * rows).fill(rl),
      support: new Int32Array(cols * rows).fill(1),
      method: 'test fixture',
    };
  }

  it('reports fill where the newer surface is higher', () => {
    const result = differenceSurfaces(flatSurface(512), flatSurface(510));
    expect(result.fillVolumeM3).toBeCloseTo(2 * 100 * 25, 6);
    expect(result.cutVolumeM3).toBeCloseTo(0, 9);
    expect(result.netVolumeM3).toBeCloseTo(5000, 6);
  });

  it('reports cut where the newer surface is lower', () => {
    const result = differenceSurfaces(flatSurface(508), flatSurface(510));
    expect(result.cutVolumeM3).toBeCloseTo(5000, 6);
    expect(result.netVolumeM3).toBeCloseTo(-5000, 6);
  });

  it('classifies a small difference as no change within the band', () => {
    const result = differenceSurfaces(flatSurface(510.02), flatSurface(510), 0.05);
    expect(result.noChangeAreaM2).toBeCloseTo(100 * 25, 6);
    expect(result.fillVolumeM3).toBeCloseTo(0, 9);
  });

  it('refuses to difference surfaces on mismatched grids', () => {
    const a = flatSurface(510);
    const b = { ...flatSurface(510), cellSizeM: 10 };
    expect(() => differenceSurfaces(a, b)).toThrow(/share a grid/i);
  });

  it('excludes cells where either surface has no data', () => {
    const a = flatSurface(512);
    const b = flatSurface(510);
    b.values[0] = Number.NaN;
    const result = differenceSurfaces(a, b);
    expect(result.unusableCells).toBe(1);
    expect(result.fillVolumeM3).toBeCloseTo(2 * 99 * 25, 6);
  });
});

describe('volume', () => {
  const cloud = generateCloud({
    bounds: PILE_BOUNDS, densityPerM2: 6, noiseM: 0.015,
    vegetationCover: 0, vegetationHeightM: 0, outlierRate: 0, seed: 31,
  });
  const surface = gridFromCloud(cloud, {
    kind: 'DTM', cellSizeM: 2, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 3,
  });
  const boundary = circularBoundary(STOCKPILE.centreE, STOCKPILE.centreN, STOCKPILE.baseRadius);

  it('recovers the analytic truth volume within a few percent', () => {
    const truth = stockpileTruth();
    const result = computeVolume({
      surface, boundary, base: { type: 'plane', rl: STOCKPILE.baseRl }, method: 'grid-prism',
    });
    const error = Math.abs(result.volumeM3 - truth.volumeM3) / truth.volumeM3;
    expect(error).toBeLessThan(0.05);
  });

  it('always reports its full methodology', () => {
    const result = computeVolume({
      surface, boundary, base: { type: 'plane', rl: STOCKPILE.baseRl }, method: 'grid-prism',
    });
    expect(result.methodology.surfaceKind).toBe('DTM');
    expect(result.methodology.base).toMatch(/plane at RL/);
    expect(result.methodology.boundaryVertices).toBe(boundary.length);
    expect(result.methodology.units).toBe('m³');
    expect(result.methodology.surfaceMethod.length).toBeGreaterThan(5);
  });

  it('changes the answer when the base changes', () => {
    const onPlane = computeVolume({
      surface, boundary, base: { type: 'plane', rl: STOCKPILE.baseRl }, method: 'grid-prism',
    });
    const onFit = computeVolume({
      surface, boundary, base: { type: 'best-fit-plane' }, method: 'grid-prism',
    });
    const onLowest = computeVolume({
      surface, boundary, base: { type: 'lowest-perimeter' }, method: 'grid-prism',
    });
    expect(onFit.volumeM3).not.toBeCloseTo(onPlane.volumeM3, 0);
    expect(onLowest.volumeM3).toBeGreaterThan(onFit.volumeM3 * 0.5);
  });

  it('warns when a DSM is used as if it were terrain', () => {
    const dsm = { ...surface, kind: 'DSM' as const };
    const result = computeVolume({
      surface: dsm, boundary, base: { type: 'plane', rl: STOCKPILE.baseRl }, method: 'grid-prism',
    });
    expect(result.warnings.join(' ')).toMatch(/DSM/);
  });

  it('warns and reports the gap when coverage is missing', () => {
    const holed = { ...surface, values: Float64Array.from(surface.values) };
    for (let i = 0; i < 400; i++) holed.values[i + 2000] = Number.NaN;
    const result = computeVolume({
      surface: holed, boundary, base: { type: 'plane', rl: STOCKPILE.baseRl }, method: 'grid-prism',
    });
    expect(result.missingCells).toBeGreaterThan(0);
    expect(result.missingAreaM2).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toMatch(/no supporting data/i);
  });

  it('overstates the volume when vegetation is left in the surface', () => {
    const vegetated = generateCloud({
      bounds: PILE_BOUNDS, densityPerM2: 6, noiseM: 0.015,
      vegetationCover: 0.5, vegetationHeightM: 4, outlierRate: 0, seed: 31,
    });
    const dsm = gridFromCloud(vegetated, {
      kind: 'DSM', cellSizeM: 2, bounds: PILE_BOUNDS, aggregate: 'mean', searchRadiusCells: 3,
    });
    const contaminated = computeVolume({
      surface: dsm, boundary, base: { type: 'plane', rl: STOCKPILE.baseRl }, method: 'grid-prism',
    });
    const clean = computeVolume({
      surface, boundary, base: { type: 'plane', rl: STOCKPILE.baseRl }, method: 'grid-prism',
    });
    expect(contaminated.volumeM3).toBeGreaterThan(clean.volumeM3);
  });
});

describe('reconciliation', () => {
  it('propagates volume and density uncertainty in quadrature', () => {
    const result = reconcile({
      surveyVolumeM3: 100000,
      volumeSigmaM3: 3000,
      bulkDensityTm3: 1.62,
      densitySigmaTm3: 0.08,
    });
    expect(result.tonnes).toBeCloseTo(162000, 6);
    const expectedRel = Math.hypot(3000 / 100000, 0.08 / 1.62);
    expect(result.tonnesSigma).toBeCloseTo(162000 * expectedRel, 3);
    expect(result.volumeContribution + result.densityContribution).toBeCloseTo(1, 9);
  });

  it('names whichever term dominates the uncertainty', () => {
    const densityLed = reconcile({
      surveyVolumeM3: 100000, volumeSigmaM3: 500, bulkDensityTm3: 1.6, densitySigmaTm3: 0.2,
    });
    expect(densityLed.densityContribution).toBeGreaterThan(densityLed.volumeContribution);
    expect(densityLed.notes.join(' ')).toMatch(/density dominates/i);

    const volumeLed = reconcile({
      surveyVolumeM3: 100000, volumeSigmaM3: 12000, bulkDensityTm3: 1.6, densitySigmaTm3: 0.01,
    });
    expect(volumeLed.notes.join(' ')).toMatch(/survey volume dominates/i);
  });

  it('reconciles a record within twice the combined uncertainty', () => {
    const close = reconcile({
      surveyVolumeM3: 100000, volumeSigmaM3: 3000, bulkDensityTm3: 1.62,
      densitySigmaTm3: 0.08, recordedTonnes: 165000,
    });
    expect(close.reconciles).toBe(true);

    const far = reconcile({
      surveyVolumeM3: 100000, volumeSigmaM3: 1000, bulkDensityTm3: 1.62,
      densitySigmaTm3: 0.01, recordedTonnes: 195000,
    });
    expect(far.reconciles).toBe(false);
    expect(far.notes.join(' ')).toMatch(/exceeds twice/i);
  });

  it('never converts volume to tonnage without stating the caveat', () => {
    const result = reconcile({
      surveyVolumeM3: 1000, volumeSigmaM3: 10, bulkDensityTm3: 1.5, densitySigmaTm3: 0.05,
    });
    expect(result.notes.join(' ')).toMatch(/different quantities/i);
  });
});
