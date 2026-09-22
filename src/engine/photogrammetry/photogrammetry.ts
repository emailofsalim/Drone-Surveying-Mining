/**
 * PHOTOGRAMMETRY ENGINE — Spec §115–§127, Phases 25–27.
 *
 * This is a real, numerical implementation of the core geometry, not an
 * animation of it:
 *
 *   COLLINEARITY (§123) — the object point, the perspective centre and the
 *   image point lie on one straight line. Projection and its inverse both
 *   follow from that single statement.
 *
 *   TRIANGULATION (§122) — two or more rays that should meet at one object
 *   point never quite do, because every observation carries error. The
 *   least-squares midpoint of the closest approach is the estimate.
 *
 *   BUNDLE ADJUSTMENT (§125) — poses and object points are refined together
 *   by minimising the reprojection residuals, with control points weighted in.
 *   Implemented here as Gauss-Newton with numerical Jacobians.
 *
 *   REPROJECTION ERROR (§126) — e = ‖(x,y) − (x̂,ŷ)‖, the quantity everything
 *   above is minimising, and the one a learner must never confuse with
 *   accuracy (§152, golden principle 15).
 *
 * DOCUMENTED LIMITATIONS (§210, §228):
 *  - pinhole camera; no lens distortion, no self-calibration of interior
 *    orientation;
 *  - Gauss-Newton with numerical derivatives and no robust loss — adequate for
 *    small teaching networks, not for a production block;
 *  - keypoints are synthesised from the terrain model rather than detected in
 *    real imagery, so detector behaviour (texture, blur, glare) is modelled
 *    statistically rather than optically.
 */

import { bodyToWorld, worldToBody, v3, type Vec3 } from '../sensors/imu';
import { pseudoNoise } from '../sensors/imu';

export interface Intrinsics {
  /** Focal length in pixels. */
  focalPx: number;
  /** Principal point, pixels. */
  cx: number;
  cy: number;
  widthPx: number;
  heightPx: number;
}

