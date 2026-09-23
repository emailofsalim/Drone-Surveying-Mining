/**
 * Photogrammetry engine tests — Spec §115–§127, Phases 25–27.
 * These assert the geometry, not the appearance: if projection, triangulation
 * or the adjustment changes behaviour, a lesson has changed.
 */

import { describe, expect, it } from 'vitest';

import {
  analyseNetwork,
  backProject,
  bundleAdjust,
  detectorYield,
  intrinsicsFromCamera,
  matchKeypoints,
  project,
  reprojectionResiduals,
  rmsReprojectionPx,
  triangulate,
  type Keypoint,
  type Observation,
  type ObjectPoint,
  type Pose,
} from '../src/engine/photogrammetry/photogrammetry';
import { buildBlock, nadirPose, scoreBlock, NADIR_PITCH_DEG } from '../src/engine/photogrammetry/block';
import { flyMission, type MissionPlan } from '../src/engine/flight/mission';
import { cameraById } from '../src/data/cameras';
import { v3 } from '../src/engine/sensors/imu';
import { MINE_FEATURES, terrainElevation } from '../src/data/mine';

const camera = cameraById('cam-1inch-20mp');
const intrinsics = intrinsicsFromCamera(
  camera.sensorWidthMm,
  camera.focalLengthMm,
  camera.imageWidthPx,
  camera.imageHeightPx,
);

describe('collinearity and projection', () => {
  it('derives focal length in pixels from sensor geometry', () => {
    expect(intrinsics.focalPx).toBeCloseTo((8.8 * 5472) / 13.2, 9);
    expect(intrinsics.cx).toBeCloseTo(5472 / 2, 12);
  });

  it('projects a point directly below a nadir camera to the principal point', () => {
    const pose = nadirPose('A', v3(700, 700, 600), 0);
    const p = project(v3(700, 700, 500), pose, intrinsics)!;
    expect(p).not.toBeNull();
    expect(p.x).toBeCloseTo(intrinsics.cx, 6);
    expect(p.y).toBeCloseTo(intrinsics.cy, 6);
    expect(p.depth).toBeCloseTo(100, 6);
  });

  it('confirms the nadir pitch convention points the optical axis down', () => {
    const pose = nadirPose('A', v3(0, 0, 100), 0);
    // A point below is visible; a point above is behind the camera.
    expect(project(v3(0, 0, 0), pose, intrinsics)).not.toBeNull();
    expect(project(v3(0, 0, 200), pose, intrinsics)).toBeNull();
    expect(NADIR_PITCH_DEG).toBe(90);
  });

  it('moves the image point linearly with ground offset at fixed height', () => {
    const pose = nadirPose('A', v3(0, 0, 100), 0);
    const near = project(v3(5, 0, 0), pose, intrinsics)!;
    const far = project(v3(10, 0, 0), pose, intrinsics)!;
    const d1 = Math.hypot(near.x - intrinsics.cx, near.y - intrinsics.cy);
    const d2 = Math.hypot(far.x - intrinsics.cx, far.y - intrinsics.cy);
    expect(d2 / d1).toBeCloseTo(2, 6);
  });

  it('halves the image displacement when the flying height doubles', () => {
    const low = project(v3(10, 0, 0), nadirPose('A', v3(0, 0, 100), 0), intrinsics)!;
    const high = project(v3(10, 0, 0), nadirPose('A', v3(0, 0, 200), 0), intrinsics)!;
    const dLow = Math.hypot(low.x - intrinsics.cx, low.y - intrinsics.cy);
    const dHigh = Math.hypot(high.x - intrinsics.cx, high.y - intrinsics.cy);
    expect(dLow / dHigh).toBeCloseTo(2, 6);
  });

  it('rejects points outside the frame', () => {
    const pose = nadirPose('A', v3(0, 0, 100), 0);
    expect(project(v3(5000, 0, 0), pose, intrinsics)).toBeNull();
  });

  it('back-projects an image point onto the ray that produced it', () => {
    const pose = nadirPose('A', v3(0, 0, 120), 35);
    const truth = v3(14, -9, 0);
    const image = project(truth, pose, intrinsics)!;
    const ray = backProject(image.x, image.y, pose, intrinsics);

    // Walk the ray to the truth's elevation and confirm it lands on the point.
    const t = (truth.z - ray.origin.z) / ray.direction.z;
    expect(ray.origin.x + ray.direction.x * t).toBeCloseTo(truth.x, 5);
    expect(ray.origin.y + ray.direction.y * t).toBeCloseTo(truth.y, 5);
  });
});

