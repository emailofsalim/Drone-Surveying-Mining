/**
 * GNSS ENGINE — Spec Phases 15 & 16 (GNSS, RTK, PPK, CORS, NTRIP).
 *
 * Two ideas carry the whole subject:
 *
 * 1. GEOMETRY MULTIPLIES ERROR.
 *      σ_position = DOP × σ_range
 *    Satellites clustered in one part of the sky give a large DOP, and the
 *    same ranging quality then produces a much worse position. In a pit, the
 *    highwall masks a large part of the sky — which is exactly why GNSS
 *    behaves worse on the floor than on the crest.
 *
 * 2. DIFFERENTIAL TECHNIQUES CANCEL COMMON ERROR.
 *    Ionosphere, troposphere and orbit errors are similar at two nearby
 *    receivers, so differencing removes most of them. The residual grows with
 *    baseline length. This is why a CORS 60 km away is not the same as a base
 *    on the site.
 *
 * SIMPLIFIED TRAINING MODEL (§208). No real ephemerides, no ionospheric model,
 * no carrier-phase ambiguity resolution. DOP is computed properly from the
 * geometry matrix; everything else is an educational error budget.
 */

export type PositioningMode = 'autonomous' | 'SBAS' | 'DGNSS' | 'RTK-float' | 'RTK-fixed' | 'PPK';

export interface ModeProfile {
  mode: PositioningMode;
  label: string;
  /** Representative 1σ range-domain error, metres. */
  rangeSigmaM: number;
  /** Whether the mode needs a correction stream in real time. */
  needsCorrections: boolean;
  description: string;
}

export const MODES: ModeProfile[] = [
  {
    mode: 'autonomous',
    label: 'Autonomous (no corrections)',
    rangeSigmaM: 2.5,
    needsCorrections: false,
    description:
      'Single receiver, broadcast ephemeris. Metre-level. Adequate for navigation, not for survey control.',
  },
  {
    mode: 'SBAS',
    label: 'SBAS',
    rangeSigmaM: 0.9,
    needsCorrections: false,
    description:
      'Satellite-broadcast wide-area corrections. Sub-metre where the service is available; coverage is regional.',
  },
  {
    mode: 'DGNSS',
    label: 'DGNSS (code differential)',
    rangeSigmaM: 0.35,
    needsCorrections: true,
    description: 'Code-phase differential against a base. Decimetre to sub-metre.',
  },
  {
    mode: 'RTK-float',
    label: 'RTK float',
    rangeSigmaM: 0.12,
    needsCorrections: true,
    description:
      'Carrier phase with unresolved integer ambiguities. Better than code, but NOT a fixed solution — never accept float for control.',
  },
  {
    mode: 'RTK-fixed',
    label: 'RTK fixed',
    rangeSigmaM: 0.008,
    needsCorrections: true,
    description:
      'Carrier phase with resolved ambiguities. Centimetre-level, in real time, while the link holds.',
  },
  {
    mode: 'PPK',
    label: 'PPK (post-processed kinematic)',
    rangeSigmaM: 0.007,
    needsCorrections: false,
    description:
      'Same mathematics as RTK, solved afterwards from logged data — and able to process forward and backward through a dropout. No radio link to lose in flight.',
  },
];

export function modeProfile(mode: PositioningMode): ModeProfile {
  const found = MODES.find((m) => m.mode === mode);
  if (!found) throw new Error(`Unknown positioning mode "${mode}"`);
  return found;
}

export interface Satellite {
  id: string;
  /** Azimuth from grid north, degrees. */
  azimuthDeg: number;
  /** Elevation above the horizon, degrees. */
  elevationDeg: number;
  constellation: 'GPS' | 'GLONASS' | 'Galileo' | 'BeiDou';
}

export interface DopResult {
  /** Geometric dilution of precision. */
  gdop: number;
  /** Position (3D) DOP. */
  pdop: number;
  /** Horizontal DOP. */
  hdop: number;
  /** Vertical DOP. */
  vdop: number;
  /** Satellites that passed the mask and were used. */
  used: number;
  solvable: boolean;
}

/**
 * DOP from satellite geometry.
 *
 * Each satellite contributes a row to the design matrix
 *   A_i = [ -cos(el)·sin(az), -cos(el)·cos(az), -sin(el), 1 ]
 * and DOP values are the square roots of the diagonal of (AᵀA)⁻¹.
 *
 * Four satellites are the minimum (three coordinates plus the receiver clock).
 */
