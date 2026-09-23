/**
 * SYNTHETIC PHOTOGRAMMETRIC BLOCK — Spec §5 (digital twin), §115, §220 (truth dataset).
 *
 * Builds a complete, solvable network from the flight the mission engine flew
 * over the virtual mine. Because the object points are sampled from
 * `terrainElevation()`, the truth is known exactly — so residuals, checkpoint
 * errors and the eventual volume can all be scored against reality rather than
 * against the adjustment's opinion of itself.
 */

import { v3, pseudoNoise, type Vec3 } from '../sensors/imu';
import { terrainElevation } from '../../data/mine';
import {
  intrinsicsFromCamera,
  project,
  type Intrinsics,
  type Observation,
  type ObjectPoint,
  type Pose,
} from './photogrammetry';
import type { ImageRecord } from '../flight/mission';
import type { CameraSpec } from '../camera/gsd';

/**
 * Orientation of a nadir-looking camera in this engine's frame convention.
 *
 * The camera's optical axis is body +X. `bodyToWorld` maps body +X to
 * world (cos y·cos p, sin y·cos p, −sin p), so pitch = +90° points the optical
 * axis straight down (world −Z, i.e. decreasing RL). Yaw then rotates the
 * frame about that axis, which is the aircraft heading.
 */
export const NADIR_PITCH_DEG = 90;

export function nadirPose(id: string, centre: Vec3, headingDeg: number): Pose {
  return { id, centre, rollDeg: 0, pitchDeg: NADIR_PITCH_DEG, yawDeg: headingDeg };
}

export interface BlockOptions {
  camera: CameraSpec;
  /** Images to use from the flight. Whole block if omitted. */
  imageLimit?: number;
  /** Object points to scatter across the imaged area. */
  pointCount: number;
  /** 1σ image-measurement noise, pixels. */
  imageNoisePx: number;
  /** 1σ error injected into the initial camera positions, metres. */
  poseNoiseM: number;
  /** 1σ error injected into the initial point positions, metres. */
  pointNoiseM: number;
  /** Ground-control point ids, from the mine's control layout. */
  controlPoints: Array<{ id: string; e: number; n: number; rl: number }>;
  /** Independent checkpoints — never enter the adjustment. */
  checkPoints: Array<{ id: string; e: number; n: number; rl: number }>;
  seed?: number;
}

export interface SyntheticBlock {
  intrinsics: Intrinsics;
  /** Ground truth — what the answer should be. */
  truthPoses: Map<string, Pose>;
  truthPoints: Map<string, Vec3>;
  /** Perturbed starting values the adjustment is given. */
  initialPoses: Map<string, Pose>;
  initialPoints: Map<string, ObjectPoint>;
  observations: Observation[];
  /** Surveyed coordinates of the control points, for the adjustment. */
  controlTruth: Map<string, Vec3>;
  /** Mean number of images each tie point appears in. */
  meanRaysPerPoint: number;
  /** Points seen in fewer than two images — not tie points at all (§119). */
  orphanPoints: number;
}

