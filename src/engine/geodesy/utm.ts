/**
 * UTM + ELLIPSOID DEMONSTRATION ENGINE — Spec §63, §66, §67, §55, §209.
 *
 * Educational implementation of the standard Transverse Mercator series
 * (Karney/Snyder form, terms to e⁶). Accurate to a few millimetres within the
 * normal ±3° zone width, which is far beyond what the training labs need —
 * but it must be good enough that the *convergence* and *scale factor* lessons
 * show real numbers rather than decoration.
 *
 * LIMITATIONS (stated per §228):
 *  - single ellipsoid family, no datum transformation, no grid shift files;
 *  - not a replacement for PROJ/EPSG transformation in production survey work;
 *  - height is not transformed here at all — see height.ts.
 */

export interface Ellipsoid {
  name: string;
  /** Semi-major axis, metres. */
  a: number;
  /** Inverse flattening. */
  invF: number;
}

export const WGS84: Ellipsoid = { name: 'WGS 84', a: 6378137.0, invF: 298.257223563 };
export const GRS80: Ellipsoid = { name: 'GRS 1980', a: 6378137.0, invF: 298.257222101 };

export const UTM_SCALE_FACTOR = 0.9996;
export const FALSE_EASTING = 500000;
export const FALSE_NORTHING_SOUTH = 10000000;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function utmZoneFromLongitude(lonDeg: number): number {
  const wrapped = ((lonDeg + 180) % 360 + 360) % 360 - 180;
  return Math.min(60, Math.max(1, Math.floor((wrapped + 180) / 6) + 1));
}

export function centralMeridian(zone: number): number {
  return (zone - 1) * 6 - 180 + 3;
}

export interface UtmResult {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: 'N' | 'S';
  /** Meridian convergence γ in degrees, east positive (§55). */
  convergenceDeg: number;
  /** Point scale factor k (§66) — grid distance ÷ ellipsoidal distance. */
  scaleFactor: number;
}

/** Geographic → UTM. Latitude/longitude in degrees. */
export function geodeticToUtm(
  latDeg: number,
  lonDeg: number,
  ellipsoid: Ellipsoid = WGS84,
  forceZone?: number,
): UtmResult {
  const zone = forceZone ?? utmZoneFromLongitude(lonDeg);
  const lambda0 = rad(centralMeridian(zone));
  const phi = rad(latDeg);
  const lambda = rad(lonDeg);

  const f = 1 / ellipsoid.invF;
  const a = ellipsoid.a;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);

  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lambda - lambda0);

  // Meridional arc.
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));

  const easting =
    UTM_SCALE_FACTOR *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) +
    FALSE_EASTING;

  let northing =
    UTM_SCALE_FACTOR *
    (M +
      N *
        Math.tan(phi) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));

  const hemisphere: 'N' | 'S' = latDeg >= 0 ? 'N' : 'S';
  if (hemisphere === 'S') northing += FALSE_NORTHING_SOUTH;

  return {
    easting,
    northing,
    zone,
    hemisphere,
    convergenceDeg: meridianConvergence(latDeg, lonDeg, zone, ellipsoid),
    scaleFactor: pointScaleFactor(latDeg, lonDeg, zone, ellipsoid),
  };
}

/** UTM → geographic. Returns degrees. */
export function utmToGeodetic(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: 'N' | 'S',
  ellipsoid: Ellipsoid = WGS84,
): { latDeg: number; lonDeg: number } {
  const f = 1 / ellipsoid.invF;
  const a = ellipsoid.a;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const x = easting - FALSE_EASTING;
  const y = hemisphere === 'S' ? northing - FALSE_NORTHING_SOUTH : northing;

  const M = y / UTM_SCALE_FACTOR;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const C1 = ep2 * Math.cos(phi1) ** 2;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * UTM_SCALE_FACTOR);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720);

  const lon =
    rad(centralMeridian(zone)) +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1);

  return { latDeg: deg(lat), lonDeg: deg(lon) };
}

/**
 * MERIDIAN CONVERGENCE — Spec §55.
 * γ ≈ (λ − λ₀) · sin φ, refined with the standard third-order term.
 * East positive: grid north lies east of true north when the point is east of
 * the central meridian in the northern hemisphere.
 */
export function meridianConvergence(
  latDeg: number,
  lonDeg: number,
  zone: number = utmZoneFromLongitude(lonDeg),
  ellipsoid: Ellipsoid = WGS84,
): number {
  const phi = rad(latDeg);
  const dLambda = rad(lonDeg - centralMeridian(zone));
  const f = 1 / ellipsoid.invF;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const eta2 = ep2 * Math.cos(phi) ** 2;
  const t2 = Math.tan(phi) ** 2;
  const gamma =
    dLambda * Math.sin(phi) +
    (dLambda ** 3 / 3) * Math.sin(phi) * Math.cos(phi) ** 2 * (1 + 3 * eta2 + 2 * eta2 ** 2) +
    (dLambda ** 5 / 15) * Math.sin(phi) * Math.cos(phi) ** 4 * (2 - t2);
  return deg(gamma);
}

/**
 * POINT SCALE FACTOR — Spec §66.
 * k ≈ k₀ · (1 + (x')²/(2R²)) where x' is the distance from the central meridian.
 * Below 0.9996 near the CM, above 1.0 near the zone edge: a 1 km grid distance
 * is not a 1 km ground distance, which is why mine grids exist (§70).
 */
export function pointScaleFactor(
  latDeg: number,
  lonDeg: number,
  zone: number = utmZoneFromLongitude(lonDeg),
  ellipsoid: Ellipsoid = WGS84,
): number {
  const phi = rad(latDeg);
  const dLambda = rad(lonDeg - centralMeridian(zone));
  const f = 1 / ellipsoid.invF;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const eta2 = ep2 * Math.cos(phi) ** 2;
  const t2 = Math.tan(phi) ** 2;
  const A = Math.cos(phi) * dLambda;
  return (
    UTM_SCALE_FACTOR *
    (1 + ((1 + eta2) * A ** 2) / 2 + ((5 - 4 * t2 + 42 * eta2) * A ** 4) / 24)
  );
}

/**
 * Grid distance ↔ ground distance (§66, §70).
 * Combined factor also needs the height-above-ellipsoid elevation factor:
 *   elevation factor = R / (R + h)
 */
export function combinedScaleFactor(
  pointScale: number,
  ellipsoidalHeightM: number,
  meanRadiusM = 6371000,
): number {
  return pointScale * (meanRadiusM / (meanRadiusM + ellipsoidalHeightM));
}