export interface Pose {
  id: string;
  /** Perspective centre in object space (E, N, RL). */
  centre: Vec3;
  /** Orientation, degrees. Omega/phi/kappa expressed as roll/pitch/yaw. */
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

export interface Observation {
  poseId: string;
  pointId: string;
  /** Image coordinates, pixels. */
  x: number;
  y: number;
}

export interface ObjectPoint {
  id: string;
  position: Vec3;
  /** 'control' points are weighted into the adjustment; 'check' never are. */
  role: 'tie' | 'control' | 'check';
}

/** Intrinsics derived from a physical camera at a stated image size. */
export function intrinsicsFromCamera(
  sensorWidthMm: number,
  focalLengthMm: number,
  widthPx: number,
  heightPx: number,
): Intrinsics {
  return {
    focalPx: (focalLengthMm * widthPx) / sensorWidthMm,
    cx: widthPx / 2,
    cy: heightPx / 2,
    widthPx,
    heightPx,
  };
}

/**
 * COLLINEARITY — project an object point into an image.
 * Returns null when the point falls behind the camera or outside the frame.
 */
export function project(
  point: Vec3,
  pose: Pose,
  intrinsics: Intrinsics,
): { x: number; y: number; depth: number } | null {
  // Object → camera frame. The camera looks along its own −Z at nadir, so a
  // nadir pose (pitch −90°) maps "down" to the camera's viewing direction.
  const relative = v3(
    point.x - pose.centre.x,
    point.y - pose.centre.y,
    point.z - pose.centre.z,
  );
  const cam = worldToBody(relative, pose.rollDeg, pose.pitchDeg, pose.yawDeg);

  // Camera frame: +X right, +Y down, +Z forward along the optical axis.
  const depth = cam.x;
  if (depth <= 1e-6) return null;

  const x = intrinsics.cx + (intrinsics.focalPx * cam.y) / depth;
  const y = intrinsics.cy + (intrinsics.focalPx * cam.z) / depth;

  if (x < 0 || y < 0 || x > intrinsics.widthPx || y > intrinsics.heightPx) return null;
  return { x, y, depth };
}

/** The ray from a perspective centre through an image point, unit length. */
export function backProject(
  x: number,
  y: number,
  pose: Pose,
  intrinsics: Intrinsics,
): { origin: Vec3; direction: Vec3 } {
  const cam = v3(1, (x - intrinsics.cx) / intrinsics.focalPx, (y - intrinsics.cy) / intrinsics.focalPx);
  const world = bodyToWorld(cam, pose.rollDeg, pose.pitchDeg, pose.yawDeg);
  const length = Math.hypot(world.x, world.y, world.z) || 1;
  return {
    origin: pose.centre,
    direction: v3(world.x / length, world.y / length, world.z / length),
  };
}

/**
 * TRIANGULATION — Spec §122.
 * Least-squares intersection of n rays. Solves the 3×3 normal system built
 * from the projection matrices (I − d·dᵀ) of each ray.
 */
export interface TriangulationResult {
  position: Vec3;
  /** Distance from the solution to the nearest point on each ray, metres. */
  rayResidualsM: number[];
  /** RMS of the ray residuals — how far from meeting the rays actually are. */
  rmsResidualM: number;
  rayCount: number;
  wellConditioned: boolean;
}

export function triangulate(
  rays: Array<{ origin: Vec3; direction: Vec3 }>,
): TriangulationResult | null {
  if (rays.length < 2) return null;

  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b = [0, 0, 0];

  for (const ray of rays) {
    const d = [ray.direction.x, ray.direction.y, ray.direction.z];
    const o = [ray.origin.x, ray.origin.y, ray.origin.z];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const term = (i === j ? 1 : 0) - d[i]! * d[j]!;
        A[i]![j]! += term;
        b[i]! += term * o[j]!;
      }
    }
  }

  const solution = solve3(A, b);
  if (!solution) return null;

  const position = v3(solution[0]!, solution[1]!, solution[2]!);
  const rayResidualsM = rays.map((ray) => {
    const w = v3(
      position.x - ray.origin.x,
      position.y - ray.origin.y,
      position.z - ray.origin.z,
    );
    const along = w.x * ray.direction.x + w.y * ray.direction.y + w.z * ray.direction.z;
    return Math.hypot(
      w.x - along * ray.direction.x,
      w.y - along * ray.direction.y,
      w.z - along * ray.direction.z,
    );
  });

  const rms = Math.sqrt(
    rayResidualsM.reduce((acc, r) => acc + r * r, 0) / rayResidualsM.length,
  );

  // Condition check: rays that are nearly parallel intersect badly. The
  // maximum angle between any pair is the practical indicator.
  let maxAngle = 0;
  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      const a = rays[i]!.direction;
      const c = rays[j]!.direction;
      const dot = Math.min(1, Math.max(-1, a.x * c.x + a.y * c.y + a.z * c.z));
      maxAngle = Math.max(maxAngle, (Math.acos(dot) * 180) / Math.PI);
    }
  }

  return {
    position,
    rayResidualsM,
    rmsResidualM: rms,
    rayCount: rays.length,
    wellConditioned: maxAngle > 5,
  };
}

function solve3(A: number[][], b: number[]): number[] | null {
  const m = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const d = m[col]![col]!;
    for (let j = col; j < 4; j++) m[col]![j]! /= d;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      for (let j = col; j < 4; j++) m[r]![j]! -= f * m[col]![j]!;
    }
  }
  return [m[0]![3]!, m[1]![3]!, m[2]![3]!];
}

/**
 * REPROJECTION ERROR — Spec §126.
 *   e = [x − x̂, y − ŷ],  |e| = √(Δx² + Δy²)
 */
export interface Residual {
  poseId: string;
  pointId: string;
  dx: number;
  dy: number;
  magnitudePx: number;
}

