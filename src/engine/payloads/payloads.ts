/**
 * PAYLOAD ENGINE — Spec §93–§99, Phases 19, 31, 32.
 *
 * RGB photogrammetry is PASSIVE: it infers geometry from correspondences, so
 * it needs texture, light and overlap, and it fails where any of those are
 * missing (§94, §241).
 *
 * LiDAR is ACTIVE: it measures range directly, so it works at night, in low
 * texture, and can see ground through gaps in vegetation. In exchange it needs
 * a trajectory good enough to georeference every shot, and a boresight
 * calibration to relate the scanner frame to the navigation frame (§95–§97).
 *
 * SIMPLIFIED TRAINING MODEL. No radiometric transfer, no waveform processing,
 * no atmospheric model beyond a stated transmission factor.
 */

export const SPEED_OF_LIGHT = 299_792_458;

/* ------------------------------- LiDAR ----------------------------- */

/** R ≈ c·Δt / 2 — the two-way time of flight (§95). */
export function rangeFromTimeOfFlight(deltaTseconds: number): number {
  return (SPEED_OF_LIGHT * deltaTseconds) / 2;
}

export function timeOfFlightForRange(rangeM: number): number {
  return (2 * rangeM) / SPEED_OF_LIGHT;
}

/**
 * Timing precision needed for a target range precision.
 * σ_R = c·σ_t / 2  ⇒  σ_t = 2·σ_R / c
 * A 1 cm range precision demands about 67 picoseconds — which is why LiDAR
 * timing electronics are the expensive part.
 */
export function timingPrecisionForRange(rangeSigmaM: number): number {
  return (2 * rangeSigmaM) / SPEED_OF_LIGHT;
}

export interface LidarSpec {
  id: string;
  name: string;
  /** Pulses per second. */
  pulseRateHz: number;
  /** Full swath angle, degrees. */
  fieldOfViewDeg: number;
  /** Scanner rotations or sweeps per second. */
  scanRateHz: number;
  /** 1σ ranging precision, metres. */
  rangeSigmaM: number;
  /** Beam divergence, milliradians. */
  beamDivergenceMrad: number;
  /** Number of returns recorded per pulse. */
  returns: number;
}

export const LIDAR_PROFILES: LidarSpec[] = [
  {
    id: 'lidar-survey',
    name: 'Generic UAV survey LiDAR',
    pulseRateHz: 240_000,
    fieldOfViewDeg: 70,
    scanRateHz: 20,
    rangeSigmaM: 0.02,
    beamDivergenceMrad: 0.5,
    returns: 3,
  },
  {
    id: 'lidar-corridor',
    name: 'Generic corridor LiDAR (narrow swath)',
    pulseRateHz: 600_000,
    fieldOfViewDeg: 40,
    scanRateHz: 50,
    rangeSigmaM: 0.015,
    beamDivergenceMrad: 0.3,
    returns: 5,
  },
];

export interface LidarCoverage {
  swathWidthM: number;
  /** Ground footprint diameter of a single beam at nadir. */
  beamFootprintM: number;
  pointDensityPerM2: number;
  /** Spacing between successive scan lines along track. */
  lineSpacingM: number;
  /** Spacing between points across track at nadir. */
  acrossSpacingM: number;
  /** Side overlap achieved at the given flight-line spacing. */
  swathOverlap: number;
  warnings: string[];
}

/**
 * Coverage geometry for a nadir-scanning LiDAR.
 *   swath = 2 · H · tan(FOV/2)
 *   along-track line spacing = ground speed / scan rate
 *   density ≈ pulse rate / (swath × ground speed)
 */
