/**
 * IMU ENGINE — Spec §36–§40, Phase 10.
 *
 * Teaches the one thing that matters about inertial sensing: integration turns
 * a small constant bias into an unbounded position error.
 *
 *   gyro bias b_ω  → attitude error grows as   b_ω · t
 *   accel bias b_a → velocity error grows as   b_a · t
 *                    position error grows as   ½ · b_a · t²
 *
 * SIMPLIFIED TRAINING MODEL (§208). Real inertial navigation involves the
 * Earth's rotation, transport rate, scale-factor and misalignment terms, and a
 * proper Kalman filter. None of that is modelled here. The purpose is to make
 * drift visible, not to navigate.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const addV = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const subV = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scaleV = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const normV = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const GRAVITY = 9.80665;

export interface ImuSpec {
  id: string;
  name: string;
  /** Gyroscope bias, deg/s per axis. */
  gyroBiasDegS: number;
  /** Gyroscope white noise, deg/s (1σ at the sampling rate). */
  gyroNoiseDegS: number;
  /** Accelerometer bias, m/s². */
  accelBiasMs2: number;
  /** Accelerometer white noise, m/s² (1σ). */
  accelNoiseMs2: number;
  grade: 'consumer MEMS' | 'industrial MEMS' | 'tactical';
}

export const IMU_GRADES: ImuSpec[] = [
  {
    id: 'imu-consumer',
    name: 'Consumer MEMS (typical small UAV)',
    gyroBiasDegS: 0.05,
    gyroNoiseDegS: 0.02,
    accelBiasMs2: 0.02,
    accelNoiseMs2: 0.01,
    grade: 'consumer MEMS',
  },
  {
    id: 'imu-industrial',
    name: 'Industrial MEMS (survey payload)',
    gyroBiasDegS: 0.01,
    gyroNoiseDegS: 0.005,
    accelBiasMs2: 0.005,
    accelNoiseMs2: 0.003,
    grade: 'industrial MEMS',
  },
  {
    id: 'imu-tactical',
    name: 'Tactical grade (LiDAR trajectory)',
    gyroBiasDegS: 0.001,
    gyroNoiseDegS: 0.0008,
    accelBiasMs2: 0.0005,
    accelNoiseMs2: 0.0003,
    grade: 'tactical',
  },
];

/**
 * INERTIAL DRIFT — Spec §39.
 * Free inertial propagation of a stationary, level sensor. Everything the
 * solution reports is error, because the truth is "not moving".
 */
export interface DriftSample {
  t: number;
  attitudeErrorDeg: number;
  velocityErrorMs: number;
  positionErrorM: number;
}

export function freeInertialDrift(
  imu: ImuSpec,
  durationS: number,
  samples = 120,
): DriftSample[] {
  const out: DriftSample[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (durationS * i) / samples;
    const attitudeErrorDeg = imu.gyroBiasDegS * t;
    // A tilt error θ leaks gravity into the horizontal channel: a_err = g·sin θ.
    const tiltLeak = GRAVITY * Math.sin((attitudeErrorDeg * Math.PI) / 180);
    const accelError = imu.accelBiasMs2 + tiltLeak;
    out.push({
      t,
      attitudeErrorDeg,
      velocityErrorMs: accelError * t,
      // ∫∫ of a bias plus the gravity-leak term that grows with the tilt.
      positionErrorM: 0.5 * accelError * t * t,
    });
  }
  return out;
}

/** Time until the free-inertial position error exceeds a stated limit. */
export function driftTimeToLimit(imu: ImuSpec, limitM: number): number {
  // Solved numerically because the gravity leak makes the growth faster than t².
  const samples = freeInertialDrift(imu, 600, 6000);
  const hit = samples.find((s) => s.positionErrorM >= limitM);
  return hit ? hit.t : Number.POSITIVE_INFINITY;
}

/**
 * SENSOR FUSION — Spec §40.
 *
 * A complementary filter: the gyroscope is trusted at short timescales, the
 * accelerometer's gravity direction at long ones. This is the simplest honest
 * demonstration that a *state estimate* is not a *raw observation*.
 *
 *   θ_est = α (θ_est + ω Δt) + (1 − α) θ_accel
 *
 * α is derived from a time constant τ:  α = τ / (τ + Δt)
 */
export interface FusionSample {
  t: number;
  truthDeg: number;
  gyroOnlyDeg: number;
  accelOnlyDeg: number;
  fusedDeg: number;
}

export interface FusionOptions {
  imu: ImuSpec;
  /** Complementary-filter time constant, seconds. */
  tauS: number;
  dtS: number;
  durationS: number;
  /** Deterministic seed so the lab is reproducible (§219). */
  seed?: number;
}

