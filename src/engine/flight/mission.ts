/**
 * MISSION EXECUTION ENGINE — Spec §100, §102–§111, Phases 20–23.
 *
 * Generates a survey flight over the virtual mine and flies it deterministically,
 * producing the telemetry, the image records and the data lineage that every
 * later processing stage consumes. One dataset, one chain (§5, §111).
 *
 * SIMPLIFIED TRAINING MODEL: constant-speed legs, instantaneous turns,
 * no aircraft dynamics. Turn time is added as a flat allowance. This is a
 * mission *geometry and bookkeeping* model, not a flight-dynamics model.
 */

import type { CameraSpec } from '../camera/gsd';
import { gsdFromSensor, imageFootprint, spacingForOverlap } from '../camera/gsd';
import { terrainElevation } from '../../data/mine';
import { windTriangle } from '../geodesy/north';

export interface MissionPlan {
  /** Area of interest, local grid metres. */
  aoi: { eMin: number; eMax: number; nMin: number; nMax: number };
  camera: CameraSpec;
  /** Commanded height above the take-off point, metres. */
  heightAboveTakeoffM: number;
  takeoffRl: number;
  forwardOverlap: number;
  sideOverlap: number;
  /** Airspeed, m/s. */
  airspeedMs: number;
  /** Flight-line direction, grid degrees. */
  lineAzimuthDeg: number;
  terrainFollowing: boolean;
  windFromDeg: number;
  windSpeedMs: number;
  /** Seconds lost at each end-of-line turn. */
  turnAllowanceS: number;
}

export interface Waypoint {
  index: number;
  line: number;
  e: number;
  n: number;
  /** Commanded absolute RL of the aircraft. */
  aircraftRl: number;
  /** Ground RL beneath the aircraft. */
  groundRl: number;
  agl: number;
}

export interface ImageRecord {
  /** Deterministic filename — the lineage anchor (§107, §111). */
  filename: string;
  /** Seconds from take-off. */
  t: number;
  line: number;
  e: number;
  n: number;
  aircraftRl: number;
  groundRl: number;
  agl: number;
  headingDeg: number;
  /** Achieved GSD over the ground actually beneath the camera. */
  gsdM: number;
  footprintWidthM: number;
  footprintLengthM: number;
  gnssMode: string;
  /** True when the image is degraded — blur, a gap, or a bad fix. */
  flagged: boolean;
  flags: string[];
}

export interface MissionResult {
  waypoints: Waypoint[];
  images: ImageRecord[];
  lineCount: number;
  lineSpacingM: number;
  imageSpacingM: number;
  /** Ground speed on the outbound and return headings, m/s. */
  groundSpeedOutMs: number;
  groundSpeedBackMs: number;
  totalDistanceM: number;
  flightTimeS: number;
  /** Worst-case and best-case GSD actually achieved over the terrain. */
  gsdMinM: number;
  gsdMaxM: number;
  /** Minimum clearance above terrain anywhere on the flight, metres. */
  minClearanceM: number;
  warnings: string[];
}

/**
 * Plan and fly the mission.
 *
 * Without terrain following the aircraft holds a constant absolute RL, so AGL
 * and GSD vary with the ground beneath it — the §79 lesson, made numeric.
 */