export function lidarCoverage(
  lidar: LidarSpec,
  heightAglM: number,
  groundSpeedMs: number,
  flightLineSpacingM: number,
): LidarCoverage {
  const swathWidthM = 2 * heightAglM * Math.tan((lidar.fieldOfViewDeg * Math.PI) / 360);
  const lineSpacingM = groundSpeedMs / lidar.scanRateHz;
  const pointsPerLine = lidar.pulseRateHz / lidar.scanRateHz;
  const acrossSpacingM = swathWidthM / Math.max(1, pointsPerLine);
  const pointDensityPerM2 = lidar.pulseRateHz / Math.max(1e-9, swathWidthM * groundSpeedMs);
  const swathOverlap = 1 - flightLineSpacingM / swathWidthM;

  const warnings: string[] = [];
  if (swathOverlap < 0.2) {
    warnings.push(
      `Swath overlap of ${(swathOverlap * 100).toFixed(0)}% leaves little redundancy. Overlapping ` +
        'swaths are how a strip adjustment detects and removes trajectory and boresight error.',
    );
  }
  if (swathOverlap < 0) {
    warnings.push('Flight lines are further apart than the swath: there will be gaps in coverage.');
  }
  if (lineSpacingM > acrossSpacingM * 5) {
    warnings.push(
      'Along-track line spacing is much coarser than across-track point spacing. The cloud will be ' +
        'anisotropic — it resolves detail across the swath far better than along it.',
    );
  }

  return {
    swathWidthM,
    beamFootprintM: (lidar.beamDivergenceMrad / 1000) * heightAglM,
    pointDensityPerM2,
    lineSpacingM,
    acrossSpacingM,
    swathOverlap,
    warnings,
  };
}

/**
 * LiDAR TRAJECTORY — Spec §96.
 *
 * A LiDAR point is only as good as the trajectory that georeferences it:
 *   point = trajectory position + R(attitude) · (scanner-frame vector)
 *
 * A position error moves the point one-for-one. An ATTITUDE error is worse: it
 * is multiplied by the range, so the same angular error costs ten times more
 * from 200 m than from 20 m.
 */
export interface TrajectoryErrorBudget {
  positionErrorM: number;
  attitudeErrorDeg: number;
  rangeM: number;
  /** Ground error contributed by the attitude term, metres. */
  attitudeContributionM: number;
  rangeContributionM: number;
  totalM: number;
  dominant: 'position' | 'attitude' | 'range';
}

export function trajectoryErrorBudget(
  positionSigmaM: number,
  attitudeSigmaDeg: number,
  rangeM: number,
  rangeSigmaM: number,
): TrajectoryErrorBudget {
  const attitudeContributionM = rangeM * Math.tan((attitudeSigmaDeg * Math.PI) / 180);
  const total = Math.hypot(positionSigmaM, attitudeContributionM, rangeSigmaM);

  const terms: Array<[TrajectoryErrorBudget['dominant'], number]> = [
    ['position', positionSigmaM],
    ['attitude', attitudeContributionM],
    ['range', rangeSigmaM],
  ];
  const dominant = terms.reduce((max, t) => (t[1] > max[1] ? t : max))[0];

  return {
    positionErrorM: positionSigmaM,
    attitudeErrorDeg: attitudeSigmaDeg,
    rangeM,
    attitudeContributionM,
    rangeContributionM: rangeSigmaM,
    totalM: total,
    dominant,
  };
}

/**
 * BORESIGHT — Spec §97.
 *
 * The scanner and the IMU are bolted together, but never perfectly aligned.
 * The residual misalignment is a constant rotation. Because it is constant, it
 * does not look like noise: it tilts the whole swath, and shows up as a
 * systematic separation between overlapping strips.
 *
 *   strip separation ≈ 2 · R · tan(boresight error)   for opposing flight lines
 */
export function boresightStripSeparation(boresightErrorDeg: number, rangeM: number): number {
  return 2 * rangeM * Math.tan((boresightErrorDeg * Math.PI) / 180);
}

export function boresightFromStripSeparation(separationM: number, rangeM: number): number {
  return (Math.atan(separationM / (2 * rangeM)) * 180) / Math.PI;
}