describe('triangulation', () => {
  it('intersects two clean rays exactly at the object point', () => {
    const truth = v3(12, 7, 500);
    const a = nadirPose('A', v3(0, 0, 620), 0);
    const b = nadirPose('B', v3(60, 0, 620), 0);
    const ia = project(truth, a, intrinsics)!;
    const ib = project(truth, b, intrinsics)!;

    const result = triangulate([
      backProject(ia.x, ia.y, a, intrinsics),
      backProject(ib.x, ib.y, b, intrinsics),
    ])!;

    expect(result.position.x).toBeCloseTo(truth.x, 5);
    expect(result.position.y).toBeCloseTo(truth.y, 5);
    expect(result.position.z).toBeCloseTo(truth.z, 5);
    expect(result.rmsResidualM).toBeCloseTo(0, 6);
    expect(result.wellConditioned).toBe(true);
  });

  it('needs at least two rays', () => {
    const a = nadirPose('A', v3(0, 0, 620), 0);
    expect(triangulate([backProject(100, 100, a, intrinsics)])).toBeNull();
  });

  it('improves with a third ray when observations are noisy', () => {
    const truth = v3(5, -3, 500);
    // Stations kept inside the frame: at 120 m above the point the along-E
    // half-field is (3648/2)·120/f ≈ 60 m, so ±45 m is comfortably visible.
    const poses = [
      nadirPose('A', v3(-45, 0, 620), 0),
      nadirPose('B', v3(45, 0, 620), 0),
      nadirPose('C', v3(0, 45, 620), 0),
    ];
    const noise = [1.5, -1.2, 0.9];
    const rays = poses.map((p, i) => {
      const img = project(truth, p, intrinsics)!;
      return backProject(img.x + noise[i]!, img.y - noise[i]!, p, intrinsics);
    });

    const two = triangulate(rays.slice(0, 2))!;
    const three = triangulate(rays)!;
    const err = (r: typeof two) =>
      Math.hypot(r.position.x - truth.x, r.position.y - truth.y, r.position.z - truth.z);
    expect(three.rayCount).toBe(3);
    expect(err(three)).toBeLessThan(err(two));
  });

  it('flags a weak intersection when the rays are nearly parallel', () => {
    const truth = v3(0, 0, 500);
    // Two camera stations almost on top of each other: no baseline, no geometry.
    const a = nadirPose('A', v3(0, 0, 620), 0);
    const b = nadirPose('B', v3(0.4, 0, 620), 0);
    const ia = project(truth, a, intrinsics)!;
    const ib = project(truth, b, intrinsics)!;
    const result = triangulate([
      backProject(ia.x, ia.y, a, intrinsics),
      backProject(ib.x, ib.y, b, intrinsics),
    ])!;
    expect(result.wellConditioned).toBe(false);
  });

  it('reports non-zero ray residuals when the rays do not meet', () => {
    const a = nadirPose('A', v3(-50, 0, 620), 0);
    const b = nadirPose('B', v3(50, 0, 620), 0);
    const ia = project(v3(0, 0, 500), a, intrinsics)!;
    const ib = project(v3(0, 6, 500), b, intrinsics)!;
    const result = triangulate([
      backProject(ia.x, ia.y, a, intrinsics),
      backProject(ib.x, ib.y, b, intrinsics),
    ])!;
    expect(result.rmsResidualM).toBeGreaterThan(0.1);
  });
});

describe('reprojection error', () => {
  it('is zero for a perfect solution and grows with the mismatch', () => {
    const pose = nadirPose('A', v3(0, 0, 620), 0);
    const truth = v3(10, 5, 500);
    const image = project(truth, pose, intrinsics)!;

    const poses = new Map<string, Pose>([['A', pose]]);
    const exact = new Map<string, ObjectPoint>([
      ['P1', { id: 'P1', role: 'tie', position: truth }],
    ]);
    const shifted = new Map<string, ObjectPoint>([
      ['P1', { id: 'P1', role: 'tie', position: v3(10.5, 5, 500) }],
    ]);
    const obs: Observation[] = [{ poseId: 'A', pointId: 'P1', x: image.x, y: image.y }];

    expect(rmsReprojectionPx(reprojectionResiduals(obs, poses, exact, intrinsics))).toBeCloseTo(0, 6);
    expect(rmsReprojectionPx(reprojectionResiduals(obs, poses, shifted, intrinsics))).toBeGreaterThan(5);
  });

  it('computes the residual magnitude as the Euclidean norm', () => {
    const pose = nadirPose('A', v3(0, 0, 620), 0);
    const truth = v3(0, 0, 500);
    const image = project(truth, pose, intrinsics)!;
    const residuals = reprojectionResiduals(
      [{ poseId: 'A', pointId: 'P1', x: image.x + 3, y: image.y + 4 }],
      new Map([['A', pose]]),
      new Map([['P1', { id: 'P1', role: 'tie', position: truth }]]),
      intrinsics,
    );
    expect(residuals[0]!.magnitudePx).toBeCloseTo(5, 6);
  });
});