export function computeDop(satellites: Satellite[], elevationMaskDeg = 10): DopResult {
  const visible = satellites.filter((s) => s.elevationDeg >= elevationMaskDeg);
  if (visible.length < 4) {
    return { gdop: NaN, pdop: NaN, hdop: NaN, vdop: NaN, used: visible.length, solvable: false };
  }

  const rows = visible.map((s) => {
    const el = (s.elevationDeg * Math.PI) / 180;
    const az = (s.azimuthDeg * Math.PI) / 180;
    return [
      -Math.cos(el) * Math.sin(az),
      -Math.cos(el) * Math.cos(az),
      -Math.sin(el),
      1,
    ] as [number, number, number, number];
  });

  // N = AᵀA (4×4, symmetric).
  const N: number[][] = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
  for (const r of rows) {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        N[i]![j]! += r[i]! * r[j]!;
      }
    }
  }

  const Q = invert4(N);
  if (!Q) {
    return { gdop: NaN, pdop: NaN, hdop: NaN, vdop: NaN, used: visible.length, solvable: false };
  }

  const qEE = Q[0]![0]!;
  const qNN = Q[1]![1]!;
  const qUU = Q[2]![2]!;
  const qTT = Q[3]![3]!;

  return {
    gdop: Math.sqrt(qEE + qNN + qUU + qTT),
    pdop: Math.sqrt(qEE + qNN + qUU),
    hdop: Math.sqrt(qEE + qNN),
    vdop: Math.sqrt(qUU),
    used: visible.length,
    solvable: true,
  };
}

/** Gauss-Jordan inversion of a 4×4 matrix. Returns null if singular. */
function invert4(m: number[][]): number[][] | null {
  const n = 4;
  const a = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];

    const d = a[col]![col]!;
    for (let j = 0; j < 2 * n; j++) a[col]![j]! /= d;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r]![col]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r]![j]! -= factor * a[col]![j]!;
    }
  }

  return a.map((row) => row.slice(n));
}

/**
 * Sky visibility inside a pit.
 *
 * A receiver on the floor sees only the cone of sky above the surrounding
 * highwall. The mask angle is the angle subtended by the wall:
 *
 *   mask = atan(depth_below_crest / horizontal_distance_to_crest)
 *
 * Satellites below that elevation are blocked. This is why the same aircraft
 * reports a good solution at the crest and a poor one on the floor.
 */
export function pitMaskAngleDeg(depthBelowCrestM: number, distanceToCrestM: number): number {
  if (distanceToCrestM <= 0) return 90;
  return (Math.atan(depthBelowCrestM / distanceToCrestM) * 180) / Math.PI;
}

/**
 * Deterministic synthetic constellation. Not real ephemerides — a reproducible
 * spread of satellites for the geometry lesson (§219, §220).
 */
export function syntheticConstellation(count = 14, seed = 7): Satellite[] {
  const constellations: Satellite['constellation'][] = ['GPS', 'GLONASS', 'Galileo', 'BeiDou'];
  const out: Satellite[] = [];
  for (let i = 0; i < count; i++) {
    // Golden-angle spiral gives a well-spread, deterministic sky distribution.
    const azimuthDeg = (i * 137.508 + seed * 11) % 360;
    const elevationDeg = 8 + 74 * Math.abs(Math.sin(i * 1.7 + seed));
    out.push({
      id: `${constellations[i % 4]}-${String(i + 1).padStart(2, '0')}`,
      azimuthDeg,
      elevationDeg,
      constellation: constellations[i % 4]!,
    });
  }
  return out;
}

export interface GnssSolution {
  mode: PositioningMode;
  dop: DopResult;
  /** Horizontal 1σ, metres. */
  horizontalSigmaM: number;
  /** Vertical 1σ, metres. */
  verticalSigmaM: number;
  /** Baseline contribution included in the sigmas, metres. */
  baselineErrorM: number;
  /** Correction-age contribution included in the sigmas, metres. */
  latencyErrorM: number;
  warnings: string[];
}

export interface SolutionInput {
  mode: PositioningMode;
  satellites: Satellite[];
  elevationMaskDeg: number;
  /** Distance to the base station or CORS, kilometres. */
  baselineKm: number;
  /** Age of the last received correction, seconds. */
  correctionAgeS: number;
}

/**
 * Position error budget.
 *
 *   σ_h = HDOP × √(σ_range² + σ_baseline² + σ_latency²)
 *   σ_v = VDOP × (same)
 *
 * Baseline term grows at roughly 1 mm per km for a carrier-phase solution —
 * the standard rule of thumb for residual atmospheric decorrelation.
 * Latency term reflects correction ageing: a stale correction is a wrong one.
 */
