/**
 * MAGNETOMETER / COMPASS ENGINE — Spec §41–§50, Phase 11.
 *
 * The measurement model the whole calibration lesson rests on:
 *
 *   m_measured = A · m_true + b
 *
 *   b — HARD-IRON offset: permanent magnetism fixed in the body frame.
 *       It TRANSLATES the measurement sphere away from the origin (§45).
 *   A — SOFT-IRON matrix: ferrous material distorting the ambient field.
 *       It turns the sphere into an ELLIPSOID (§46).
 *
 * Calibration estimates A and b and inverts them. The lesson the specification
 * insists on (§48): a calibration performed next to a steel structure can
 * "succeed" — it fits the data it saw — and still leave a large heading error,
 * because the disturbance moves with the environment, not with the aircraft.
 *
 * SIMPLIFIED TRAINING MODEL. A real calibration solves a 9-parameter ellipsoid
 * fit over a full-attitude dataset. Here the soft-iron matrix is restricted to
 * diagonal scale plus one cross-coupling term so the algebra stays inspectable.
 */

import { v3, type Vec3 } from './imu';

export interface MagneticField {
  /** Total field intensity, microtesla. */
  intensityUT: number;
  /** Magnetic inclination (dip), degrees, positive downward. */
  inclinationDeg: number;
  /** Magnetic declination, degrees, east positive. */
  declinationDeg: number;
}

/**
 * Earth's field in the local navigation frame (north, east, down).
 * MAGNETIC DIP — Spec §42: near the poles the horizontal component that a
 * compass depends on becomes small, and heading becomes ill-conditioned.
 */
export function earthFieldNED(field: MagneticField): Vec3 {
  const inc = (field.inclinationDeg * Math.PI) / 180;
  const dec = (field.declinationDeg * Math.PI) / 180;
  const horizontal = field.intensityUT * Math.cos(inc);
  return v3(
    horizontal * Math.cos(dec),
    horizontal * Math.sin(dec),
    field.intensityUT * Math.sin(inc),
  );
}

/** Horizontal intensity — what a compass actually has to work with (§42). */
export function horizontalIntensity(field: MagneticField): number {
  return field.intensityUT * Math.cos((field.inclinationDeg * Math.PI) / 180);
}

export interface Distortion {
  /** Hard-iron bias in body axes, microtesla. */
  hardIron: Vec3;
  /** Soft-iron diagonal scale factors (1 = no distortion). */
  softScale: Vec3;
  /** Single cross-axis coupling term, x into y. */
  softCross: number;
}

export const NO_DISTORTION: Distortion = {
  hardIron: v3(0, 0, 0),
  softScale: v3(1, 1, 1),
  softCross: 0,
};

/** Apply the measurement model: m_measured = A · m_true + b. */
export function applyDistortion(trueField: Vec3, d: Distortion): Vec3 {
  return v3(
    d.softScale.x * trueField.x + d.hardIron.x,
    d.softScale.y * trueField.y + d.softCross * trueField.x + d.hardIron.y,
    d.softScale.z * trueField.z + d.hardIron.z,
  );
}

/** Invert the model with an estimated calibration. */
export function removeDistortion(measured: Vec3, estimate: Distortion): Vec3 {
  const x = (measured.x - estimate.hardIron.x) / (estimate.softScale.x || 1);
  const y = (measured.y - estimate.hardIron.y - estimate.softCross * x) / (estimate.softScale.y || 1);
  const z = (measured.z - estimate.hardIron.z) / (estimate.softScale.z || 1);
  return v3(x, y, z);
}

/**
 * Sweep the aircraft through a full yaw rotation while level, returning what
 * the magnetometer reads at each heading. This is the "rotate the drone"
 * interaction of §43 and the data collection of §47.
 */
export interface MagSample {
  headingDeg: number;
  /** Measured field in body axes. */
  measured: Vec3;
  /** Field that would be measured with no distortion. */
  ideal: Vec3;
}

export function yawSweep(
  field: MagneticField,
  distortion: Distortion,
  steps = 72,
): MagSample[] {
  const ned = earthFieldNED(field);
  const out: MagSample[] = [];
  for (let i = 0; i < steps; i++) {
    const headingDeg = (360 * i) / steps;
    const h = (headingDeg * Math.PI) / 180;
    // Level flight: rotating the body by yaw h rotates the field into body axes.
    const ideal = v3(
      ned.x * Math.cos(h) + ned.y * Math.sin(h),
      -ned.x * Math.sin(h) + ned.y * Math.cos(h),
      ned.z,
    );
    out.push({ headingDeg, ideal, measured: applyDistortion(ideal, distortion) });
  }
  return out;
}

/**
 * Magnetic heading from a level magnetometer reading.
 * Returns degrees from MAGNETIC north — not true north, and not grid north.
 */
export function magneticHeading(m: Vec3): number {
  const heading = (Math.atan2(-m.y, m.x) * 180) / Math.PI;
  return (heading + 360) % 360;
}