describe('keypoints, matching and the image network', () => {
  it('collapses detector yield with blur and glare', () => {
    expect(detectorYield({ texture: 1, blurPx: 0, glare: 0 })).toBeCloseTo(1, 6);
    expect(detectorYield({ texture: 1, blurPx: 3, glare: 0 })).toBeLessThan(0.3);
    expect(detectorYield({ texture: 1, blurPx: 0, glare: 1 })).toBeCloseTo(0, 6);
    // Water and fresh muck return no texture at all (§241).
    expect(detectorYield({ texture: 0, blurPx: 0, glare: 0 })).toBeCloseTo(0, 6);
  });

  it('distinguishes a keypoint from a tie point (§119)', () => {
    // Three keypoints, but only one feature is seen in two images.
    const keypoints: Keypoint[] = [
      { poseId: 'A', x: 1, y: 1, strength: 1, truePointId: 'P1' },
      { poseId: 'B', x: 2, y: 2, strength: 1, truePointId: 'P1' },
      { poseId: 'A', x: 3, y: 3, strength: 1, truePointId: 'P2' },
    ];
    const result = matchKeypoints(keypoints, { texture: 0.9, blurPx: 0, glare: 0 });
    expect(result.keypointCount).toBe(3);
    expect(result.tiePointCount).toBe(1);
    expect(result.multiRayCount).toBe(0);
  });

  it('raises the wrong-match rate as texture falls and blur rises', () => {
    const keypoints: Keypoint[] = [];
    for (let p = 0; p < 60; p++) {
      for (const poseId of ['A', 'B', 'C']) {
        keypoints.push({ poseId, x: p, y: p, strength: 1, truePointId: `P${p}` });
      }
    }
    const good = matchKeypoints(keypoints, { texture: 0.95, blurPx: 0.2, glare: 0 }, 4);
    const bad = matchKeypoints(keypoints, { texture: 0.25, blurPx: 2.5, glare: 0 }, 4);
    expect(bad.outlierRate).toBeGreaterThan(good.outlierRate);
    expect(good.multiRayCount).toBe(60);
  });

  it('detects a split image network', () => {
    // Two clusters sharing nothing: alignment can "succeed" per-half and still
    // leave the halves at a relative offset (§121).
    const obs: Observation[] = [];
    for (let p = 0; p < 12; p++) {
      obs.push({ poseId: 'A', pointId: `L${p}`, x: 0, y: 0 });
      obs.push({ poseId: 'B', pointId: `L${p}`, x: 0, y: 0 });
      obs.push({ poseId: 'C', pointId: `R${p}`, x: 0, y: 0 });
      obs.push({ poseId: 'D', pointId: `R${p}`, x: 0, y: 0 });
    }
    const analysis = analyseNetwork(obs, 8);
    expect(analysis.connected).toBe(false);
    expect(analysis.components).toBe(2);
  });

  it('reports a fully connected network as connected with no weak nodes', () => {
    const obs: Observation[] = [];
    for (let p = 0; p < 20; p++) {
      for (const poseId of ['A', 'B', 'C']) {
        obs.push({ poseId, pointId: `P${p}`, x: 0, y: 0 });
      }
    }
    const analysis = analyseNetwork(obs, 8);
    expect(analysis.connected).toBe(true);
    expect(analysis.weakNodes).toHaveLength(0);
    expect(analysis.edges).toHaveLength(3);
  });

  it('flags an image joined to the block by too few points', () => {
    const obs: Observation[] = [];
    for (let p = 0; p < 20; p++) {
      obs.push({ poseId: 'A', pointId: `P${p}`, x: 0, y: 0 });
      obs.push({ poseId: 'B', pointId: `P${p}`, x: 0, y: 0 });
    }
    obs.push({ poseId: 'WEAK', pointId: 'P0', x: 0, y: 0 });
    obs.push({ poseId: 'WEAK', pointId: 'P1', x: 0, y: 0 });
    const analysis = analyseNetwork(obs, 8);
    expect(analysis.weakNodes).toContain('WEAK');
  });
});