/* ------------------------------ thermal ---------------------------- */

/**
 * THERMAL — Spec §98.
 *
 * A thermal camera measures radiance, not temperature. Converting one to the
 * other needs the emissivity of the surface, the reflected background and the
 * atmospheric transmission — all of which must be stated, or the number is a
 * false-colour picture, not a measurement.
 *
 * Stefan-Boltzmann for the apparent radiance:
 *   L = ε·σ·T⁴ + (1−ε)·σ·T_bg⁴,  attenuated by τ.
 */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

export interface ThermalInput {
  /** True surface temperature, °C. */
  surfaceTempC: number;
  /** Surface emissivity, 0–1. */
  emissivity: number;
  /** Reflected background temperature, °C. */
  backgroundTempC: number;
  /** Atmospheric transmission, 0–1. */
  transmission: number;
  /** Air temperature along the path, °C. */
  pathTempC: number;
}

export interface ThermalResult {
  /** Temperature the camera would report if it assumed ε = 1 and τ = 1. */
  apparentTempC: number;
  /** Error introduced by that assumption. */
  errorC: number;
  radianceWm2: number;
  notes: string[];
}

export function apparentTemperature(input: ThermalInput): ThermalResult {
  const toK = (c: number) => c + 273.15;
  const emitted = input.emissivity * STEFAN_BOLTZMANN * toK(input.surfaceTempC) ** 4;
  const reflected = (1 - input.emissivity) * STEFAN_BOLTZMANN * toK(input.backgroundTempC) ** 4;
  const atPath = input.transmission * (emitted + reflected);
  const pathEmission = (1 - input.transmission) * STEFAN_BOLTZMANN * toK(input.pathTempC) ** 4;
  const radiance = atPath + pathEmission;

  // Invert assuming a perfect blackbody through a perfect atmosphere.
  const apparentK = Math.pow(radiance / STEFAN_BOLTZMANN, 0.25);
  const apparentTempC = apparentK - 273.15;

  const notes: string[] = [
    'A thermal camera measures radiance. Temperature requires emissivity, reflected background ' +
      'and atmospheric transmission to be stated (§98).',
  ];
  if (input.emissivity < 0.9) {
    notes.push(
      `At ε = ${input.emissivity.toFixed(2)} a large share of what the camera sees is reflected from ` +
        'the surroundings, not emitted by the surface.',
    );
  }
  if (input.transmission < 0.9) {
    notes.push('Atmospheric attenuation over a long slant range pulls the apparent temperature toward air temperature.');
  }

  return {
    apparentTempC,
    errorC: apparentTempC - input.surfaceTempC,
    radianceWm2: radiance,
    notes,
  };
}

/* --------------------------- multispectral ------------------------- */

/**
 * MULTISPECTRAL — Spec §99.
 *   NDVI = (NIR − Red) / (NIR + Red)
 * The specification is explicit that exact band definitions depend on the
 * sensor, so the band centres are carried with the result.
 */
export interface BandDefinition {
  name: string;
  centreNm: number;
  widthNm: number;
}

export interface NdviInput {
  nir: number;
  red: number;
  nirBand: BandDefinition;
  redBand: BandDefinition;
}

export interface NdviResult {
  ndvi: number;
  interpretation: string;
  bands: string;
  caveat: string;
}

export function ndvi(input: NdviInput): NdviResult {
  const denominator = input.nir + input.red;
  const value = denominator === 0 ? NaN : (input.nir - input.red) / denominator;

  let interpretation: string;
  if (!Number.isFinite(value)) interpretation = 'undefined — both bands read zero';
  else if (value < 0) interpretation = 'water, snow or cloud — NIR below red';
  else if (value < 0.1) interpretation = 'bare rock, soil, sand or built surface';
  else if (value < 0.3) interpretation = 'sparse or stressed vegetation';
  else if (value < 0.6) interpretation = 'moderate vegetation cover';
  else interpretation = 'dense, vigorous vegetation';

  return {
    ndvi: value,
    interpretation,
    bands: `NIR ${input.nirBand.centreNm}±${input.nirBand.widthNm / 2} nm, Red ${input.redBand.centreNm}±${input.redBand.widthNm / 2} nm`,
    caveat:
      'NDVI is an index, not a measurement of biomass or health. Values are comparable only ' +
      'between images with the same bands, the same radiometric calibration and similar illumination.',
  };
}