/**
 * CALIBRATION — Spec §44, §47.
 *
 * Estimates the hard-iron offset as the centre of the measurement cloud and
 * the soft-iron scale from the per-axis half-ranges, normalised so the average
 * radius is preserved. This is the classic min/max calibration: it is what a
 * short field procedure can achieve, and its weaknesses are part of the lesson.
 */
export function calibrate(samples: MagSample[]): Distortion {
  if (samples.length === 0) return NO_DISTORTION;

  const xs = samples.map((s) => s.measured.x);
  const ys = samples.map((s) => s.measured.y);
  const zs = samples.map((s) => s.measured.z);

  const centre = (arr: number[]) => (Math.max(...arr) + Math.min(...arr)) / 2;
  const halfRange = (arr: number[]) => (Math.max(...arr) - Math.min(...arr)) / 2;

  const hardIron = v3(centre(xs), centre(ys), centre(zs));
  const rx = halfRange(xs);
  const ry = halfRange(ys);
  const rz = halfRange(zs);
  const mean = (rx + ry + rz) / 3 || 1;

  return {
    hardIron,
    // Scale each axis so its half-range matches the mean radius.
    softScale: v3(rx / mean || 1, ry / mean || 1, rz / mean || 1),
    // Min/max calibration cannot observe cross-coupling — a real limitation,
    // and the reason a "successful" calibration can still leave heading error.
    softCross: 0,
  };
}

export interface CalibrationReport {
  estimate: Distortion;
  /** Worst heading error over the sweep, degrees. */
  maxHeadingErrorDeg: number;
  /** RMS heading error over the sweep, degrees. */
  rmsHeadingErrorDeg: number;
  /** Residual spread of |m| after calibration — the "fit quality" figure. */
  magnitudeResidualUT: number;
  samples: Array<{ headingDeg: number; rawErrorDeg: number; correctedErrorDeg: number }>;
}

export function assessCalibration(
  field: MagneticField,
  actual: Distortion,
  estimate: Distortion,
  steps = 72,
): CalibrationReport {
  const sweep = yawSweep(field, actual, steps);
  const rows = sweep.map((s) => {
    const corrected = removeDistortion(s.measured, estimate);
    const idealHeading = magneticHeading(s.ideal);
    const delta = (a: number, b: number) => {
      let d = ((a - b + 540) % 360) - 180;
      return d;
    };
    return {
      headingDeg: s.headingDeg,
      rawErrorDeg: delta(magneticHeading(s.measured), idealHeading),
      correctedErrorDeg: delta(magneticHeading(corrected), idealHeading),
    };
  });

  const magnitudes = sweep.map((s) => {
    const c = removeDistortion(s.measured, estimate);
    return Math.hypot(c.x, c.y, c.z);
  });
  const magnitudeResidualUT = (Math.max(...magnitudes) - Math.min(...magnitudes)) / 2;

  const errs = rows.map((r) => Math.abs(r.correctedErrorDeg));
  return {
    estimate,
    maxHeadingErrorDeg: Math.max(...errs),
    rmsHeadingErrorDeg: Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length),
    magnitudeResidualUT,
    samples: rows,
  };
}

/**
 * LOCAL MAGNETIC DISTURBANCE — Spec §49, §50.
 *
 * A ferrous mass behaves approximately as a magnetic dipole: its field falls
 * off as 1/r³. That cube law is the whole practical lesson — doubling the
 * distance from an excavator cuts the disturbance by a factor of eight.
 */
export interface DisturbanceSource {
  id: string;
  name: string;
  e: number;
  n: number;
  /** Disturbance magnitude at 1 m, microtesla. */
  strengthUT: number;
}

export function disturbanceAt(
  e: number,
  n: number,
  sources: DisturbanceSource[],
  minRadiusM = 1,
): number {
  return sources.reduce((total, s) => {
    const r = Math.max(minRadiusM, Math.hypot(e - s.e, n - s.n));
    return total + s.strengthUT / r ** 3;
  }, 0);
}

/**
 * Heading error caused by a horizontal disturbance of magnitude `disturbUT`
 * acting across a horizontal Earth field of `horizontalUT`.
 *
 *   error ≈ atan(disturbance / horizontal)
 *
 * Note this grows sharply at high magnetic latitudes, where the horizontal
 * component is small (§42).
 */
export function headingErrorFromDisturbance(disturbUT: number, horizontalUT: number): number {
  if (horizontalUT <= 0) return NaN;
  return (Math.atan(disturbUT / horizontalUT) * 180) / Math.PI;
}

/** Distance at which a source's disturbance drops below a heading-error limit. */
export function safeDistanceM(
  source: DisturbanceSource,
  horizontalUT: number,
  limitDeg: number,
): number {
  const limitUT = horizontalUT * Math.tan((limitDeg * Math.PI) / 180);
  if (limitUT <= 0) return Number.POSITIVE_INFINITY;
  return Math.cbrt(source.strengthUT / limitUT);
}