export function buildBlock(images: ImageRecord[], options: BlockOptions): SyntheticBlock {
  const seed = options.seed ?? 42;
  const used = options.imageLimit ? images.slice(0, options.imageLimit) : images;

  const intrinsics = intrinsicsFromCamera(
    options.camera.sensorWidthMm,
    options.camera.focalLengthMm,
    options.camera.imageWidthPx,
    options.camera.imageHeightPx,
  );

  const truthPoses = new Map<string, Pose>();
  const initialPoses = new Map<string, Pose>();

  used.forEach((img, i) => {
    const centre = v3(img.e, img.n, img.aircraftRl);
    const truth = nadirPose(img.filename, centre, img.headingDeg);
    truthPoses.set(truth.id, truth);
    initialPoses.set(truth.id, {
      ...truth,
      centre: v3(
        centre.x + options.poseNoiseM * pseudoNoise(seed + i * 0.311),
        centre.y + options.poseNoiseM * pseudoNoise(seed + i * 0.577),
        centre.z + options.poseNoiseM * pseudoNoise(seed + i * 0.733),
      ),
      yawDeg: truth.yawDeg + 0.4 * pseudoNoise(seed + i * 0.911),
    });
  });

  // Scatter tie points across the footprint of the used images.
  const eMin = Math.min(...used.map((i) => i.e));
  const eMax = Math.max(...used.map((i) => i.e));
  const nMin = Math.min(...used.map((i) => i.n));
  const nMax = Math.max(...used.map((i) => i.n));

  const truthPoints = new Map<string, Vec3>();
  const initialPoints = new Map<string, ObjectPoint>();
  const controlTruth = new Map<string, Vec3>();

  for (let i = 0; i < options.pointCount; i++) {
    // Deterministic low-discrepancy scatter.
    const u = (pseudoNoise(seed + i * 1.13) + 1) / 2;
    const w = (pseudoNoise(seed + i * 2.17) + 1) / 2;
    const e = eMin + (eMax - eMin) * u;
    const n = nMin + (nMax - nMin) * w;
    const rl = terrainElevation(e, n);
    const id = `TP-${String(i + 1).padStart(4, '0')}`;
    truthPoints.set(id, v3(e, n, rl));
    initialPoints.set(id, {
      id,
      role: 'tie',
      position: v3(
        e + options.pointNoiseM * pseudoNoise(seed + i * 3.31),
        n + options.pointNoiseM * pseudoNoise(seed + i * 4.79),
        rl + options.pointNoiseM * pseudoNoise(seed + i * 5.23),
      ),
    });
  }

  for (const cp of options.controlPoints) {
    const position = v3(cp.e, cp.n, cp.rl);
    truthPoints.set(cp.id, position);
    controlTruth.set(cp.id, position);
    initialPoints.set(cp.id, {
      id: cp.id,
      role: 'control',
      // Control starts at its surveyed value — that is the point of control.
      position: v3(position.x, position.y, position.z),
    });
  }

  for (const cp of options.checkPoints) {
    const position = v3(cp.e, cp.n, cp.rl);
    truthPoints.set(cp.id, position);
    initialPoints.set(cp.id, {
      id: cp.id,
      role: 'check',
      position: v3(
        position.x + options.pointNoiseM * pseudoNoise(seed + cp.id.length * 7.1),
        position.y + options.pointNoiseM * pseudoNoise(seed + cp.id.length * 8.3),
        position.z + options.pointNoiseM * pseudoNoise(seed + cp.id.length * 9.7),
      ),
    });
  }

  // Observations: project every truth point into every truth pose.
  const observations: Observation[] = [];
  const rayCount = new Map<string, number>();

  let obsIndex = 0;
  for (const [pointId, position] of truthPoints) {
    for (const [poseId, pose] of truthPoses) {
      const predicted = project(position, pose, intrinsics);
      if (!predicted) continue;
      observations.push({
        poseId,
        pointId,
        x: predicted.x + options.imageNoisePx * pseudoNoise(seed + obsIndex * 0.137),
        y: predicted.y + options.imageNoisePx * pseudoNoise(seed + obsIndex * 0.239),
      });
      rayCount.set(pointId, (rayCount.get(pointId) ?? 0) + 1);
      obsIndex++;
    }
  }

  const counts = [...truthPoints.keys()].map((id) => rayCount.get(id) ?? 0);
  const meanRaysPerPoint =
    counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;

  return {
    intrinsics,
    truthPoses,
    truthPoints,
    initialPoses,
    initialPoints,
    observations,
    controlTruth,
    meanRaysPerPoint,
    orphanPoints: counts.filter((c) => c < 2).length,
  };
}

/**
 * Score an adjusted block against the truth it was built from.
 * Separates the points that constrained the solution from the ones that did not
 * — because only the second group is evidence (§152, golden principle 13).
 */
export interface BlockScore {
  controlRmseM: number;
  checkRmseM: number;
  checkVerticalRmseM: number;
  tieRmseM: number;
  /** Largest error on any checkpoint, metres. */
  checkMaxM: number;
  checkCount: number;
}

export function scoreBlock(
  adjusted: Map<string, ObjectPoint>,
  truth: Map<string, Vec3>,
): BlockScore {
  const errors = { control: [] as number[], check: [] as number[], tie: [] as number[] };
  const checkVertical: number[] = [];

  for (const [id, point] of adjusted) {
    const t = truth.get(id);
    if (!t) continue;
    const dx = point.position.x - t.x;
    const dy = point.position.y - t.y;
    const dz = point.position.z - t.z;
    const total = Math.hypot(dx, dy, dz);
    if (point.role === 'control') errors.control.push(total);
    else if (point.role === 'check') {
      errors.check.push(total);
      checkVertical.push(dz);
    } else errors.tie.push(total);
  }

  const rms = (arr: number[]) =>
    arr.length === 0 ? NaN : Math.sqrt(arr.reduce((a, v) => a + v * v, 0) / arr.length);

  return {
    controlRmseM: rms(errors.control),
    checkRmseM: rms(errors.check),
    checkVerticalRmseM: rms(checkVertical),
    tieRmseM: rms(errors.tie),
    checkMaxM: errors.check.length > 0 ? Math.max(...errors.check) : NaN,
    checkCount: errors.check.length,
  };
}
