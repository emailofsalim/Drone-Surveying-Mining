/**
 * ENGINE TESTS — Spec §216 (testing), §219 (data validation), §221 (formula audit).
 *
 * These assert the relationships the labs teach. If a formula changes, a
 * lesson changes, so the audit lives here rather than in a comment.
 */

import { describe, expect, it } from 'vitest';

import { convert, formatNumber, qty, UnitMismatchError, toBase } from '../src/engine/units/units';
import { registry } from '../src/data/formulas';
import {
  convertAzimuth,
  crabAngle,
  gridAzimuth,
  normalizeAzimuth,
  normalizeDelta,
  northConversionError,
  windTriangle,
} from '../src/engine/geodesy/north';
import {
  centralMeridian,
  combinedScaleFactor,
  geodeticToUtm,
  meridianConvergence,
  pointScaleFactor,
  utmToGeodetic,
  utmZoneFromLongitude,
  WGS84,
} from '../src/engine/geodesy/utm';
import {
  heightDifference,
  planeDistance,
  ReferenceMismatchError,
  sameCrs,
  type Coordinate,
  type CrsDescriptor,
} from '../src/engine/geodesy/coordinate';
import {
  ellipsoidalFromOrthometric,
  orthometricFromEllipsoidal,
  reduceRiseAndFall,
  resolveAltitude,
  trigonometricHeightDifference,
} from '../src/engine/geodesy/height';
import {
  forwardOverlap,
  gsdAtSurface,
  gsdFromPixelPitch,
  gsdFromSensor,
  heightForGsd,
  imageFootprint,
  imageSpacing,
  motionBlurPixels,
  pixelPitchMm,
  planMissionGeometry,
  spacingForOverlap,
} from '../src/engine/camera/gsd';
import { CAMERAS, cameraById } from '../src/data/cameras';
import { assessControl, combineRandom, errorBudget, rmse } from '../src/engine/qaqc/rmse';
import {
  MINE_EXTENT,
  PIT,
  STOCKPILE,
  sampleTerrainGrid,
  stockpileTruth,
  terrainElevation,
  terrainProfile,
  MINE_FEATURES,
  WASTE_DUMP,
} from '../src/data/mine';
import { prerequisiteChain, TOPICS, topicById } from '../src/data/knowledge-graph';

/* ------------------------------ units ------------------------------ */