export const TYPICAL_BANDS: Record<string, BandDefinition> = {
  blue: { name: 'Blue', centreNm: 475, widthNm: 32 },
  green: { name: 'Green', centreNm: 560, widthNm: 27 },
  red: { name: 'Red', centreNm: 668, widthNm: 16 },
  redEdge: { name: 'Red edge', centreNm: 717, widthNm: 12 },
  nir: { name: 'Near infrared', centreNm: 842, widthNm: 57 },
};

/* ------------------------- payload selection ----------------------- */

export interface PayloadTask {
  id: string;
  label: string;
  /** Does the target surface have usable photogrammetric texture? */
  hasTexture: boolean;
  /** Is the ground obscured by vegetation? */
  vegetated: boolean;
  /** Must the survey run in darkness or poor light? */
  lowLight: boolean;
  /** Is a temperature or spectral property being measured, not geometry? */
  nonGeometric: boolean;
}

export interface PayloadRecommendation {
  payload: 'RGB photogrammetry' | 'LiDAR' | 'Thermal' | 'Multispectral';
  reasoning: string;
  caveat: string;
}

/**
 * Payload selection follows from the OBJECTIVE, never from what is in the case
 * (§10, golden principle 1). This returns a reasoned recommendation, not a
 * winner — the specification forbids claiming universal superiority (§19).
 */
export function recommendPayload(task: PayloadTask): PayloadRecommendation {
  if (task.nonGeometric) {
    return {
      payload: 'Thermal',
      reasoning:
        'The objective is a thermal property, not geometry. No amount of photogrammetry measures ' +
        'temperature.',
      caveat:
        'Thermal gives radiance. Turning that into temperature needs emissivity, background and ' +
        'transmission, and the result is not a survey-grade geometric product.',
    };
  }
  if (task.vegetated) {
    return {
      payload: 'LiDAR',
      reasoning:
        'Photogrammetry reconstructs the surface it can SEE. Where vegetation covers the ground, ' +
        'that surface is the canopy. LiDAR returns multiple echoes per pulse, so some reach the ' +
        'ground through gaps.',
      caveat:
        'LiDAR does not see through solid cover, only through gaps. It also needs a trajectory and ' +
        'a boresight calibration, and it produces no imagery — so no orthomosaic without a camera.',
    };
  }
  if (task.lowLight) {
    return {
      payload: 'LiDAR',
      reasoning: 'Active ranging supplies its own energy and does not depend on ambient light.',
      caveat: 'Cost, weight and processing complexity are all higher than an RGB survey.',
    };
  }
  if (!task.hasTexture) {
    return {
      payload: 'LiDAR',
      reasoning:
        'Photogrammetry needs distinguishable features to match. A uniform surface — water, fresh ' +
        'snow, a freshly graded muck pile — offers nothing to match, and the reconstruction fails ' +
        'or invents geometry (§241).',
      caveat: 'Ranging to a specular surface such as open water returns little or nothing either.',
    };
  }
  return {
    payload: 'RGB photogrammetry',
    reasoning:
      'Textured, well-lit ground with no vegetation problem is exactly where photogrammetry is ' +
      'strongest: it delivers geometry AND an orthomosaic from the same flight, at the lowest cost.',
    caveat:
      'It remains dependent on overlap, texture, lighting and network geometry, and it measures ' +
      'the surface it can see — not the ground beneath anything standing on it.',
  };
}
