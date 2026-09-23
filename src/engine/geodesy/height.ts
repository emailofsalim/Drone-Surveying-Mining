/**
 * HEIGHT ENGINE — Spec §64, §65, §71, §76–§79, §166, §238.
 *
 * The single relationship every mine surveyor must hold:
 *
 *   h = H + N
 *
 *   h — ellipsoidal height  (what raw GNSS delivers)
 *   H — orthometric height  (RL / levelled height, what engineering uses)
 *   N — geoid undulation    (separation, can be tens of metres)
 *
 * Treating h as H is the classic blunder: the whole surface shifts vertically
 * by N, volumes computed against a design surface are wrong, and the ortho
 * still "looks perfect" (§242).
 *
 * LIMITATION (§228): no geoid model ships with this application. N must be
 * supplied by the learner from the applicable geoid model for the site. The
 * engine never invents a separation.
 */

export type DroneAltitudeTerm =
  | 'AGL'          // above ground level, relative to terrain under the aircraft
  | 'ATO'          // above take-off point
  | 'AMSL'         // above mean sea level (orthometric-ish)
  | 'ELLIPSOIDAL'  // raw GNSS height
  | 'BAROMETRIC';  // pressure-derived, drifts with weather

export interface HeightValue {
  value: number;
  type: 'ellipsoidal' | 'orthometric' | 'geoid-separation' | 'AGL' | 'ATO' | 'barometric';
  reference: string;
  units: string;
  source: string;
  quality: string;
}

/** h = H + N */
export function ellipsoidalFromOrthometric(H: number, N: number): number {
  return H + N;
}

/** H = h − N */
export function orthometricFromEllipsoidal(h: number, N: number): number {
  return h - N;
}

/** N = h − H */
export function geoidSeparation(h: number, H: number): number {
  return h - H;
}

/**
 * The error introduced by ignoring the geoid: exactly N, applied to every
 * point of the surface. Volume error over an area A is therefore ≈ N × A when
 * the reference surface is held fixed.
 */
export function ignoredGeoidError(N: number, areaM2: number): { verticalM: number; volumeM3: number } {
  return { verticalM: N, volumeM3: N * areaM2 };
}

/**
 * DIFFERENTIAL LEVELLING — Spec §73, §74 (rise & fall).
 * Reduces a levelling run and returns the arithmetic check that proves the
 * reduction was performed correctly.
 */
export interface LevellingObservation {
  station: string;
  backsight?: number;
  intersight?: number;
  foresight?: number;
}

export interface LevellingResult {
  rows: Array<{ station: string; rise?: number; fall?: number; rl: number }>;
  sumBacksight: number;
  sumForesight: number;
  sumRise: number;
  sumFall: number;
  firstRl: number;
  lastRl: number;
  /** ΣBS − ΣFS must equal ΣRise − ΣFall must equal last RL − first RL. */
  checksPass: boolean;
  misclosure: number;
}

export function reduceRiseAndFall(
  observations: LevellingObservation[],
  startingRl: number,
  toleranceM = 1e-6,
): LevellingResult {
  const rows: LevellingResult['rows'] = [];
  let rl = startingRl;
  let previousReading: number | undefined;
  let sumBS = 0;
  let sumFS = 0;
  let sumRise = 0;
  let sumFall = 0;

  for (const obs of observations) {
    // At a change point the station carries BOTH a foresight (read from the old
    // setup) and a backsight (read from the new one). The rise/fall belongs to
    // the foresight; the backsight only becomes the reference for the NEXT
    // station. Taking the backsight here would silently corrupt the run.
    const reading = obs.foresight ?? obs.intersight ?? obs.backsight;
    if (reading === undefined) {
      throw new Error(`Observation at "${obs.station}" has no staff reading.`);
    }
    if (obs.backsight !== undefined) sumBS += obs.backsight;
    if (obs.foresight !== undefined) sumFS += obs.foresight;

    if (previousReading === undefined) {
      rows.push({ station: obs.station, rl });
    } else {
      // Staff reading decreasing means the ground rose.
      const diff = previousReading - reading;
      rl += diff;
      if (diff >= 0) {
        sumRise += diff;
        rows.push({ station: obs.station, rise: diff, rl });
      } else {
        sumFall += -diff;
        rows.push({ station: obs.station, fall: -diff, rl });
      }
    }
    // A backsight after a foresight is a change point: the next comparison
    // uses the new instrument setup's backsight reading.
    previousReading = obs.backsight ?? reading;
  }

  const firstRl = rows[0]?.rl ?? startingRl;
  const lastRl = rows[rows.length - 1]?.rl ?? startingRl;
  const checkA = sumBS - sumFS;
  const checkB = sumRise - sumFall;
  const checkC = lastRl - firstRl;
  const checksPass =
    Math.abs(checkA - checkB) < toleranceM && Math.abs(checkB - checkC) < toleranceM;

  return {
    rows,
    sumBacksight: sumBS,
    sumForesight: sumFS,
    sumRise,
    sumFall,
    firstRl,
    lastRl,
    checksPass,
    misclosure: checkA - checkC,
  };
}

/**
 * TRIGONOMETRIC HEIGHT / TOTAL STATION — Spec §75.
 *
 *   ΔH = S·cos(Z) + HI − HT
 *
 * S  slope distance, Z zenith angle, HI instrument height, HT target height.
 * Wrong target height is one of the listed causes of a wrong RL (§238).
 */
export function trigonometricHeightDifference(
  slopeDistanceM: number,
  zenithAngleDeg: number,
  instrumentHeightM: number,
  targetHeightM: number,
): number {
  const z = (zenithAngleDeg * Math.PI) / 180;
  return slopeDistanceM * Math.cos(z) + instrumentHeightM - targetHeightM;
}

/**
 * DRONE ALTITUDE TERMS — Spec §77, §78, §79.
 *
 * "100 m" means five different things. In a pit, ATO and AGL diverge by the
 * full bench depth, and a mission flown at constant ATO over a descending pit
 * loses GSD consistency — or clears the highwall by far less than planned.
 */
export interface AltitudeResolution {
  agl: number;
  aboveTakeoff: number;
  terrainElevation: number;
  takeoffElevation: number;
  /** Difference between the two ways of reading the same flight (§78). */
  divergence: number;
}

export function resolveAltitude(
  aboveTakeoffM: number,
  takeoffElevationM: number,
  terrainElevationUnderAircraftM: number,
): AltitudeResolution {
  const absolute = takeoffElevationM + aboveTakeoffM;
  const agl = absolute - terrainElevationUnderAircraftM;
  return {
    agl,
    aboveTakeoff: aboveTakeoffM,
    terrainElevation: terrainElevationUnderAircraftM,
    takeoffElevation: takeoffElevationM,
    divergence: agl - aboveTakeoffM,
  };
}