export function reprojectionResiduals(
  observations: Observation[],
  poses: Map<string, Pose>,
  points: Map<string, ObjectPoint>,
  intrinsics: Intrinsics,
): Residual[] {
  const out: Residual[] = [];
  for (const obs of observations) {
    const pose = poses.get(obs.poseId);
    const point = points.get(obs.pointId);
    if (!pose || !point) continue;
    const predicted = project(point.position, pose, intrinsics);
    if (!predicted) continue;
    const dx = obs.x - predicted.x;
    const dy = obs.y - predicted.y;
    out.push({
      poseId: obs.poseId,
      pointId: obs.pointId,
      dx,
      dy,
      magnitudePx: Math.hypot(dx, dy),
    });
  }
  return out;
}

export function rmsReprojectionPx(residuals: Residual[]): number {
  if (residuals.length === 0) return NaN;
  const sum = residuals.reduce((acc, r) => acc + r.dx * r.dx + r.dy * r.dy, 0);
  return Math.sqrt(sum / residuals.length);
}

/**
 * MATCHING AND TIE POINTS — Spec §116–§121.
 *
 * The distinction the specification insists is permanent:
 *   KEYPOINT  = a feature DETECTED in one image.
 *   TIE POINT = a correspondence MATCHED across two or more images.
 * A keypoint is not automatically a tie point (golden principle 11).
 */
export interface Keypoint {
  poseId: string;
  x: number;
  y: number;
  /** Detector response — low on blurred or untextured ground. */
  strength: number;
  /** The object point it truly came from. Used to score matching honestly. */
  truePointId: string;
}

export interface MatchResult {
  keypointCount: number;
  matchCount: number;
  tiePointCount: number;
  wrongMatchCount: number;
  /** Fraction of matches that are wrong — the blunder rate (§120). */
  outlierRate: number;
  /** Tie points observed in three or more images. */
  multiRayCount: number;
}

export interface ImageQuality {
  /** 0 = featureless (water, fresh snow, uniform muck pile), 1 = rich texture. */
  texture: number;
  /** Motion smear in pixels (§84). */
  blurPx: number;
  /** 0 = clean, 1 = washed out by glare. */
  glare: number;
}

/**
 * Detector yield as a function of image quality.
 * Not an optical model — a documented statistical stand-in that reproduces the
 * behaviour the learner must recognise: texture dominates, blur destroys, and
 * glare removes whole regions.
 */
export function detectorYield(quality: ImageQuality): number {
  const blurPenalty = 1 / (1 + Math.max(0, quality.blurPx) ** 1.6);
  const glarePenalty = 1 - Math.min(1, Math.max(0, quality.glare));
  return Math.max(0, Math.min(1, quality.texture * blurPenalty * glarePenalty));
}

/**
 * Build tie points from keypoints by grouping true correspondences, then
 * inject a blunder rate that rises as the descriptors become less distinctive.
 */
export function matchKeypoints(
  keypoints: Keypoint[],
  quality: ImageQuality,
  seed = 11,
): MatchResult {
  const byPoint = new Map<string, Keypoint[]>();
  for (const kp of keypoints) {
    const list = byPoint.get(kp.truePointId) ?? [];
    list.push(kp);
    byPoint.set(kp.truePointId, list);
  }

  // A tie point needs the same feature seen in at least two images.
  const groups = [...byPoint.values()].filter((g) => g.length >= 2);
  const tiePointCount = groups.length;
  const multiRayCount = groups.filter((g) => g.length >= 3).length;
  const matchCount = groups.reduce((acc, g) => acc + g.length - 1, 0);

  // Weak texture and heavy blur make descriptors ambiguous, so wrong matches
  // rise. Glare removes features rather than confusing them.
  const ambiguity = (1 - quality.texture) * 0.35 + Math.min(1, quality.blurPx / 4) * 0.4;
  let wrong = 0;
  for (let i = 0; i < matchCount; i++) {
    if ((pseudoNoise(seed + i * 0.613) + 1) / 2 < ambiguity) wrong++;
  }

  return {
    keypointCount: keypoints.length,
    matchCount,
    tiePointCount,
    wrongMatchCount: wrong,
    outlierRate: matchCount > 0 ? wrong / matchCount : 0,
    multiRayCount,
  };
}