export function flyMission(plan: MissionPlan): MissionResult {
  const warnings: string[] = [];
  const commandedRl = plan.takeoffRl + plan.heightAboveTakeoffM;

  const nominalFootprint = imageFootprint(plan.camera, plan.heightAboveTakeoffM);
  const lineSpacingM = spacingForOverlap(nominalFootprint.widthM, plan.sideOverlap);
  const imageSpacingM = spacingForOverlap(nominalFootprint.lengthM, plan.forwardOverlap);

  const width = plan.aoi.eMax - plan.aoi.eMin;
  const length = plan.aoi.nMax - plan.aoi.nMin;
  const centreE = (plan.aoi.eMin + plan.aoi.eMax) / 2;
  const centreN = (plan.aoi.nMin + plan.aoi.nMax) / 2;

  // Line direction and the perpendicular that steps between lines.
  const az = (plan.lineAzimuthDeg * Math.PI) / 180;
  const dir = { e: Math.sin(az), n: Math.cos(az) };
  const perp = { e: Math.cos(az), n: -Math.sin(az) };

  // Half-extent of the block along each of those directions.
  const halfAlong = (Math.abs(dir.e) * width + Math.abs(dir.n) * length) / 2;
  const halfAcross = (Math.abs(perp.e) * width + Math.abs(perp.n) * length) / 2;

  const lineCount = Math.max(2, Math.ceil((2 * halfAcross) / lineSpacingM) + 1);
  const perLine = Math.max(2, Math.ceil((2 * halfAlong) / imageSpacingM) + 1);

  // Wind solution for both directions of travel.
  const out = windTriangle(plan.lineAzimuthDeg, plan.airspeedMs, plan.windFromDeg, plan.windSpeedMs);
  const back = windTriangle(
    (plan.lineAzimuthDeg + 180) % 360,
    plan.airspeedMs,
    plan.windFromDeg,
    plan.windSpeedMs,
  );
  if (!out.achievable || !back.achievable) {
    warnings.push(
      'The wind exceeds what this airspeed can hold on at least one flight line. The aircraft cannot ' +
        'maintain the planned track — replan the line direction or stop.',
    );
  }
  const groundSpeedOut = out.achievable ? out.groundSpeedMs : plan.airspeedMs;
  const groundSpeedBack = back.achievable ? back.groundSpeedMs : plan.airspeedMs;

  const waypoints: Waypoint[] = [];
  const images: ImageRecord[] = [];

  let t = 0;
  let totalDistance = 0;
  let gsdMin = Number.POSITIVE_INFINITY;
  let gsdMax = 0;
  let minClearance = Number.POSITIVE_INFINITY;
  let index = 0;

  for (let line = 0; line < lineCount; line++) {
    const across = -halfAcross + line * lineSpacingM;
    const reverse = line % 2 === 1;
    const groundSpeed = reverse ? groundSpeedBack : groundSpeedOut;
    const headingDeg = reverse
      ? (back.achievable ? back.headingDeg : (plan.lineAzimuthDeg + 180) % 360)
      : (out.achievable ? out.headingDeg : plan.lineAzimuthDeg);

    for (let i = 0; i < perLine; i++) {
      const step = reverse ? perLine - 1 - i : i;
      const along = -halfAlong + step * imageSpacingM;

      const e = centreE + dir.e * along + perp.e * across;
      const n = centreN + dir.n * along + perp.n * across;
      const groundRl = terrainElevation(e, n);

      const aircraftRl = plan.terrainFollowing
        ? groundRl + plan.heightAboveTakeoffM
        : commandedRl;
      const agl = aircraftRl - groundRl;

      const gsd = gsdFromSensor(plan.camera, Math.max(1, agl));
      const footprint = imageFootprint(plan.camera, Math.max(1, agl));

      gsdMin = Math.min(gsdMin, gsd);
      gsdMax = Math.max(gsdMax, gsd);
      minClearance = Math.min(minClearance, agl);

      waypoints.push({ index, line, e, n, aircraftRl, groundRl, agl });

      const flags: string[] = [];
      if (agl < 20) flags.push('LOW CLEARANCE');
      if (agl <= 0) flags.push('TERRAIN CONFLICT');

      images.push({
        filename: `SIM_${String(line + 1).padStart(2, '0')}_${String(i + 1).padStart(4, '0')}.JPG`,
        t,
        line: line + 1,
        e,
        n,
        aircraftRl,
        groundRl,
        agl,
        headingDeg,
        gsdM: gsd,
        footprintWidthM: footprint.widthM,
        footprintLengthM: footprint.lengthM,
        gnssMode: 'RTK-fixed',
        flagged: flags.length > 0,
        flags,
      });

      index++;
      if (i < perLine - 1) {
        totalDistance += imageSpacingM;
        t += imageSpacingM / groundSpeed;
      }
    }

    if (line < lineCount - 1) {
      totalDistance += lineSpacingM;
      t += lineSpacingM / plan.airspeedMs + plan.turnAllowanceS;
    }
  }

  if (!plan.terrainFollowing && gsdMax / gsdMin > 1.25) {
    warnings.push(
      `Achieved GSD varies by ${((gsdMax / gsdMin - 1) * 100).toFixed(0)}% across the block because the ` +
        'flight holds a constant absolute height over changing ground. Terrain following, or a height ' +
        'chosen for the highest ground, is the control (§79, §88).',
    );
  }
  if (minClearance < 30) {
    warnings.push(
      `Minimum clearance above terrain is ${minClearance.toFixed(0)} m. Check it against the site's ` +
        'separation requirements and the highest obstacle in the block before flying anything.',
    );
  }
  if (Math.abs(groundSpeedOut - groundSpeedBack) > 1.5) {
    warnings.push(
      `Ground speed differs by ${Math.abs(groundSpeedOut - groundSpeedBack).toFixed(1)} m/s between ` +
        'outbound and return lines. At a fixed trigger interval that produces different forward overlap ' +
        'in each direction.',
    );
  }

  return {
    waypoints,
    images,
    lineCount,
    lineSpacingM,
    imageSpacingM,
    groundSpeedOutMs: groundSpeedOut,
    groundSpeedBackMs: groundSpeedBack,
    totalDistanceM: totalDistance,
    flightTimeS: t,
    gsdMinM: gsdMin,
    gsdMaxM: gsdMax,
    minClearanceM: minClearance,
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * PRE-FLIGHT — Spec §102, §103
 * ------------------------------------------------------------------ */

export type CheckState = 'pass' | 'fail' | 'caution';

export interface PreflightItem {
  id: string;
  group: string;
  label: string;
  /** What makes this a STOP rather than a note. */
  stopCondition: string;
  state: CheckState;
  detail?: string;
}

export type FaultId =
  | 'damaged-prop'
  | 'low-battery'
  | 'bad-gnss'
  | 'compass-anomaly'
  | 'empty-storage'
  | 'wrong-mission'
  | 'missing-gcp'
  | 'weather';

export interface Fault {
  id: FaultId;
  label: string;
  /** Which checklist item it shows up on. */
  affects: string;
  state: CheckState;
  detail: string;
  /** What happens to the survey if it is flown anyway. */
  consequence: string;
}

export const FAULTS: Fault[] = [
  {
    id: 'damaged-prop',
    label: 'Chipped propeller blade',
    affects: 'propeller',
    state: 'fail',
    detail: 'Hairline chip on one blade tip. Balance is off; vibration is elevated at cruise RPM.',
    consequence:
      'Vibration reaches the camera through the gimbal. Images blur in a way that survives visual ' +
      'inspection but destroys keypoint detection, and the alignment fails on those lines (§28, §241).',
  },
  {
    id: 'low-battery',
    label: 'Battery below planned state of charge',
    affects: 'battery',
    state: 'fail',
    detail: 'Pack at 68%. The mission needs more than the usable capacity plus reserve.',
    consequence:
      'The aircraft returns mid-block or triggers a low-voltage failsafe. The survey ends up with a ' +
      'missing strip — invisible until processing fails to bridge the gap.',
  },
  {
    id: 'bad-gnss',
    label: 'GNSS not fixed',
    affects: 'gnss',
    state: 'fail',
    detail: 'Solution reports RTK FLOAT. Correction age is climbing.',
    consequence:
      'Camera positions are decimetre-to-metre level instead of centimetre. The block can still be ' +
      'rescued by GCPs — but only if enough were placed, and the height component stays weak.',
  },
  {
    id: 'compass-anomaly',
    label: 'Compass interference warning',
    affects: 'compass',
    state: 'caution',
    detail: 'Aircraft is parked 6 m from a steel container. Magnetometer magnitude reads high.',
    consequence:
      'A calibration performed here will "succeed" and still leave a heading error once the aircraft ' +
      'moves away. Move to a magnetically clean area first (§48).',
  },
  {
    id: 'empty-storage',
    label: 'Storage card not verified',
    affects: 'storage',
    state: 'fail',
    detail: 'Card contains a previous mission and has 3.2 GB free. The plan needs 14 GB.',
    consequence:
      'Capture stops partway through the block. The aircraft keeps flying the pattern, so the flight ' +
      'looks nominal and the gap is discovered at the office.',
  },
  {
    id: 'wrong-mission',
    label: 'Wrong mission file loaded',
    affects: 'mission',
    state: 'fail',
    detail: 'Loaded mission is last month\'s block, offset 400 m north of the current AOI.',
    consequence:
      'A technically perfect survey of the wrong ground. Every quality indicator passes.',
  },
  {
    id: 'missing-gcp',
    label: 'GCP targets not placed or not observed',
    affects: 'gcp',
    state: 'fail',
    detail: 'Four targets laid out; none observed yet, and no checkpoints planned.',
    consequence:
      'Without observed control there is nothing to constrain the block, and without checkpoints there ' +
      'is no independent evidence of accuracy at all (§112, §152).',
  },
  {
    id: 'weather',
    label: 'Wind above planned limit',
    affects: 'weather',
    state: 'caution',
    detail: 'Gusting beyond the planned figure, from across the flight lines.',
    consequence:
      'Crab angle rotates every footprint, reducing achieved side overlap, and ground speed differs ' +
      'between outbound and return lines (§27, §90).',
  },
];

const BASE_CHECKLIST: Array<Omit<PreflightItem, 'state'>> = [
  { id: 'aircraft', group: 'Aircraft', label: 'Airframe, arms and landing gear', stopCondition: 'Any crack, deformation or loose fastener.' },
  { id: 'propeller', group: 'Aircraft', label: 'Propellers', stopCondition: 'Any chip, crack, delamination or imbalance.' },
  { id: 'motor', group: 'Aircraft', label: 'Motors and mounts', stopCondition: 'Roughness, play or abnormal noise when spun by hand.' },
  { id: 'battery', group: 'Aircraft', label: 'Battery state of charge, health and temperature', stopCondition: 'Below the planned state of charge, swollen, damaged, or outside the manufacturer temperature range.' },
  { id: 'gnss', group: 'Navigation', label: 'GNSS solution and satellite count', stopCondition: 'Not the positioning mode the survey requires.' },
  { id: 'imu', group: 'Navigation', label: 'IMU status', stopCondition: 'Any calibration or health warning.' },
  { id: 'compass', group: 'Navigation', label: 'Compass health and environment', stopCondition: 'Interference warning, or a magnetically disturbed take-off area.' },
  { id: 'camera', group: 'Payload', label: 'Camera settings, focus and lens cleanliness', stopCondition: 'Wrong exposure mode, dirty lens, or a shutter speed that blurs at planned speed.' },
  { id: 'storage', group: 'Payload', label: 'Storage formatted, verified and sufficient', stopCondition: 'Insufficient free space for the planned image count.' },
  { id: 'mission', group: 'Mission', label: 'Correct mission file, AOI and parameters', stopCondition: 'Any discrepancy between the loaded mission and the intended block.' },
  { id: 'homepoint', group: 'Mission', label: 'Home point and RTH altitude', stopCondition: 'RTH altitude below the highest obstacle on the return path.' },
  { id: 'weather', group: 'Conditions', label: 'Wind, visibility, precipitation, temperature', stopCondition: 'Outside the aircraft or the site limits.' },
  { id: 'hazards', group: 'Conditions', label: 'HEMM, blasting, powerlines, people, exclusion zones', stopCondition: 'Any active conflict, or an uncontrolled hazard in the flight area.' },
  { id: 'control', group: 'Survey', label: 'Radio link and failsafe behaviour', stopCondition: 'Degraded link, or a failsafe not configured for the site.' },
  { id: 'gcp', group: 'Survey', label: 'GCPs and independent checkpoints placed and observed', stopCondition: 'Control not observed, or no independent checkpoints.' },
  { id: 'data', group: 'Survey', label: 'Data handling and backup plan agreed', stopCondition: 'No agreed path for preserving raw data before processing.' },
];

export interface PreflightResult {
  items: PreflightItem[];
  passed: number;
  cautions: number;
  failures: number;
  /** A single failure is a stop. The checklist is not a score. */
  cleared: boolean;
  stopReasons: string[];
}

export function runPreflight(activeFaults: FaultId[]): PreflightResult {
  const faultsByTarget = new Map<string, Fault>();
  for (const id of activeFaults) {
    const fault = FAULTS.find((f) => f.id === id);
    if (fault) faultsByTarget.set(fault.affects, fault);
  }

  const items: PreflightItem[] = BASE_CHECKLIST.map((base) => {
    const fault = faultsByTarget.get(base.id);
    return fault
      ? { ...base, state: fault.state, detail: fault.detail }
      : { ...base, state: 'pass' as CheckState };
  });

  const failures = items.filter((i) => i.state === 'fail');
  const cautions = items.filter((i) => i.state === 'caution');

  return {
    items,
    passed: items.filter((i) => i.state === 'pass').length,
    cautions: cautions.length,
    failures: failures.length,
    cleared: failures.length === 0,
    stopReasons: failures.map((f) => `${f.label} — ${f.stopCondition}`),
  };
}

/* ------------------------------------------------------------------ *
 * IN-FLIGHT INCIDENTS — Spec §108
 * ------------------------------------------------------------------ */

export interface IncidentOption {
  label: string;
  correct: boolean;
  reasoning: string;
}

export interface Incident {
  id: string;
  title: string;
  situation: string;
  options: IncidentOption[];
}

export const INCIDENTS: Incident[] = [
  {
    id: 'rtk-float',
    title: 'RTK drops to FLOAT mid-block',
    situation:
      'The solution degrades from FIXED to FLOAT on line 7 of 14. Correction age is rising. The aircraft ' +
      'is holding the pattern normally and the images are still being captured.',
    options: [
      {
        label: 'Continue the mission and note the affected lines',
        correct: false,
        reasoning:
          'Carrying on is defensible only if the block has enough observed GCPs to constrain it without ' +
          'the camera positions. Noting it is necessary but not sufficient — decide first whether the ' +
          'control can carry the block.',
      },
      {
        label: 'Continue, and re-fly the affected lines once the fix returns',
        correct: true,
        reasoning:
          'Keeps the aircraft safe, preserves what is already good, and repairs the weak section rather ' +
          'than discarding or quietly accepting it. Record the affected filenames in the lineage.',
      },
      {
        label: 'Land immediately and abandon the survey',
        correct: false,
        reasoning:
          'A float solution is a data-quality problem, not a safety problem. Landing is the answer to a ' +
          'hazard, not to a degraded fix.',
      },
      {
        label: 'Ignore it — the GCPs will fix everything',
        correct: false,
        reasoning:
          'GCPs constrain the block, they do not repair weak geometry, and they cannot be assumed to ' +
          'rescue the vertical. This is the assumption behind a result that passes internally and fails ' +
          'on checkpoints (§242).',
      },
    ],
  },
  {
    id: 'wind-increase',
    title: 'Wind increases across the flight lines',
    situation:
      'Telemetry shows ground speed on alternate lines differing by 3 m/s and the aircraft holding a ' +
      'visible crab angle. Battery consumption is ahead of plan.',
    options: [
      {
        label: 'Continue at the planned trigger interval',
        correct: false,
        reasoning:
          'A fixed trigger interval with different ground speeds gives different forward overlap in each ' +
          'direction. The slower direction wastes images; the faster one may fall below what matching needs.',
      },
      {
        label: 'Return, replan the lines into the wind, and re-fly',
        correct: true,
        reasoning:
          'Flying lines parallel to the wind equalises the two directions, removes most of the crab angle ' +
          'from the footprints, and makes the energy budget predictable again.',
      },
      {
        label: 'Increase airspeed to compensate',
        correct: false,
        reasoning:
          'Higher speed increases motion blur at the same exposure and does nothing about the crab angle ' +
          'rotating every footprint.',
      },
    ],
  },
  {
    id: 'battery-margin',
    title: 'Battery margin shrinking',
    situation:
      'Two lines remain. The reserve needed to return to the launch point and land is close to the ' +
      'remaining usable capacity. The pit floor is 120 m below the launch pad.',
    options: [
      {
        label: 'Finish the two lines, then return',
        correct: false,
        reasoning:
          'The reserve exists precisely so that it is not spent on "just two more lines". A return leg ' +
          'climbing out of a pit into a headwind costs more than the level-flight figure suggests.',
      },
      {
        label: 'Return now, swap the battery, and resume from the last completed line',
        correct: true,
        reasoning:
          'A survey flown in two sorties is normal and costs an overlap strip. A forced landing on a pit ' +
          'floor costs the aircraft, the data, and possibly more.',
      },
      {
        label: 'Land on the pit floor to save energy',
        correct: false,
        reasoning:
          'Landing inside an active pit puts the aircraft and any recovery party into the hazard area, ' +
          'and the site controls that govern entry still apply.',
      },
    ],
  },
  {
    id: 'missing-line',
    title: 'A flight line is missing from the image count',
    situation:
      'The aircraft has landed. The expected image count for the block is 612; the card holds 548, and ' +
      'the gap corresponds to one complete line near the centre of the AOI.',
    options: [
      {
        label: 'Process anyway — the overlap elsewhere will bridge the gap',
        correct: false,
        reasoning:
          'A missing central line splits the image network into two weakly connected halves. Alignment ' +
          'may still "succeed" while the two halves sit at a relative offset (§121).',
      },
      {
        label: 'Re-fly the missing line before leaving the site',
        correct: true,
        reasoning:
          'Re-flying one line on site is cheap. Discovering the network weakness after demobilisation is ' +
          'not. Check the count against the plan before packing up — that is what the count is for.',
      },
      {
        label: 'Add extra GCPs over the gap instead',
        correct: false,
        reasoning:
          'Control constrains a block; it does not create the image observations that were never captured.',
      },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * POST-FLIGHT AND DATA LINEAGE — Spec §110, §111
 * ------------------------------------------------------------------ */

export interface PostFlightAsset {
  id: string;
  label: string;
  /** Approximate size for the bookkeeping lesson. */
  sizeMb: number;
  required: boolean;
  note: string;
}

export function postFlightAssets(imageCount: number): PostFlightAsset[] {
  return [
    {
      id: 'images',
      label: 'Images (raw, unmodified)',
      sizeMb: Math.round(imageCount * 11),
      required: true,
      note: 'Never edited in place. The raw set is the observation record (§111).',
    },
    {
      id: 'flight-log',
      label: 'Flight log / telemetry',
      sizeMb: 12,
      required: true,
      note: 'Evidence of what the aircraft actually did, as distinct from what was planned.',
    },
    {
      id: 'gnss-raw',
      label: 'Raw GNSS observations (rover)',
      sizeMb: 34,
      required: true,
      note: 'Required for PPK. Without it a post-processed trajectory is impossible after the fact.',
    },
    {
      id: 'base-raw',
      label: 'Base / CORS observations',
      sizeMb: 28,
      required: true,
      note: 'And the base coordinate, with the reference frame it is expressed in.',
    },
    {
      id: 'mission-file',
      label: 'Mission file as flown',
      sizeMb: 1,
      required: true,
      note: 'The plan and the execution are two different records; keep both.',
    },
    {
      id: 'control',
      label: 'Control and checkpoint observations',
      sizeMb: 1,
      required: true,
      note: 'With their CRS, vertical reference, method and observation quality.',
    },
    {
      id: 'field-notes',
      label: 'Field notebook',
      sizeMb: 2,
      required: true,
      note: 'Weather, anomalies, incidents, decisions taken and why (§174).',
    },
  ];
}