describe('unit engine', () => {
  it('converts within a dimension', () => {
    expect(convert(qty(1, 'km'), 'm').value).toBeCloseTo(1000, 9);
    expect(convert(qty(1, 'ft'), 'm').value).toBeCloseTo(0.3048, 9);
    expect(convert(qty(180, 'deg'), 'rad').value).toBeCloseTo(Math.PI, 12);
    expect(convert(qty(36, 'km/h'), 'm/s').value).toBeCloseTo(10, 9);
    expect(convert(qty(1, 'ha'), 'm²').value).toBeCloseTo(10000, 9);
  });

  it('refuses a cross-dimension conversion instead of scaling silently', () => {
    expect(() => convert(qty(100, 'm'), 'deg')).toThrow(UnitMismatchError);
    expect(() => convert(qty(1, 'kg'), 'm³')).toThrow(UnitMismatchError);
  });

  it('round-trips through the SI base unit', () => {
    expect(toBase(qty(2.5, 'km'))).toBeCloseTo(2500, 9);
    expect(convert(convert(qty(123.456, 'm'), 'ft'), 'm').value).toBeCloseTo(123.456, 9);
  });

  it('formats numbers without leaving trailing zeros', () => {
    expect(formatNumber(49.5, 4)).toBe('49.5');
    expect(formatNumber(110, 4)).toBe('110');
    expect(formatNumber(0.030154, 6)).toBe('0.030154');
    expect(formatNumber(-1.2500, 3)).toBe('-1.25');
    expect(formatNumber(0, 3)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});

/* ---------------------------- formulas ----------------------------- */

describe('formula engine', () => {
  it('evaluates with substitution and dimensional analysis', () => {
    const result = registry.evaluate('gsd.sensor', {
      H: qty(100, 'm'),
      Sw: qty(13.2, 'mm'),
      f: qty(8.8, 'mm'),
      Wpx: qty(5472, 'px'),
    });
    expect(result.result.value).toBeCloseTo((100 * 13.2) / (8.8 * 5472), 12);
    expect(result.substitution).toContain('100');
    expect(result.dimensionalAnalysis).toContain('[length]');
    expect(result.steps.map((s) => s.label)).toEqual([
      'Formula',
      'Substitution',
      'Dimensional analysis',
      'Result',
    ]);
  });

  it('accepts inputs in any unit of the right dimension', () => {
    const metres = registry.evaluate('gsd.sensor', {
      H: qty(100, 'm'),
      Sw: qty(13.2, 'mm'),
      f: qty(8.8, 'mm'),
      Wpx: qty(5472, 'px'),
    });
    const feet = registry.evaluate('gsd.sensor', {
      H: qty(100 / 0.3048, 'ft'),
      Sw: qty(1.32, 'cm'),
      f: qty(8.8, 'mm'),
      Wpx: qty(5472, 'px'),
    });
    expect(feet.result.value).toBeCloseTo(metres.result.value, 10);
  });

  it('rejects an input whose unit is the wrong dimension', () => {
    expect(() =>
      registry.evaluate('height.hHN', { H: qty(500, 'm'), N: qty(46, 'deg') }),
    ).toThrow(UnitMismatchError);
  });

  it('every registered formula has assumptions, limitations and preconditions', () => {
    for (const formula of registry.all()) {
      expect(formula.assumptions.length, formula.id).toBeGreaterThan(0);
      expect(formula.limitations.length, formula.id).toBeGreaterThan(0);
      expect(formula.preconditions.length, formula.id).toBeGreaterThan(0);
      expect(formula.variables.length, formula.id).toBeGreaterThan(0);
    }
  });

  it('search finds formulas by title, variable and definition', () => {
    expect(registry.search('overlap').map((f) => f.id)).toContain('overlap.forward');
    expect(registry.search('geoid').map((f) => f.id)).toContain('height.hHN');
  });
});

/* ----------------------------- north ------------------------------- */

describe('north reference engine', () => {
  const ctx = { declinationDeg: -1.35, convergenceDeg: 0.5726 };

  it('applies True = Magnetic + D', () => {
    expect(convertAzimuth(47.5, 'magnetic', 'true', ctx)).toBeCloseTo(47.5 - 1.35, 10);
  });

  it('applies Grid = True − γ', () => {
    expect(convertAzimuth(47.5, 'true', 'grid', ctx)).toBeCloseTo(47.5 - 0.5726, 10);
  });

  it('chains magnetic → grid as Am + D − γ', () => {
    expect(convertAzimuth(47.5, 'magnetic', 'grid', ctx)).toBeCloseTo(47.5 - 1.35 - 0.5726, 10);
  });

  it('is reversible', () => {
    for (const az of [0, 12.5, 180, 270, 359.9]) {
      const grid = convertAzimuth(az, 'magnetic', 'grid', ctx);
      expect(convertAzimuth(grid, 'grid', 'magnetic', ctx)).toBeCloseTo(normalizeAzimuth(az), 9);
    }
  });

  it('normalises into range', () => {
    expect(normalizeAzimuth(-10)).toBeCloseTo(350, 10);
    expect(normalizeAzimuth(370)).toBeCloseTo(10, 10);
    expect(normalizeDelta(350)).toBeCloseTo(-10, 10);
    expect(normalizeDelta(190)).toBeCloseTo(-170, 10);
  });

  it('converts an angular error into a lateral displacement', () => {
    const err = northConversionError(47.5, 'grid', 'magnetic', ctx, 1000);
    // Using a magnetic azimuth as if it were grid: error = D − γ.
    expect(err.angularErrorDeg).toBeCloseTo(-(ctx.declinationDeg - ctx.convergenceDeg), 9);
    expect(Math.abs(err.lateralErrorM)).toBeCloseTo(
      1000 * Math.abs(Math.sin((err.angularErrorDeg * Math.PI) / 180)),
      9,
    );
  });

  it('computes a grid azimuth from coordinates', () => {
    expect(gridAzimuth({ e: 0, n: 0 }, { e: 100, n: 0 }).azimuthDeg).toBeCloseTo(90, 10);
    expect(gridAzimuth({ e: 0, n: 0 }, { e: 0, n: 100 }).azimuthDeg).toBeCloseTo(0, 10);
    expect(gridAzimuth({ e: 0, n: 0 }, { e: 100, n: 100 }).distanceM).toBeCloseTo(Math.hypot(100, 100), 10);
  });

  it('solves the wind triangle so the crab angle cancels the crosswind', () => {
    const solution = windTriangle(90, 12, 0, 4); // wind from grid north, flying east
    expect(solution.achievable).toBe(true);
    // Heading must be turned into the wind, i.e. north of the intended course.
    expect(solution.headingDeg).toBeLessThan(90);
    expect(crabAngle(solution.headingDeg, 90)).toBeCloseTo(solution.crabDeg, 9);
    // Cross-track component of the resulting track must be zero.
    const hdg = (solution.headingDeg * Math.PI) / 180;
    const vx = 12 * Math.sin(hdg) + 4 * Math.sin(Math.PI); // wind blows toward 180°
    const vy = 12 * Math.cos(hdg) + 4 * Math.cos(Math.PI);
    const track = normalizeAzimuth((Math.atan2(vx, vy) * 180) / Math.PI);
    expect(track).toBeCloseTo(90, 6);
  });

  it('reports an unachievable course when the crosswind exceeds the airspeed', () => {
    expect(windTriangle(90, 3, 0, 10).achievable).toBe(false);
  });
});

/* ------------------------------ UTM -------------------------------- */

describe('UTM engine', () => {
  it('selects the correct zone and central meridian', () => {
    expect(utmZoneFromLongitude(86.42)).toBe(45);
    expect(centralMeridian(45)).toBe(87);
    expect(utmZoneFromLongitude(-0.5)).toBe(30);
    expect(centralMeridian(31)).toBe(3);
  });

  it('round-trips geodetic → UTM → geodetic to sub-millimetre', () => {
    const cases = [
      [23.75, 86.42],
      [-33.87, 151.21],
      [51.5, -0.13],
      [0.0, 100.0],
      [60.0, 5.0],
    ] as const;
    for (const [lat, lon] of cases) {
      const utm = geodeticToUtm(lat, lon, WGS84);
      const back = utmToGeodetic(utm.easting, utm.northing, utm.zone, utm.hemisphere, WGS84);
      // 1e-8° ≈ 1.1 mm of latitude.
      expect(back.latDeg, `lat ${lat}`).toBeCloseTo(lat, 7);
      expect(back.lonDeg, `lon ${lon}`).toBeCloseTo(lon, 7);
    }
  });

  it('applies the false easting and the southern false northing', () => {
    const north = geodeticToUtm(10, 87, WGS84);
    expect(north.easting).toBeCloseTo(500000, 3); // on the central meridian
    expect(north.hemisphere).toBe('N');
    const south = geodeticToUtm(-10, 87, WGS84);
    expect(south.hemisphere).toBe('S');
    // Southern northings are measured down from a 10 000 000 m false origin, so
    // the two hemispheres are symmetric about it.
    expect(south.northing + north.northing).toBeCloseTo(10_000_000, 6);
    expect(south.northing).toBeGreaterThan(0);
    expect(south.northing).toBeLessThan(10_000_000);
  });

  it('gives zero convergence on the central meridian and grows away from it', () => {
    expect(meridianConvergence(23.75, 87, 45, WGS84)).toBeCloseTo(0, 9);
    const west = meridianConvergence(23.75, 84, 45, WGS84);
    const east = meridianConvergence(23.75, 90, 45, WGS84);
    expect(west).toBeLessThan(0);
    expect(east).toBeGreaterThan(0);
    // First-order approximation γ ≈ Δλ·sin φ.
    expect(east).toBeCloseTo(3 * Math.sin((23.75 * Math.PI) / 180), 2);
  });

  it('has k = k0 on the central meridian and k > 1 near the zone edge', () => {
    expect(pointScaleFactor(23.75, 87, 45, WGS84)).toBeCloseTo(0.9996, 9);
    expect(pointScaleFactor(23.75, 90, 45, WGS84)).toBeGreaterThan(1.0);
  });

  it('reduces the combined factor with elevation', () => {
    const k = pointScaleFactor(23.75, 86.42, 45, WGS84);
    expect(combinedScaleFactor(k, 0)).toBeCloseTo(k, 12);
    expect(combinedScaleFactor(k, 1000)).toBeLessThan(k);
  });
});

/* --------------------------- coordinates --------------------------- */

describe('coordinate engine', () => {
  const crsA: CrsDescriptor = {
    epsg: 'EPSG:32645',
    name: 'WGS 84 / UTM zone 45N',
    kind: 'projected',
    datum: 'WGS 84',
    ellipsoid: 'WGS 84',
    axisOrder: 'easting-northing',
    units: 'm',
    utmZone: 45,
    hemisphere: 'N',
  };
  const crsB: CrsDescriptor = { ...crsA, datum: 'Local site datum', epsg: undefined };

  const make = (crs: CrsDescriptor, z = 500): Coordinate => ({
    x: 450000,
    y: 2626000,
    z,
    crs,
    height: { type: 'orthometric', reference: 'EGM2008', units: 'm' },
    source: 'test',
    quality: 'test',
  });

  it('detects an identical frame', () => {
    expect(sameCrs(crsA, { ...crsA })).toBe(true);
    expect(sameCrs(crsA, crsB)).toBe(false);
  });

  it('refuses a distance across different frames', () => {
    expect(() => planeDistance(make(crsA), make(crsB))).toThrow(ReferenceMismatchError);
  });

  it('computes a distance within one frame', () => {
    const a = make(crsA);
    const b = { ...make(crsA), x: 450300, y: 2626400 };
    expect(planeDistance(a, b)).toBeCloseTo(500, 9);
  });

  it('refuses to difference heights of different types', () => {
    const a = make(crsA);
    const b: Coordinate = {
      ...make(crsA, 546),
      height: { type: 'ellipsoidal', reference: 'WGS 84 ellipsoid', units: 'm' },
    };
    expect(() => heightDifference(a, b)).toThrow(ReferenceMismatchError);
  });

  it('differences heights sharing a type and reference', () => {
    expect(heightDifference(make(crsA, 500), make(crsA, 512.5))).toBeCloseTo(12.5, 9);
  });
});

/* ------------------------------ height ----------------------------- */

describe('height engine', () => {
  it('satisfies h = H + N in both directions', () => {
    expect(ellipsoidalFromOrthometric(515.11, 46.31)).toBeCloseTo(561.42, 9);
    expect(orthometricFromEllipsoidal(561.42, 46.31)).toBeCloseTo(515.11, 9);
  });

  it('reduces a levelling run and passes all three arithmetic checks', () => {
    const result = reduceRiseAndFall(
      [
        { station: 'BM', backsight: 1.842 },
        { station: 'TP-1', intersight: 1.216 },
        { station: 'TP-2', foresight: 0.934, backsight: 2.105 },
        { station: 'TP-3', intersight: 1.688 },
        { station: 'END', foresight: 2.741 },
      ],
      500,
    );
    expect(result.checksPass).toBe(true);
    expect(result.sumBacksight - result.sumForesight).toBeCloseTo(
      result.sumRise - result.sumFall,
      9,
    );
    expect(result.lastRl - result.firstRl).toBeCloseTo(result.sumRise - result.sumFall, 9);
  });

  it('gives a horizontal sight zero height difference when HI equals HT', () => {
    expect(trigonometricHeightDifference(150, 90, 1.5, 1.5)).toBeCloseTo(0, 9);
  });

  it('propagates a target-height error directly into the height difference', () => {
    const correct = trigonometricHeightDifference(148.372, 87.4215, 1.512, 1.7);
    const wrong = trigonometricHeightDifference(148.372, 87.4215, 1.512, 2.0);
    expect(correct - wrong).toBeCloseTo(0.3, 9);
  });

  it('separates AGL from height above take-off over the pit', () => {
    const overFloor = resolveAltitude(100, 513, PIT.floorRl);
    expect(overFloor.agl).toBeCloseTo(513 + 100 - PIT.floorRl, 9);
    expect(overFloor.divergence).toBeCloseTo(513 - PIT.floorRl, 9);
    const overTakeoff = resolveAltitude(100, 513, 513);
    expect(overTakeoff.agl).toBeCloseTo(100, 9);
    expect(overTakeoff.divergence).toBeCloseTo(0, 9);
  });
});

/* ------------------------------ camera ----------------------------- */

describe('camera and mission geometry', () => {
  const camera = cameraById('cam-1inch-20mp');

  it('gives identical GSD from the sensor form and the pixel-pitch form', () => {
    for (const cam of CAMERAS) {
      for (const h of [40, 110, 300]) {
        expect(gsdFromPixelPitch(pixelPitchMm(cam), cam.focalLengthMm, h)).toBeCloseTo(
          gsdFromSensor(cam, h),
          12,
        );
      }
    }
  });

  it('scales GSD linearly with height', () => {
    expect(gsdFromSensor(camera, 200)).toBeCloseTo(2 * gsdFromSensor(camera, 100), 12);
  });

  it('inverts to the height needed for a target GSD', () => {
    const h = heightForGsd(camera, 0.02);
    expect(gsdFromSensor(camera, h)).toBeCloseTo(0.02, 12);
  });

  it('builds a footprint of GSD × pixel count', () => {
    const fp = imageFootprint(camera, 110);
    expect(fp.widthM).toBeCloseTo(fp.gsdM * camera.imageWidthPx, 9);
    expect(fp.lengthM).toBeCloseTo(fp.gsdM * camera.imageHeightPx, 9);
    expect(fp.areaM2).toBeCloseTo(fp.widthM * fp.lengthM, 6);
  });

  it('inverts overlap and spacing consistently', () => {
    const fp = imageFootprint(camera, 110);
    const spacing = spacingForOverlap(fp.lengthM, 0.8);
    expect(forwardOverlap(spacing, fp.lengthM)).toBeCloseTo(0.8, 12);
  });

  it('relates spacing to speed and trigger interval', () => {
    expect(imageSpacing(7, 2.5)).toBeCloseTo(17.5, 12);
  });

  it('produces a mission plan whose trigger interval reproduces the target overlap', () => {
    const plan = planMissionGeometry({
      camera,
      heightAboveSurfaceM: 110,
      targetForwardOverlap: 0.8,
      targetSideOverlap: 0.7,
      groundSpeedMs: 7,
      areaWidthM: 1000,
      areaLengthM: 1000,
    });
    expect(imageSpacing(7, plan.triggerIntervalS)).toBeCloseTo(plan.imageSpacingM, 9);
    expect(forwardOverlap(plan.imageSpacingM, plan.footprint.lengthM)).toBeCloseTo(0.8, 9);
    expect(plan.totalImages).toBe(plan.lineCount * plan.imagesPerLine);
    expect(plan.estimatedFlightTimeS).toBeCloseTo(plan.totalFlightDistanceM / 7, 9);
  });

  it('warns about overlap that is too low', () => {
    const plan = planMissionGeometry({
      camera,
      heightAboveSurfaceM: 110,
      targetForwardOverlap: 0.6,
      targetSideOverlap: 0.5,
      groundSpeedMs: 7,
      areaWidthM: 500,
      areaLengthM: 500,
    });
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('coarsens GSD over a surface below the planning surface', () => {
    const r = gsdAtSurface(camera, 110, PIT.crestRl, PIT.floorRl);
    expect(r.heightAboveActualM).toBeCloseTo(110 + (PIT.crestRl - PIT.floorRl), 9);
    expect(r.actualGsdM).toBeGreaterThan(r.plannedGsdM);
    expect(r.ratio).toBeCloseTo(r.actualGsdM / r.plannedGsdM, 12);
  });

  it('computes motion smear in pixels', () => {
    expect(motionBlurPixels(10, 0.002, 0.02)).toBeCloseTo(1, 12);
  });
});

/* ------------------------------ QA/QC ------------------------------ */

describe('QA/QC engine', () => {
  it('computes RMSE', () => {
    expect(rmse([3, 4])).toBeCloseTo(Math.sqrt(12.5), 12);
    expect(rmse([0, 0, 0])).toBeCloseTo(0, 12);
  });

  it('combines random errors in quadrature', () => {
    expect(combineRandom([0.03, 0.04])).toBeCloseTo(0.05, 12);
  });

  it('adds systematic errors directly and keeps them separate from random', () => {
    const budget = errorBudget([
      { source: 'a', sigmaM: 0.03, kind: 'random' },
      { source: 'b', sigmaM: 0.04, kind: 'random' },
      { source: 'bias', sigmaM: 0.03, kind: 'systematic' },
    ]);
    expect(budget.randomM).toBeCloseTo(0.05, 12);
    expect(budget.systematicM).toBeCloseTo(0.03, 12);
    expect(budget.totalM).toBeCloseTo(0.08, 12);
    expect(budget.dominant).toBe('b');
  });

  it('flags a result that fitted its own control but does not generalise', () => {
    const verdict = assessControl([
      {
        id: 'G1',
        role: 'gcp',
        surveyed: { e: 0, n: 0, z: 0 },
        modelled: { e: 0.005, n: -0.005, z: 0.004 },
      },
      {
        id: 'G2',
        role: 'gcp',
        surveyed: { e: 100, n: 0, z: 0 },
        modelled: { e: 100.004, n: 0.006, z: -0.003 },
      },
      {
        id: 'C1',
        role: 'check',
        surveyed: { e: 50, n: 50, z: 0 },
        modelled: { e: 50.21, n: 49.83, z: 0.12 },
      },
    ]);
    expect(verdict.generalisationRatio).toBeGreaterThan(2);
    expect(verdict.findings.join(' ')).toMatch(/does not predict independent points/);
  });

  it('flags a systematic vertical shift', () => {
    const verdict = assessControl([
      { id: 'G1', role: 'gcp', surveyed: { e: 0, n: 0, z: 0 }, modelled: { e: 0.01, n: 0.01, z: 0.2 } },
      { id: 'C1', role: 'check', surveyed: { e: 10, n: 0, z: 0 }, modelled: { e: 10.01, n: 0.01, z: 0.2 } },
      { id: 'C2', role: 'check', surveyed: { e: 0, n: 10, z: 0 }, modelled: { e: 0.01, n: 10.01, z: 0.2 } },
    ]);
    expect(verdict.findings.join(' ')).toMatch(/height-reference|systematic/i);
  });

  it('flags the absence of independent checkpoints', () => {
    const verdict = assessControl([
      { id: 'G1', role: 'gcp', surveyed: { e: 0, n: 0, z: 0 }, modelled: { e: 0.01, n: 0, z: 0 } },
    ]);
    expect(verdict.findings.join(' ')).toMatch(/No independent checkpoints/);
  });
});

/* --------------------------- virtual mine -------------------------- */

describe('virtual mine dataset', () => {
  it('is deterministic — the same position always returns the same RL', () => {
    for (const [e, n] of [
      [700, 700],
      [123.4, 987.6],
      [1400, 300],
    ] as const) {
      expect(terrainElevation(e, n)).toBe(terrainElevation(e, n));
    }
  });

  it('keeps the pit floor at or above the design floor RL', () => {
    expect(terrainElevation(PIT.centreE, PIT.centreN)).toBeGreaterThanOrEqual(PIT.floorRl - 1e-9);
  });

  it('descends from the crest toward the pit centre', () => {
    const atCrest = terrainElevation(PIT.centreE + PIT.crestRadius - 5, PIT.centreN);
    const inside = terrainElevation(PIT.centreE + PIT.crestRadius / 2, PIT.centreN);
    const floor = terrainElevation(PIT.centreE, PIT.centreN);
    expect(atCrest).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(floor);
  });

  it('raises the ground over the stockpile', () => {
    const crown = terrainElevation(STOCKPILE.centreE, STOCKPILE.centreN);
    const offPile = terrainElevation(
      STOCKPILE.centreE + STOCKPILE.baseRadius + 60,
      STOCKPILE.centreN,
    );
    expect(crown).toBeGreaterThan(offPile);
    expect(crown).toBeCloseTo(STOCKPILE.baseRl + STOCKPILE.height, 6);
  });

  it('stands both piles proud of the surrounding ground by their full height', () => {
    // Regression: a pad RL asserted below natural ground buries the pile, which
    // then produces no contours, no relief and no volume to measure.
    for (const pile of [STOCKPILE, WASTE_DUMP]) {
      const crown = terrainElevation(pile.centreE, pile.centreN);
      const toe = terrainElevation(pile.centreE + pile.baseRadius - 1, pile.centreN);
      const beyond = terrainElevation(pile.centreE + pile.baseRadius + 80, pile.centreN);
      expect(crown - toe).toBeGreaterThan(pile.height * 0.9);
      expect(crown - beyond).toBeGreaterThan(pile.height * 0.75);
    }
  });

  it('has no cliff at a pile toe', () => {
    // The apron must return the pad level to natural ground continuously.
    for (const pile of [STOCKPILE, WASTE_DUMP]) {
      let maxStep = 0;
      for (let r = pile.baseRadius - 10; r <= pile.baseRadius + 40; r += 1) {
        const a = terrainElevation(pile.centreE + r, pile.centreN);
        const b = terrainElevation(pile.centreE + r + 1, pile.centreN);
        maxStep = Math.max(maxStep, Math.abs(b - a));
      }
      // 1 m of plan distance must not produce more than a 2 m height step.
      expect(maxStep, `${pile.id} toe`).toBeLessThan(2);
    }
  });

  it('samples a grid covering the full extent with consistent bounds', () => {
    const grid = sampleTerrainGrid(20);
    expect(grid.cols).toBe(Math.floor((MINE_EXTENT.eMax - MINE_EXTENT.eMin) / 20) + 1);
    expect(grid.minRl).toBeLessThan(grid.maxRl);
    // The grid must agree with the function it was sampled from (§4).
    const row = 10;
    const col = 12;
    expect(grid.values[row * grid.cols + col]).toBeCloseTo(
      terrainElevation(MINE_EXTENT.eMin + col * 20, MINE_EXTENT.nMin + row * 20),
      4,
    );
  });

  it('produces a profile consistent with the terrain function', () => {
    const profile = terrainProfile({ e: 0, n: 700 }, { e: 1600, n: 700 }, 40);
    expect(profile).toHaveLength(41);
    expect(profile[0]!.chainage).toBeCloseTo(0, 9);
    expect(profile[40]!.chainage).toBeCloseTo(1600, 6);
    for (const p of profile) {
      expect(p.rl).toBeCloseTo(terrainElevation(p.e, p.n), 9);
    }
  });

  it('keeps GCPs and checkpoints disjoint and both populated', () => {
    const gcps = MINE_FEATURES.filter((f) => f.kind === 'gcp');
    const checks = MINE_FEATURES.filter((f) => f.kind === 'checkpoint');
    expect(gcps.length).toBeGreaterThan(3);
    expect(checks.length).toBeGreaterThan(2);
    expect(gcps.some((g) => checks.some((c) => c.id === g.id))).toBe(false);
  });

  it('gives the stockpile a truth volume consistent with its bounding cylinder', () => {
    const truth = stockpileTruth();
    const cylinder = Math.PI * STOCKPILE.baseRadius ** 2 * STOCKPILE.height;
    expect(truth.volumeM3).toBeGreaterThan(0);
    expect(truth.volumeM3).toBeLessThan(cylinder);
    expect(truth.planAreaM2).toBeCloseTo(Math.PI * STOCKPILE.baseRadius ** 2, 6);
    expect(truth.tonnes).toBeCloseTo(truth.volumeM3 * STOCKPILE.bulkDensityTm3, 6);
  });
});

/* -------------------------- knowledge graph ------------------------ */

describe('knowledge graph', () => {
  it('has no dangling prerequisites', () => {
    for (const topic of TOPICS) {
      for (const req of topic.requires) {
        expect(topicById(req), `${topic.id} requires ${req}`).toBeDefined();
      }
    }
  });

  it('has no dependency cycles', () => {
    for (const topic of TOPICS) {
      const chain = prerequisiteChain(topic.id);
      expect(chain.map((t) => t.id), topic.id).not.toContain(topic.id);
    }
  });

  it('gives every built topic a route', () => {
    for (const topic of TOPICS.filter((t) => t.status === 'built')) {
      if (topic.id === 'provenance') continue; // engine-level, no page of its own
      expect(topic.route, topic.id).toBeTruthy();
    }
  });

  it('gives every built topic the five required answers (§1)', () => {
    const exempt = new Set(['provenance', 'safety', 'formula-engine']);
    for (const topic of TOPICS.filter((t) => t.status === 'built' && !exempt.has(t.id))) {
      expect(topic.five, topic.id).toBeDefined();
    }
  });
});