/**
 * IMAGE NETWORK — Spec §121.
 * Images are nodes; shared tie points are edges. A weakly connected image is
 * one whose strongest edge carries few common points — it is the image that
 * will float, or drag a whole strip with it.
 */
export interface NetworkEdge {
  a: string;
  b: string;
  sharedPoints: number;
}

export interface NetworkAnalysis {
  nodes: string[];
  edges: NetworkEdge[];
  /** Images whose best connection is below the threshold. */
  weakNodes: string[];
  /** True when every image is reachable from every other. */
  connected: boolean;
  components: number;
}

export function analyseNetwork(
  observations: Observation[],
  minSharedPoints = 8,
): NetworkAnalysis {
  const pointsByPose = new Map<string, Set<string>>();
  for (const obs of observations) {
    const set = pointsByPose.get(obs.poseId) ?? new Set<string>();
    set.add(obs.pointId);
    pointsByPose.set(obs.poseId, set);
  }

  const nodes = [...pointsByPose.keys()].sort();
  const edges: NetworkEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = pointsByPose.get(nodes[i]!)!;
      const b = pointsByPose.get(nodes[j]!)!;
      let shared = 0;
      for (const id of a) if (b.has(id)) shared++;
      if (shared > 0) edges.push({ a: nodes[i]!, b: nodes[j]!, sharedPoints: shared });
    }
  }

  const best = new Map<string, number>();
  for (const node of nodes) best.set(node, 0);
  for (const edge of edges) {
    best.set(edge.a, Math.max(best.get(edge.a) ?? 0, edge.sharedPoints));
    best.set(edge.b, Math.max(best.get(edge.b) ?? 0, edge.sharedPoints));
  }

  // Connected components over edges that meet the threshold.
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (n: string): string => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const edge of edges) {
    if (edge.sharedPoints < minSharedPoints) continue;
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const components = new Set(nodes.map(find)).size;

  return {
    nodes,
    edges,
    weakNodes: nodes.filter((n) => (best.get(n) ?? 0) < minSharedPoints),
    connected: components === 1,
    components,
  };
}

/**
 * BUNDLE ADJUSTMENT — Spec §125.
 *
 * Gauss-Newton refinement of camera poses and object points, minimising
 * reprojection residuals, with control points constrained by a weight.
 * Jacobians are computed numerically so the code stays readable; this is a
 * teaching implementation, not a production solver.
 */
export interface BundleOptions {
  intrinsics: Intrinsics;
  /** Weight applied to each control-point coordinate constraint, px per metre. */
  controlWeight: number;
  iterations: number;
  /** Levenberg damping, keeps the normal matrix invertible. */
  damping: number;
  /** Hold poses fixed and solve points only. */
  fixPoses?: boolean;
}

export interface BundleResult {
  poses: Map<string, Pose>;
  points: Map<string, ObjectPoint>;
  /** RMS reprojection error after each iteration. */
  history: number[];
  initialRmsPx: number;
  finalRmsPx: number;
  iterations: number;
  converged: boolean;
}

const POSE_PARAMS = 6;
const POINT_PARAMS = 3;