/** Deterministic pseudo-random noise in [-1, 1]. No Math.random in engines. */
export function pseudoNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function complementaryFilter(
  options: FusionOptions,
  truthAt: (t: number) => number,
): FusionSample[] {
  const { imu, tauS, dtS, durationS, seed = 1 } = options;
  const alpha = tauS / (tauS + dtS);
  const steps = Math.floor(durationS / dtS);

  let gyroOnly = truthAt(0);
  let fused = truthAt(0);
  const out: FusionSample[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i * dtS;
    const truth = truthAt(t);
    const truthPrev = truthAt(Math.max(0, t - dtS));
    const trueRate = (truth - truthPrev) / dtS;

    // Gyro: true rate + bias + noise. Integrating it accumulates the bias.
    const gyroRate =
      trueRate + imu.gyroBiasDegS + imu.gyroNoiseDegS * pseudoNoise(seed + i * 0.731);
    gyroOnly += gyroRate * dtS;

    // Accelerometer tilt: noisy but unbiased over time — no drift, poor short-term.
    const accelNoiseDeg =
      ((imu.accelNoiseMs2 * 14) / GRAVITY) * (180 / Math.PI) * pseudoNoise(seed + i * 1.317);
    const accelOnly = truth + accelNoiseDeg;

    fused = alpha * (fused + gyroRate * dtS) + (1 - alpha) * accelOnly;

    out.push({ t, truthDeg: truth, gyroOnlyDeg: gyroOnly, accelOnlyDeg: accelOnly, fusedDeg: fused });
  }
  return out;
}

/** RMS error of an estimator against truth, in degrees. */
export function rmsError(samples: FusionSample[], pick: (s: FusionSample) => number): number {
  if (samples.length === 0) return NaN;
  const sum = samples.reduce((acc, s) => acc + (pick(s) - s.truthDeg) ** 2, 0);
  return Math.sqrt(sum / samples.length);
}

/**
 * ACCELEROMETER — Spec §38.
 * An accelerometer measures SPECIFIC FORCE, not acceleration and not tilt.
 * At rest it reads +g upward; in free fall it reads zero while accelerating at g.
 * The spec explicitly warns against the "measures tilt" oversimplification.
 */
export function specificForce(linearAccel: Vec3, gravityInBody: Vec3): Vec3 {
  return subV(linearAccel, gravityInBody);
}

/** Tilt recovered from specific force — valid ONLY when linear acceleration is zero. */
export function tiltFromSpecificForce(f: Vec3): { rollDeg: number; pitchDeg: number; valid: boolean } {
  const magnitude = normV(f);
  // If |f| departs from g the platform is accelerating, and the tilt is wrong.
  const valid = Math.abs(magnitude - GRAVITY) < 0.15;
  return {
    rollDeg: (Math.atan2(f.y, f.z) * 180) / Math.PI,
    pitchDeg: (Math.atan2(-f.x, Math.hypot(f.y, f.z)) * 180) / Math.PI,
    valid,
  };
}

/**
 * BODY FRAME → WORLD FRAME — Spec §34.
 * Z-Y-X (yaw-pitch-roll) rotation, the usual aerospace convention.
 */
export function bodyToWorld(v: Vec3, rollDeg: number, pitchDeg: number, yawDeg: number): Vec3 {
  const r = (rollDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;

  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cy = Math.cos(y);
  const sy = Math.sin(y);

  return v3(
    v.x * (cy * cp) + v.y * (cy * sp * sr - sy * cr) + v.z * (cy * sp * cr + sy * sr),
    v.x * (sy * cp) + v.y * (sy * sp * sr + cy * cr) + v.z * (sy * sp * cr - cy * sr),
    v.x * -sp + v.y * (cp * sr) + v.z * (cp * cr),
  );
}

export function worldToBody(v: Vec3, rollDeg: number, pitchDeg: number, yawDeg: number): Vec3 {
  // The rotation matrix is orthonormal, so the inverse is the transpose:
  // apply the same rotation with negated angles in reverse order.
  const r = (rollDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;

  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cy = Math.cos(y);
  const sy = Math.sin(y);

  return v3(
    v.x * (cy * cp) + v.y * (sy * cp) + v.z * -sp,
    v.x * (cy * sp * sr - sy * cr) + v.y * (sy * sp * sr + cy * cr) + v.z * (cp * sr),
    v.x * (cy * sp * cr + sy * sr) + v.y * (sy * sp * cr - cy * sr) + v.z * (cp * cr),
  );
}