describe('bundle adjustment', () => {
  const plan: MissionPlan = {
    aoi: { eMin: 600, eMax: 850, nMin: 600, nMax: 850 },
    camera,
    heightAboveTakeoffM: 160,
    takeoffRl: 513,
    forwardOverlap: 0.8,
    sideOverlap: 0.7,
    airspeedMs: 7,
    lineAzimuthDeg: 0,
    terrainFollowing: true,
    windFromDeg: 0,
    windSpeedMs: 0,
    turnAllowanceS: 8,
  };

  const control = MINE_FEATURES.filter((f) => f.kind === 'gcp').map((f) => ({
    id: f.id,
    e: f.e,
    n: f.n,
    rl: f.rl ?? terrainElevation(f.e, f.n),
  }));
  const checks = MINE_FEATURES.filter((f) => f.kind === 'checkpoint').map((f) => ({
    id: f.id,
    e: f.e,
    n: f.n,
    rl: f.rl ?? terrainElevation(f.e, f.n),
  }));

  function makeBlock(overrides: Partial<Parameters<typeof buildBlock>[1]> = {}) {
    const flight = flyMission(plan);
    return buildBlock(flight.images.slice(0, 12), {
      camera,
      pointCount: 40,
      imageNoisePx: 0.3,
      poseNoiseM: 0.8,
      pointNoiseM: 1.5,
      controlPoints: control,
      checkPoints: checks,
      seed: 21,
      ...overrides,
    });
  }

  it('builds a solvable block with multi-ray tie points', () => {
    const block = makeBlock();
    expect(block.observations.length).toBeGreaterThan(50);
    expect(block.meanRaysPerPoint).toBeGreaterThan(1);
    expect(block.truthPoses.size).toBe(12);
  });

  it('reduces the reprojection error', () => {
    const block = makeBlock();
    const result = bundleAdjust(
      block.initialPoses,
      block.initialPoints,
      block.observations,
      block.controlTruth,
      { intrinsics: block.intrinsics, controlWeight: 40, iterations: 12, damping: 1e-6, fixPoses: true },
    );
    expect(result.finalRmsPx).toBeLessThan(result.initialRmsPx);
    expect(result.history.length).toBeGreaterThan(1);
  });

  it('moves tie points toward their true positions', () => {
    const block = makeBlock();
    const before = scoreBlock(block.initialPoints, block.truthPoints);
    const result = bundleAdjust(
      block.initialPoses,
      block.initialPoints,
      block.observations,
      block.controlTruth,
      { intrinsics: block.intrinsics, controlWeight: 40, iterations: 15, damping: 1e-6, fixPoses: true },
    );
    const after = scoreBlock(result.points, block.truthPoints);
    expect(after.tieRmseM).toBeLessThan(before.tieRmseM);
  });

  it('never lets a checkpoint influence the solution', () => {
    const block = makeBlock();
    const before = new Map(
      [...block.initialPoints].map(([k, v]) => [k, { ...v, position: { ...v.position } }]),
    );
    const result = bundleAdjust(
      block.initialPoses,
      block.initialPoints,
      block.observations,
      block.controlTruth,
      { intrinsics: block.intrinsics, controlWeight: 40, iterations: 8, damping: 1e-6, fixPoses: true },
    );
    for (const [id, point] of result.points) {
      if (point.role !== 'check') continue;
      const original = before.get(id)!;
      // Checkpoints must come out exactly as they went in — untouched.
      expect(point.position.x, id).toBeCloseTo(original.position.x, 12);
      expect(point.position.y, id).toBeCloseTo(original.position.y, 12);
      expect(point.position.z, id).toBeCloseTo(original.position.z, 12);
    }
  });

  it('scores control and checkpoints separately', () => {
    const block = makeBlock();
    const score = scoreBlock(block.initialPoints, block.truthPoints);
    expect(score.checkCount).toBe(checks.length);
    // Control starts on its surveyed value, so its error starts at zero.
    expect(score.controlRmseM).toBeCloseTo(0, 9);
    expect(score.checkRmseM).toBeGreaterThan(0);
  });

  it('is deterministic for a fixed seed', () => {
    const a = makeBlock();
    const b = makeBlock();
    expect(a.observations.length).toBe(b.observations.length);
    expect(a.observations[10]!.x).toBeCloseTo(b.observations[10]!.x, 12);
  });

  it('degrades the solution when image measurement noise rises', () => {
    const clean = makeBlock({ imageNoisePx: 0.1 });
    const noisy = makeBlock({ imageNoisePx: 4 });
    const run = (block: ReturnType<typeof makeBlock>) =>
      bundleAdjust(
        block.initialPoses,
        block.initialPoints,
        block.observations,
        block.controlTruth,
        { intrinsics: block.intrinsics, controlWeight: 40, iterations: 12, damping: 1e-6, fixPoses: true },
      );
    expect(run(noisy).finalRmsPx).toBeGreaterThan(run(clean).finalRmsPx);
  });
});