export function bundleAdjust(
  initialPoses: Map<string, Pose>,
  initialPoints: Map<string, ObjectPoint>,
  observations: Observation[],
  controlTruth: Map<string, Vec3>,
  options: BundleOptions,
): BundleResult {
  const poses = new Map([...initialPoses].map(([k, v]) => [k, { ...v, centre: { ...v.centre } }]));
  const points = new Map(
    [...initialPoints].map(([k, v]) => [k, { ...v, position: { ...v.position } }]),
  );

  // Check points must never influence the adjustment (§112, §152).
  const usedObs = observations.filter((o) => points.get(o.pointId)?.role !== 'check');

  // A point seen in one image is not determined by the imagery: its ray fixes
  // a direction, not a position. Including it makes the normal matrix singular,
  // so it is held fixed rather than "solved" (§119 — one ray is not a tie point).
  const rayCount = new Map<string, number>();
  for (const obs of usedObs) rayCount.set(obs.pointId, (rayCount.get(obs.pointId) ?? 0) + 1);
  const adjustable = [...points.values()].filter((p) => {
    if (p.role === 'check') return false;
    const rays = rayCount.get(p.id) ?? 0;
    // Control carries its own surveyed constraint, so one ray is enough to tie
    // it in. A tie point has nothing but rays, so it needs at least two.
    // A point with no observation at all is not part of this block.
    return p.role === 'control' ? rays >= 1 : rays >= 2;
  });

  const poseIds = options.fixPoses ? [] : [...poses.keys()].sort();
  const pointIds = adjustable.map((p) => p.id).sort();

  const poseOffset = new Map(poseIds.map((id, i) => [id, i * POSE_PARAMS]));
  const pointBase = poseIds.length * POSE_PARAMS;
  const pointOffset = new Map(pointIds.map((id, i) => [id, pointBase + i * POINT_PARAMS]));
  const n = pointBase + pointIds.length * POINT_PARAMS;

  const initialRms = rmsReprojectionPx(
    reprojectionResiduals(usedObs, poses, points, options.intrinsics),
  );
  const history: number[] = [initialRms];

  const getParam = (i: number): number => {
    if (i < pointBase) {
      const poseId = poseIds[Math.floor(i / POSE_PARAMS)]!;
      const pose = poses.get(poseId)!;
      switch (i % POSE_PARAMS) {
        case 0: return pose.centre.x;
        case 1: return pose.centre.y;
        case 2: return pose.centre.z;
        case 3: return pose.rollDeg;
        case 4: return pose.pitchDeg;
        default: return pose.yawDeg;
      }
    }
    const idx = Math.floor((i - pointBase) / POINT_PARAMS);
    const point = points.get(pointIds[idx]!)!;
    switch ((i - pointBase) % POINT_PARAMS) {
      case 0: return point.position.x;
      case 1: return point.position.y;
      default: return point.position.z;
    }
  };

  const setParam = (i: number, value: number): void => {
    if (i < pointBase) {
      const poseId = poseIds[Math.floor(i / POSE_PARAMS)]!;
      const pose = poses.get(poseId)!;
      switch (i % POSE_PARAMS) {
        case 0: pose.centre.x = value; break;
        case 1: pose.centre.y = value; break;
        case 2: pose.centre.z = value; break;
        case 3: pose.rollDeg = value; break;
        case 4: pose.pitchDeg = value; break;
        default: pose.yawDeg = value;
      }
      return;
    }
    const idx = Math.floor((i - pointBase) / POINT_PARAMS);
    const point = points.get(pointIds[idx]!)!;
    switch ((i - pointBase) % POINT_PARAMS) {
      case 0: point.position.x = value; break;
      case 1: point.position.y = value; break;
      default: point.position.z = value;
    }
  };

  /** Full residual vector: image residuals, then control constraints. */
  const residualVector = (): number[] => {
    const out: number[] = [];
    for (const obs of usedObs) {
      const pose = poses.get(obs.poseId);
      const point = points.get(obs.pointId);
      if (!pose || !point) {
        out.push(0, 0);
        continue;
      }
      const predicted = project(point.position, pose, options.intrinsics);
      if (!predicted) {
        out.push(0, 0);
        continue;
      }
      out.push(obs.x - predicted.x, obs.y - predicted.y);
    }
    for (const id of pointIds) {
      const truth = controlTruth.get(id);
      const point = points.get(id)!;
      if (!truth || point.role !== 'control') {
        out.push(0, 0, 0);
        continue;
      }
      out.push(
        (truth.x - point.position.x) * options.controlWeight,
        (truth.y - point.position.y) * options.controlWeight,
        (truth.z - point.position.z) * options.controlWeight,
      );
    }
    return out;
  };

  let converged = false;
  let iterations = 0;
  // Levenberg-Marquardt damping: raised when a step makes things worse,
  // lowered when it helps. Without this the solver diverges the moment a
  // point is weakly determined.
  let lambda = Math.max(options.damping, 1e-6);
  let currentRms = initialRms;

  for (let iter = 0; iter < options.iterations && n > 0; iter++) {
    iterations++;
    const r0 = residualVector();
    const m = r0.length;

    // Numerical Jacobian. n is small in a teaching network, so this is fine.
    const J: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
    for (let p = 0; p < n; p++) {
      const original = getParam(p);
      const isAngle = p < pointBase && p % POSE_PARAMS >= 3;
      const h = isAngle ? 1e-4 : 1e-4;
      setParam(p, original + h);
      const rPlus = residualVector();
      setParam(p, original);
      for (let i = 0; i < m; i++) J[i]![p] = (rPlus[i]! - r0[i]!) / h;
    }

    // Normal equations: (JᵀJ + λD) δ = −Jᵀ r
    //
    // The sign matters: minimising ‖r‖² needs a DESCENT step, δ = −(JᵀJ)⁻¹Jᵀr.
    // Dropping the minus turns the solver into gradient ascent, which walks
    // away from the solution on the very first iteration.
    const N: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const g = new Array<number>(n).fill(0);
    for (let i = 0; i < m; i++) {
      const row = J[i]!;
      for (let a = 0; a < n; a++) {
        if (row[a] === 0) continue;
        g[a]! -= row[a]! * r0[i]!;
        for (let b = a; b < n; b++) {
          if (row[b] === 0) continue;
          N[a]![b]! += row[a]! * row[b]!;
        }
      }
    }
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < a; b++) N[a]![b] = N[b]![a]!;
    }

    // Try the step; if it does not improve the fit, back it out, increase the
    // damping and try again. A rejected step is not a failure — it is how LM
    // works its way down an awkward surface.
    const before = new Array<number>(n);
    for (let p = 0; p < n; p++) before[p] = getParam(p);

    // Scale the damping to the matrix so a weakly observed parameter cannot
    // produce a huge step just because its own diagonal entry is near zero.
    let diagonalScale = 0;
    for (let a = 0; a < n; a++) diagonalScale += N[a]![a]!;
    diagonalScale = diagonalScale / n || 1;

    let accepted = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const damped = N.map((row, a) =>
        row.map((value, b) =>
          a === b ? value + lambda * Math.max(value, diagonalScale) : value,
        ),
      );
      const delta = solveSymmetric(damped, g);
      if (!delta || delta.some((d) => !Number.isFinite(d))) {
        lambda *= 10;
        continue;
      }

      for (let p = 0; p < n; p++) setParam(p, before[p]! + delta[p]!);
      const candidate = rmsReprojectionPx(
        reprojectionResiduals(usedObs, poses, points, options.intrinsics),
      );

      if (Number.isFinite(candidate) && candidate <= currentRms) {
        const improvement = currentRms - candidate;
        currentRms = candidate;
        history.push(candidate);
        lambda = Math.max(1e-9, lambda / 3);
        accepted = true;
        if (improvement < 1e-7) converged = true;
        break;
      }

      // Reject: restore and damp harder.
      for (let p = 0; p < n; p++) setParam(p, before[p]!);
      lambda *= 10;
    }

    if (!accepted || converged) {
      converged = true;
      break;
    }
  }

  return {
    poses,
    points,
    history,
    initialRmsPx: initialRms,
    finalRmsPx: history[history.length - 1] ?? initialRms,
    iterations,
    converged,
  };
}

/** Gauss elimination with partial pivoting for a dense symmetric system. */
function solveSymmetric(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-14) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const d = m[col]![col]!;
    for (let j = col; j <= n; j++) m[col]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (f === 0) continue;
      for (let j = col; j <= n; j++) m[r]![j]! -= f * m[col]![j]!;
    }
  }
  return m.map((row) => row[n]!);
}
