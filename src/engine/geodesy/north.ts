/**
 * NORTH REFERENCE ENGINE — Spec §51–§59, §164, §209.
 *
 * Three norths, three different bearings for the same physical line:
 *   TRUE      — along the geographic meridian toward the rotational pole
 *   MAGNETIC  — along the horizontal component of the local magnetic field
 *   GRID      — parallel to the projection's central meridian (northing axis)
 *
 * Sign conventions used throughout (stated explicitly per §235):
 *   declination D  — EAST positive: magnetic north lies east of true north
 *   convergence γ  — EAST positive: grid north lies east of true north
 *
 *   True    = Magnetic + D
 *   Grid    = True − γ
 *   Grid    = Magnetic + D − γ
 *
 * IMPORTANT (§54): declination is not a constant. A real project must take D
 * from a current geomagnetic model for the site, date and altitude. The value
 * used here is whatever the learner supplies; the app never invents one.
 */

export type NorthReference = 'true' | 'magnetic' | 'grid';

export const NORTH_LABEL: Record<NorthReference, string> = {
  true: 'True north (geographic meridian)',
  magnetic: 'Magnetic north (local field, epoch-dependent)',
  grid: 'Grid north (projection northing axis)',
};

/** Wrap any angle into [0, 360). */
export function normalizeAzimuth(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Wrap a difference into (−180, +180] — used for error reporting. */
export function normalizeDelta(deg: number): number {
  let d = normalizeAzimuth(deg);
  if (d > 180) d -= 360;
  return d;
}

export interface NorthContext {
  /** Magnetic declination in degrees, east positive. */
  declinationDeg: number;
  /** Meridian convergence in degrees, east positive. */
  convergenceDeg: number;
}

/**
 * Convert an azimuth between north references.
 * Returns degrees in [0, 360).
 */
export function convertAzimuth(
  azimuthDeg: number,
  from: NorthReference,
  to: NorthReference,
  ctx: NorthContext,
): number {
  if (from === to) return normalizeAzimuth(azimuthDeg);
  const trueAz = toTrue(azimuthDeg, from, ctx);
  return fromTrue(trueAz, to, ctx);
}

function toTrue(az: number, from: NorthReference, ctx: NorthContext): number {
  switch (from) {
    case 'true':
      return az;
    case 'magnetic':
      return az + ctx.declinationDeg;
    case 'grid':
      return az + ctx.convergenceDeg;
  }
}

function fromTrue(trueAz: number, to: NorthReference, ctx: NorthContext): number {
  switch (to) {
    case 'true':
      return normalizeAzimuth(trueAz);
    case 'magnetic':
      return normalizeAzimuth(trueAz - ctx.declinationDeg);
    case 'grid':
      return normalizeAzimuth(trueAz - ctx.convergenceDeg);
  }
}

/**
 * NORTH-CONVERSION ERROR LAB — Spec §58.
 *
 * What happens downstream when a bearing referenced to one north is used as if
 * it were referenced to another: the line rotates by the conversion angle, and
 * the positional error grows linearly with distance.
 *
 *   lateral error ≈ distance × sin(Δ)
 */
export interface NorthErrorResult {
  intendedAzimuth: number;
  appliedAzimuth: number;
  /** Signed angular error in degrees, (−180, +180]. */
  angularErrorDeg: number;
  /** Across-line displacement at the stated distance, metres. */
  lateralErrorM: number;
  /** Along-line shortfall at the stated distance, metres. */
  alongErrorM: number;
  distanceM: number;
}

export function northConversionError(
  azimuthDeg: number,
  assumedAs: NorthReference,
  actuallyIs: NorthReference,
  ctx: NorthContext,
  distanceM: number,
): NorthErrorResult {
  // The observed number is the same; only the reference frame attached to it
  // differs. Express both interpretations in true north to compare them.
  const intendedTrue = toTrue(azimuthDeg, actuallyIs, ctx);
  const appliedTrue = toTrue(azimuthDeg, assumedAs, ctx);
  const delta = normalizeDelta(appliedTrue - intendedTrue);
  const rad = (delta * Math.PI) / 180;
  return {
    intendedAzimuth: normalizeAzimuth(intendedTrue),
    appliedAzimuth: normalizeAzimuth(appliedTrue),
    angularErrorDeg: delta,
    lateralErrorM: distanceM * Math.sin(rad),
    alongErrorM: distanceM * (Math.cos(rad) - 1),
    distanceM,
  };
}

/**
 * Plane bearing from a grid coordinate pair (§57).
 * Convention: azimuth measured clockwise from the +N axis.
 */
export function gridAzimuth(
  from: { e: number; n: number },
  to: { e: number; n: number },
): { azimuthDeg: number; distanceM: number } {
  const dE = to.e - from.e;
  const dN = to.n - from.n;
  return {
    azimuthDeg: normalizeAzimuth((Math.atan2(dE, dN) * 180) / Math.PI),
    distanceM: Math.hypot(dE, dN),
  };
}

/**
 * HEADING VS COURSE — Spec §59, §27 (crab angle).
 *
 * In wind, the aircraft points at `heading` but travels along `course`.
 * The difference is the crab angle. Camera footprints rotate with HEADING,
 * flight lines follow COURSE — a distinction that shows up directly in the
 * overlap a mission actually achieves.
 */
export function crabAngle(headingDeg: number, courseDeg: number): number {
  return normalizeDelta(headingDeg - courseDeg);
}

/**
 * Solve heading and ground speed for a desired course in wind (§26, §27).
 * windFromDeg is the direction the wind blows FROM (meteorological convention).
 */
export function windTriangle(
  courseDeg: number,
  airspeedMs: number,
  windFromDeg: number,
  windSpeedMs: number,
): { headingDeg: number; groundSpeedMs: number; crabDeg: number; achievable: boolean } {
  const windToward = normalizeAzimuth(windFromDeg + 180);
  const rel = ((windToward - courseDeg) * Math.PI) / 180;
  // Cross-track component of wind must be cancelled by the crab angle.
  const cross = windSpeedMs * Math.sin(rel);
  const along = windSpeedMs * Math.cos(rel);
  const ratio = cross / airspeedMs;
  if (Math.abs(ratio) > 1) {
    return { headingDeg: NaN, groundSpeedMs: NaN, crabDeg: NaN, achievable: false };
  }
  const crabRad = -Math.asin(ratio);
  const groundSpeed = airspeedMs * Math.cos(crabRad) + along;
  return {
    headingDeg: normalizeAzimuth(courseDeg + (crabRad * 180) / Math.PI),
    groundSpeedMs: groundSpeed,
    crabDeg: (crabRad * 180) / Math.PI,
    achievable: groundSpeed > 0,
  };
}