export function solvePosition(input: SolutionInput): GnssSolution {
  const profile = modeProfile(input.mode);
  const dop = computeDop(input.satellites, input.elevationMaskDeg);
  const warnings: string[] = [];

  const differential = input.mode !== 'autonomous' && input.mode !== 'SBAS';
  const baselineErrorM = differential ? 0.001 * input.baselineKm : 0;
  const latencyErrorM =
    profile.needsCorrections && input.correctionAgeS > 2
      ? 0.004 * (input.correctionAgeS - 2)
      : 0;

  const rangeSigma = Math.hypot(profile.rangeSigmaM, baselineErrorM, latencyErrorM);

  if (!dop.solvable) {
    warnings.push(
      `Only ${dop.used} satellites above the ${input.elevationMaskDeg}° mask. A solution needs at least four ` +
        '(three coordinates plus the receiver clock). No position is available.',
    );
  } else {
    if (dop.pdop > 6) {
      warnings.push(
        `PDOP ${dop.pdop.toFixed(1)} is poor. The geometry, not the receiver, is limiting the result — ` +
          'typical when a highwall masks half the sky.',
      );
    }
    if (dop.vdop > dop.hdop * 1.5) {
      warnings.push(
        'VDOP well above HDOP: the vertical is always the weaker component in GNSS, and it is the ' +
          'component a mine survey usually cares most about.',
      );
    }
  }

  if (input.mode === 'RTK-float') {
    warnings.push(
      'A float solution has not resolved its integer ambiguities. It is not a fixed solution and ' +
        'must not be used to establish control, however stable it looks.',
    );
  }
  if (profile.needsCorrections && input.correctionAgeS > 10) {
    warnings.push(
      `Correction age ${input.correctionAgeS.toFixed(0)} s. The solution is coasting on stale data and ` +
        'is degrading toward an uncorrected position.',
    );
  }
  if (differential && input.baselineKm > 30) {
    warnings.push(
      `Baseline ${input.baselineKm.toFixed(0)} km. Atmospheric decorrelation over a long baseline weakens ` +
        'the solution and makes ambiguity resolution less reliable.',
    );
  }

  return {
    mode: input.mode,
    dop,
    horizontalSigmaM: dop.solvable ? dop.hdop * rangeSigma : NaN,
    verticalSigmaM: dop.solvable ? dop.vdop * rangeSigma : NaN,
    baselineErrorM,
    latencyErrorM,
    warnings,
  };
}

/**
 * PPK versus RTK during a link dropout.
 *
 * RTK degrades from the moment corrections stop. PPK is unaffected: the data
 * is logged and solved afterwards, forward and backward through the gap.
 * This is the practical argument for PPK over a pit with poor radio coverage.
 */
export function dropoutComparison(
  dropoutS: number,
  samples = 40,
): Array<{ t: number; rtkSigmaM: number; ppkSigmaM: number }> {
  const out: Array<{ t: number; rtkSigmaM: number; ppkSigmaM: number }> = [];
  const fixed = modeProfile('RTK-fixed').rangeSigmaM;
  const autonomous = modeProfile('autonomous').rangeSigmaM;
  for (let i = 0; i <= samples; i++) {
    const t = (dropoutS * i) / samples;
    // Degrade from fixed toward autonomous with a ~20 s time constant.
    const degraded = fixed + (autonomous - fixed) * (1 - Math.exp(-t / 20));
    out.push({ t, rtkSigmaM: degraded, ppkSigmaM: modeProfile('PPK').rangeSigmaM });
  }
  return out;
}

/**
 * NTRIP transport description — Spec Phase 16.
 * Data, not prose, so the UI cannot drift from the explanation.
 */
export const NTRIP_CHAIN = [
  { step: 'Reference station', detail: 'A CORS or a local base logs carrier-phase observations at a known coordinate.' },
  { step: 'NTRIP caster', detail: 'An internet server that lists available mountpoints and relays their streams.' },
  { step: 'Mountpoint', detail: 'One named correction stream, with its own format (RTCM), constellations and rate.' },
  { step: 'NTRIP client', detail: 'The rover (or its controller) authenticates and subscribes over the mobile network.' },
  { step: 'Rover', detail: 'Applies the corrections to its own observations to form a differential solution.' },
] as const;

/**
 * The single most common blunder in base-station work: the base coordinate.
 * Any error in the base position transfers ONE-FOR-ONE into every rover
 * position and therefore into every point of the survey. It is systematic,
 * invisible internally, and fails only against independent checkpoints.
 */
export function baseCoordinateErrorImpact(baseErrorM: number): {
  surveyShiftM: number;
  detectableInternally: boolean;
  note: string;
} {
  return {
    surveyShiftM: baseErrorM,
    detectableInternally: false,
    note:
      'A base-coordinate error shifts every rover position by the same vector. Internal RTK quality ' +
      'indicators stay perfect. Only an independent checkpoint on known control reveals it (§152).',
  };
}
