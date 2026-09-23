/**
 * Tests for the sensor, GNSS, aerodynamics and mission engines.
 * Phases 07–11, 15–16, 20–23.
 */

import { describe, expect, it } from 'vitest';

import {
  bodyToWorld,
  complementaryFilter,
  driftTimeToLimit,
  freeInertialDrift,
  GRAVITY,
  IMU_GRADES,
  normV,
  rmsError,
  specificForce,
  tiltFromSpecificForce,
  v3,
  worldToBody,
} from '../src/engine/sensors/imu';
import {
  applyDistortion,
  assessCalibration,
  calibrate,
  disturbanceAt,
  earthFieldNED,
  headingErrorFromDisturbance,
  horizontalIntensity,
  magneticHeading,
  NO_DISTORTION,
  removeDistortion,
  safeDistanceM,
  yawSweep,
  type Distortion,
  type MagneticField,
} from '../src/engine/sensors/magnetometer';
import {
  baseCoordinateErrorImpact,
  computeDop,
  dropoutComparison,
  modeProfile,
  pitMaskAngleDeg,
  solvePosition,
  syntheticConstellation,
} from '../src/engine/gnss/gnss';
import {
  airDensity,
  AIR_DENSITY_SEA_LEVEL,
  BATTERIES,
  centreOfGravityOffset,
  controlMoment,
  estimateEndurance,
  hoverAnalysis,
  hoverPowerW,
  inducedVelocityMs,
  mixMotors,
  propellerThrustN,
  QUAD_X_MIXER,
  simulatePid,
  tiltForWind,
  tiltVector,
  weightN,
} from '../src/engine/flight/aerodynamics';
import {
  FAULTS,
  flyMission,
  INCIDENTS,
  postFlightAssets,
  runPreflight,
  type MissionPlan,
} from '../src/engine/flight/mission';
import { cameraById } from '../src/data/cameras';
import { PIT } from '../src/data/mine';

/* ------------------------------- IMU ------------------------------- */

describe('IMU engine', () => {
  const imu = IMU_GRADES[0]!;

  it('grows attitude error linearly with the gyro bias', () => {
    const drift = freeInertialDrift(imu, 100, 100);
    const at10 = drift.find((d) => Math.abs(d.t - 10) < 0.6)!;
    const at20 = drift.find((d) => Math.abs(d.t - 20) < 0.6)!;
    expect(at20.attitudeErrorDeg / at10.attitudeErrorDeg).toBeCloseTo(2, 1);
    expect(at10.attitudeErrorDeg).toBeCloseTo(imu.gyroBiasDegS * at10.t, 6);
  });

  it('grows position error faster than linearly', () => {
    const drift = freeInertialDrift(imu, 60, 60);
    const at10 = drift[10]!;
    const at20 = drift[20]!;
    // At least quadratic: doubling the time more than doubles the error.
    expect(at20.positionErrorM / at10.positionErrorM).toBeGreaterThan(3.5);
  });

  it('ranks sensor grades by how long they hold a position limit', () => {
    const consumer = driftTimeToLimit(IMU_GRADES[0]!, 1);
    const industrial = driftTimeToLimit(IMU_GRADES[1]!, 1);
    const tactical = driftTimeToLimit(IMU_GRADES[2]!, 1);
    expect(industrial).toBeGreaterThan(consumer);
    expect(tactical).toBeGreaterThan(industrial);
  });

  it('fuses gyro and accelerometer better than either alone', () => {
    const truthAt = (t: number) => 12 * Math.sin(t / 3);
    const samples = complementaryFilter(
      { imu, tauS: 1.2, dtS: 0.01, durationS: 60, seed: 3 },
      truthAt,
    );
    const gyro = rmsError(samples, (s) => s.gyroOnlyDeg);
    const accel = rmsError(samples, (s) => s.accelOnlyDeg);
    const fused = rmsError(samples, (s) => s.fusedDeg);
    expect(fused).toBeLessThan(gyro);
    expect(fused).toBeLessThan(accel);
  });

  it('lets the gyro-only solution drift without bound', () => {
    const truthAt = () => 0;
    const short = complementaryFilter({ imu, tauS: 1, dtS: 0.01, durationS: 10, seed: 5 }, truthAt);
    const long = complementaryFilter({ imu, tauS: 1, dtS: 0.01, durationS: 120, seed: 5 }, truthAt);
    expect(Math.abs(long[long.length - 1]!.gyroOnlyDeg)).toBeGreaterThan(
      Math.abs(short[short.length - 1]!.gyroOnlyDeg) * 5,
    );
    // The fused estimate stays bounded because the accelerometer anchors it.
    expect(Math.abs(long[long.length - 1]!.fusedDeg)).toBeLessThan(5);
  });

  it('reads +g upward at rest and zero in free fall', () => {
    const gravityInBody = v3(0, 0, -GRAVITY);
    const atRest = specificForce(v3(0, 0, 0), gravityInBody);
    expect(normV(atRest)).toBeCloseTo(GRAVITY, 9);
    const freeFall = specificForce(v3(0, 0, -GRAVITY), gravityInBody);
    expect(normV(freeFall)).toBeCloseTo(0, 9);
  });

  it('flags a tilt derived from specific force while accelerating', () => {
    expect(tiltFromSpecificForce(v3(0, 0, GRAVITY)).valid).toBe(true);
    // Strong horizontal acceleration inflates |f| beyond g.
    expect(tiltFromSpecificForce(v3(5, 0, GRAVITY)).valid).toBe(false);
  });

  it('round-trips body and world frames', () => {
    const vector = v3(3, -1.5, 8);
    const back = worldToBody(bodyToWorld(vector, 12, -7, 143), 12, -7, 143);
    expect(back.x).toBeCloseTo(vector.x, 9);
    expect(back.y).toBeCloseTo(vector.y, 9);
    expect(back.z).toBeCloseTo(vector.z, 9);
  });

  it('preserves vector length through a rotation', () => {
    const vector = v3(2, 3, 6);
    expect(normV(bodyToWorld(vector, 30, 20, 100))).toBeCloseTo(normV(vector), 9);
  });
});

/* --------------------------- magnetometer -------------------------- */

describe('magnetometer engine', () => {
  const field: MagneticField = { intensityUT: 46, inclinationDeg: 38, declinationDeg: -1.35 };

  it('splits the field into horizontal and vertical components', () => {
    const ned = earthFieldNED(field);
    expect(Math.hypot(ned.x, ned.y)).toBeCloseTo(horizontalIntensity(field), 9);
    expect(normV(ned)).toBeCloseTo(field.intensityUT, 9);
  });

  it('shrinks the horizontal component as dip increases', () => {
    const low = horizontalIntensity({ ...field, inclinationDeg: 10 });
    const high = horizontalIntensity({ ...field, inclinationDeg: 80 });
    expect(high).toBeLessThan(low);
  });

  it('reads the declination as the heading offset with no distortion', () => {
    const sweep = yawSweep(field, NO_DISTORTION, 36);
    const atZero = sweep[0]!;
    // Pointing along grid/true north, the magnetic heading equals −declination.
    expect(magneticHeading(atZero.measured)).toBeCloseTo((360 - field.declinationDeg) % 360, 4);
  });

  it('translates the measurement sphere for a hard-iron offset', () => {
    const hard: Distortion = { ...NO_DISTORTION, hardIron: v3(9, -4, 2) };
    const clean = yawSweep(field, NO_DISTORTION, 72).map((s) => s.measured);
    const dirty = yawSweep(field, hard, 72).map((s) => s.measured);
    const centre = (arr: typeof clean, axis: 'x' | 'y') =>
      (Math.max(...arr.map((v) => v[axis])) + Math.min(...arr.map((v) => v[axis]))) / 2;
    expect(centre(dirty, 'x') - centre(clean, 'x')).toBeCloseTo(9, 3);
    expect(centre(dirty, 'y') - centre(clean, 'y')).toBeCloseTo(-4, 3);
  });

  it('recovers a hard-iron offset by calibration and removes the heading error', () => {
    const actual: Distortion = { ...NO_DISTORTION, hardIron: v3(11, -6, 3) };
    const sweep = yawSweep(field, actual, 72);
    const estimate = calibrate(sweep);
    expect(estimate.hardIron.x).toBeCloseTo(11, 1);
    expect(estimate.hardIron.y).toBeCloseTo(-6, 1);

    const report = assessCalibration(field, actual, estimate, 72);
    const rawMax = Math.max(...report.samples.map((s) => Math.abs(s.rawErrorDeg)));
    expect(rawMax).toBeGreaterThan(5);
    expect(report.maxHeadingErrorDeg).toBeLessThan(0.5);
  });

  it('round-trips the distortion model', () => {
    const d: Distortion = { hardIron: v3(4, 2, -1), softScale: v3(1.1, 0.92, 1.03), softCross: 0.06 };
    const original = v3(30, -12, 25);
    const back = removeDistortion(applyDistortion(original, d), d);
    expect(back.x).toBeCloseTo(original.x, 8);
    expect(back.y).toBeCloseTo(original.y, 8);
    expect(back.z).toBeCloseTo(original.z, 8);
  });

  it('leaves residual error when soft-iron cross-coupling is present (§48)', () => {
    // Min/max calibration cannot observe cross-coupling — the "successful
    // calibration that still leaves a heading error" the spec insists on.
    const actual: Distortion = { hardIron: v3(5, 3, 0), softScale: v3(1, 1, 1), softCross: 0.18 };
    const estimate = calibrate(yawSweep(field, actual, 72));
    const report = assessCalibration(field, actual, estimate, 72);
    expect(report.maxHeadingErrorDeg).toBeGreaterThan(1);
  });

  it('falls off as the cube of distance from a ferrous mass', () => {
    const sources = [{ id: 'ex', name: 'Excavator', e: 0, n: 0, strengthUT: 8000 }];
    const near = disturbanceAt(10, 0, sources);
    const far = disturbanceAt(20, 0, sources);
    expect(near / far).toBeCloseTo(8, 6);
  });

  it('computes a safe distance consistent with the heading-error limit', () => {
    const source = { id: 'ex', name: 'Excavator', e: 0, n: 0, strengthUT: 8000 };
    const horizontal = horizontalIntensity(field);
    const d = safeDistanceM(source, horizontal, 1);
    const errorAtD = headingErrorFromDisturbance(disturbanceAt(d, 0, [source]), horizontal);
    expect(errorAtD).toBeCloseTo(1, 3);
  });
});

/* ------------------------------- GNSS ------------------------------ */

describe('GNSS engine', () => {
  it('needs at least four satellites for a solution', () => {
    const three = syntheticConstellation(14).slice(0, 3);
    expect(computeDop(three).solvable).toBe(false);
    expect(computeDop(syntheticConstellation(14)).solvable).toBe(true);
  });

  it('degrades DOP when the elevation mask cuts the sky', () => {
    const sats = syntheticConstellation(16);
    const open = computeDop(sats, 10);
    const masked = computeDop(sats, 45);
    expect(masked.used).toBeLessThan(open.used);
    expect(masked.pdop).toBeGreaterThan(open.pdop);
  });

  it('keeps VDOP at least as large as HDOP for a sky-only constellation', () => {
    const dop = computeDop(syntheticConstellation(18), 10);
    expect(dop.vdop).toBeGreaterThan(dop.hdop);
    expect(dop.gdop).toBeGreaterThan(dop.pdop);
    expect(dop.pdop).toBeCloseTo(Math.hypot(dop.hdop, dop.vdop), 9);
  });

  it('computes the pit mask angle from depth and distance', () => {
    expect(pitMaskAngleDeg(100, 100)).toBeCloseTo(45, 9);
    expect(pitMaskAngleDeg(0, 100)).toBeCloseTo(0, 9);
    expect(pitMaskAngleDeg(120, 420)).toBeGreaterThan(0);
  });

  it('orders the positioning modes by achievable precision', () => {
    const sats = syntheticConstellation(16);
    const base = { satellites: sats, elevationMaskDeg: 10, baselineKm: 2, correctionAgeS: 1 };
    const autonomous = solvePosition({ ...base, mode: 'autonomous' });
    const float = solvePosition({ ...base, mode: 'RTK-float' });
    const fixed = solvePosition({ ...base, mode: 'RTK-fixed' });
    expect(fixed.horizontalSigmaM).toBeLessThan(float.horizontalSigmaM);
    expect(float.horizontalSigmaM).toBeLessThan(autonomous.horizontalSigmaM);
  });

  it('degrades a fixed solution with baseline length and correction age', () => {
    const sats = syntheticConstellation(16);
    const near = solvePosition({ mode: 'RTK-fixed', satellites: sats, elevationMaskDeg: 10, baselineKm: 1, correctionAgeS: 1 });
    const far = solvePosition({ mode: 'RTK-fixed', satellites: sats, elevationMaskDeg: 10, baselineKm: 60, correctionAgeS: 1 });
    const stale = solvePosition({ mode: 'RTK-fixed', satellites: sats, elevationMaskDeg: 10, baselineKm: 1, correctionAgeS: 30 });
    expect(far.horizontalSigmaM).toBeGreaterThan(near.horizontalSigmaM);
    expect(stale.horizontalSigmaM).toBeGreaterThan(near.horizontalSigmaM);
    expect(far.warnings.join(' ')).toMatch(/baseline/i);
    expect(stale.warnings.join(' ')).toMatch(/correction age/i);
  });

  it('always warns that a float solution is not a fixed solution', () => {
    const solution = solvePosition({
      mode: 'RTK-float',
      satellites: syntheticConstellation(16),
      elevationMaskDeg: 10,
      baselineKm: 1,
      correctionAgeS: 1,
    });
    expect(solution.warnings.join(' ')).toMatch(/not a fixed solution/i);
  });

  it('shows PPK unaffected by a link dropout while RTK degrades', () => {
    const series = dropoutComparison(120, 24);
    const first = series[0]!;
    const last = series[series.length - 1]!;
    expect(last.rtkSigmaM).toBeGreaterThan(first.rtkSigmaM * 5);
    expect(last.ppkSigmaM).toBeCloseTo(first.ppkSigmaM, 12);
    expect(last.ppkSigmaM).toBeCloseTo(modeProfile('PPK').rangeSigmaM, 12);
  });

  it('passes a base-coordinate error one-for-one into the survey', () => {
    const impact = baseCoordinateErrorImpact(0.35);
    expect(impact.surveyShiftM).toBeCloseTo(0.35, 12);
    expect(impact.detectableInternally).toBe(false);
  });
});

/* --------------------------- aerodynamics -------------------------- */

describe('aerodynamics and energy engine', () => {
  it('thins the air with altitude', () => {
    expect(airDensity(0, 15)).toBeCloseTo(AIR_DENSITY_SEA_LEVEL, 2);
    expect(airDensity(3000, 15)).toBeLessThan(airDensity(0, 15));
  });

  it('reports hover thrust equal to weight', () => {
    const hover = hoverAnalysis(6.2, 22, 4);
    expect(hover.hoverThrustN).toBeCloseTo(weightN(6.2), 9);
    expect(hover.thrustToWeight).toBeCloseTo(88 / weightN(6.2), 9);
    expect(hover.climbAccelMs2).toBeCloseTo((88 - weightN(6.2)) / 6.2, 9);
  });

  it('warns when thrust cannot lift the aircraft', () => {
    expect(hoverAnalysis(20, 22, 4).warnings.join(' ')).toMatch(/cannot hover/i);
  });

  it('splits a tilted thrust vector into components', () => {
    const r = tiltVector(100, 30, 6);
    expect(r.verticalN).toBeCloseTo(100 * Math.cos(Math.PI / 6), 9);
    expect(r.horizontalN).toBeCloseTo(100 * Math.sin(Math.PI / 6), 9);
    // Level flight at 30° costs 1/cos(30°) − 1 ≈ 15.5% more thrust.
    expect(r.thrustPenalty).toBeCloseTo(1 / Math.cos(Math.PI / 6) - 1, 9);
  });

  it('needs no extra thrust at zero tilt', () => {
    const r = tiltVector(60, 0, 6);
    expect(r.thrustPenalty).toBeCloseTo(0, 12);
    expect(r.horizontalN).toBeCloseTo(0, 12);
  });

  it('raises the required tilt with the square of the wind speed', () => {
    const slow = tiltForWind(5, 6, 0.09);
    const fast = tiltForWind(10, 6, 0.09);
    expect(fast.dragN / slow.dragN).toBeCloseTo(4, 6);
    expect(fast.tiltDeg).toBeGreaterThan(slow.tiltDeg);
  });

  it('scales the control moment with the arm', () => {
    expect(controlMoment(4, 0.35)).toBeCloseTo(1.4, 12);
    expect(controlMoment(4, 0.7)).toBeCloseTo(2.8, 12);
  });

  it('moves the centre of gravity toward an offset payload', () => {
    const cg = centreOfGravityOffset(5, 1.2, 0.2, 0.35);
    expect(cg.offsetM).toBeCloseTo((1.2 * 0.2) / 6.2, 9);
    expect(cg.correctionThrustN).toBeGreaterThan(0);
    // No offset means no standing moment.
    expect(centreOfGravityOffset(5, 1.2, 0, 0.35).standingMomentNm).toBeCloseTo(0, 12);
  });

  it('increases propeller thrust with diameter at the same power', () => {
    const small = propellerThrustN(0.33, 250);
    const large = propellerThrustN(0.46, 250);
    expect(large).toBeGreaterThan(small);
  });

  it('relates induced velocity to disc loading', () => {
    const v = inducedVelocityMs(20, 0.4);
    const area = (Math.PI * 0.4 ** 2) / 4;
    expect(v).toBeCloseTo(Math.sqrt(20 / (2 * AIR_DENSITY_SEA_LEVEL * area)), 9);
  });

  it('raises hover power with mass and lowers it with rotor area', () => {
    const light = hoverPowerW(4, 0.4, 4);
    const heavy = hoverPowerW(8, 0.4, 4);
    const bigRotor = hoverPowerW(8, 0.56, 4);
    expect(heavy).toBeGreaterThan(light);
    expect(bigRotor).toBeLessThan(heavy);
  });

  it('computes endurance from usable energy and average power', () => {
    const battery = BATTERIES[1]!;
    const result = estimateEndurance({
      battery,
      averagePowerW: 520,
      reserveFraction: 0.25,
      temperatureC: 20,
      stateOfHealth: 1,
    });
    expect(result.nameplateEnergyWh).toBeCloseTo(6 * 3.7 * 9.0, 9);
    expect(result.usableEnergyWh).toBeCloseTo(result.nameplateEnergyWh * 0.75, 9);
    expect(result.enduranceMin).toBeCloseTo((result.usableEnergyWh / 520) * 60, 9);
  });

  it('derates capacity in the cold and warns about it', () => {
    const battery = BATTERIES[0]!;
    const warm = estimateEndurance({ battery, averagePowerW: 400, reserveFraction: 0.25, temperatureC: 25, stateOfHealth: 1 });
    const cold = estimateEndurance({ battery, averagePowerW: 400, reserveFraction: 0.25, temperatureC: -5, stateOfHealth: 1 });
    expect(cold.enduranceMin).toBeLessThan(warm.enduranceMin);
    expect(cold.temperatureDerate).toBeLessThan(1);
    expect(cold.warnings.join(' ')).toMatch(/derated/i);
  });

  it('warns about a thin reserve', () => {
    const result = estimateEndurance({
      battery: BATTERIES[0]!,
      averagePowerW: 400,
      reserveFraction: 0.1,
      temperatureC: 20,
      stateOfHealth: 1,
    });
    expect(result.warnings.join(' ')).toMatch(/reserve/i);
  });

  it('settles a well-tuned PID and oscillates a badly tuned one', () => {
    const tuned = simulatePid({ kp: 8, ki: 2, kd: 1.4 });
    const underdamped = simulatePid({ kp: 60, ki: 20, kd: 0.05 });
    expect(Number.isFinite(tuned.settlingTimeS)).toBe(true);
    expect(tuned.overshoot).toBeLessThan(underdamped.overshoot);
    expect(underdamped.overshoot).toBeGreaterThan(0.2);
  });

  it('leaves no steady-state error on an undisturbed double integrator', () => {
    // P-only is sufficient here: with no standing load the plant settles exactly
    // on the setpoint. This is why the integral term needs a disturbance to show.
    const noIntegral = simulatePid({ kp: 4, ki: 0, kd: 1 }, { durationS: 12 });
    expect(Math.abs(noIntegral.steadyStateError)).toBeLessThan(1e-5);
  });

  it('removes a disturbance-induced steady-state error with integral action', () => {
    // A standing load — a CG offset or a steady wind (§25).
    const opts = { durationS: 20, disturbance: 0.4 };
    const noIntegral = simulatePid({ kp: 4, ki: 0, kd: 1 }, opts);
    const withIntegral = simulatePid({ kp: 4, ki: 3, kd: 1 }, opts);
    // P-only settles offset by −d/kp; integral action drives it to zero.
    expect(Math.abs(noIntegral.steadyStateError)).toBeCloseTo(0.4 / 4, 3);
    expect(Math.abs(withIntegral.steadyStateError)).toBeLessThan(
      Math.abs(noIntegral.steadyStateError) / 10,
    );
  });

  it('mixes motor demands and reports saturation', () => {
    const hover = mixMotors(QUAD_X_MIXER, { throttle: 0.5, roll: 0, pitch: 0, yaw: 0 });
    expect(hover.every((m) => Math.abs(m.output - 0.5) < 1e-12)).toBe(true);
    expect(hover.every((m) => !m.saturated)).toBe(true);

    const rolling = mixMotors(QUAD_X_MIXER, { throttle: 0.5, roll: 0.2, pitch: 0, yaw: 0 });
    // Opposite sides of the airframe must differ under a roll demand.
    expect(rolling[0]!.output).not.toBeCloseTo(rolling[2]!.output, 6);

    const saturated = mixMotors(QUAD_X_MIXER, { throttle: 0.95, roll: 0.4, pitch: 0.3, yaw: 0.2 });
    expect(saturated.some((m) => m.saturated)).toBe(true);
  });

  it('balances yaw torque across counter-rotating pairs at hover', () => {
    const totalYaw = QUAD_X_MIXER.reduce((sum, c) => sum + c.yaw, 0);
    expect(totalYaw).toBeCloseTo(0, 12);
    const totalSpin = QUAD_X_MIXER.reduce((sum, c) => sum + c.spin, 0);
    expect(totalSpin).toBeCloseTo(0, 12);
  });
});

/* ------------------------------ mission ---------------------------- */

describe('mission execution engine', () => {
  const basePlan: MissionPlan = {
    aoi: { eMin: 300, eMax: 1100, nMin: 300, nMax: 1100 },
    camera: cameraById('cam-1inch-20mp'),
    heightAboveTakeoffM: 120,
    takeoffRl: 513,
    forwardOverlap: 0.8,
    sideOverlap: 0.7,
    airspeedMs: 7,
    lineAzimuthDeg: 0,
    terrainFollowing: false,
    windFromDeg: 0,
    windSpeedMs: 0,
    turnAllowanceS: 8,
  };

  it('produces one image per waypoint with deterministic filenames', () => {
    const a = flyMission(basePlan);
    const b = flyMission(basePlan);
    expect(a.images).toHaveLength(a.waypoints.length);
    expect(a.images.map((i) => i.filename)).toEqual(b.images.map((i) => i.filename));
    expect(new Set(a.images.map((i) => i.filename)).size).toBe(a.images.length);
  });

  it('flies alternate lines in opposite directions (boustrophedon)', () => {
    const result = flyMission(basePlan);
    const line1 = result.images.filter((i) => i.line === 1);
    const line2 = result.images.filter((i) => i.line === 2);
    const trend = (arr: typeof line1) => Math.sign(arr[arr.length - 1]!.n - arr[0]!.n);
    expect(trend(line1)).toBe(-trend(line2));
  });

  it('varies achieved GSD over the pit without terrain following', () => {
    const result = flyMission(basePlan);
    expect(result.gsdMaxM).toBeGreaterThan(result.gsdMinM * 1.2);
    expect(result.warnings.join(' ')).toMatch(/GSD varies/i);
  });

  it('holds GSD nearly constant with terrain following', () => {
    const result = flyMission({ ...basePlan, terrainFollowing: true });
    expect(result.gsdMaxM / result.gsdMinM).toBeCloseTo(1, 6);
    expect(result.minClearanceM).toBeCloseTo(basePlan.heightAboveTakeoffM, 6);
  });

  it('increases clearance over the pit floor relative to the crest', () => {
    const result = flyMission(basePlan);
    const overFloor = result.waypoints.reduce((max, w) => Math.max(max, w.agl), 0);
    expect(overFloor).toBeGreaterThan(PIT.crestRl - PIT.floorRl);
  });

  it('differs in ground speed between directions when there is a crosswind component', () => {
    const result = flyMission({ ...basePlan, windFromDeg: 0, windSpeedMs: 6 });
    expect(Math.abs(result.groundSpeedOutMs - result.groundSpeedBackMs)).toBeGreaterThan(1);
    expect(result.warnings.join(' ')).toMatch(/ground speed differs/i);
  });

  it('reports an unachievable line when the wind exceeds the airspeed', () => {
    const result = flyMission({ ...basePlan, airspeedMs: 3, windFromDeg: 90, windSpeedMs: 12 });
    expect(result.warnings.join(' ')).toMatch(/cannot maintain the planned track|exceeds what this airspeed/i);
  });

  it('uses more lines when side overlap increases', () => {
    const loose = flyMission({ ...basePlan, sideOverlap: 0.6 });
    const tight = flyMission({ ...basePlan, sideOverlap: 0.85 });
    expect(tight.lineCount).toBeGreaterThan(loose.lineCount);
    expect(tight.images.length).toBeGreaterThan(loose.images.length);
  });

  it('derives flight time from distance and speed plus turn allowances', () => {
    const result = flyMission(basePlan);
    expect(result.flightTimeS).toBeGreaterThan(result.totalDistanceM / basePlan.airspeedMs);
  });
});

/* ----------------------------- pre-flight -------------------------- */

describe('pre-flight and incidents', () => {
  it('clears a checklist with no faults', () => {
    const result = runPreflight([]);
    expect(result.cleared).toBe(true);
    expect(result.failures).toBe(0);
    expect(result.passed).toBe(result.items.length);
  });

  it('treats any single failure as a stop, not a score', () => {
    const result = runPreflight(['damaged-prop']);
    expect(result.cleared).toBe(false);
    expect(result.failures).toBe(1);
    expect(result.stopReasons).toHaveLength(1);
    // 15 of 16 passing is still a stop.
    expect(result.passed).toBe(result.items.length - 1);
  });

  it('does not block on a caution alone but still reports it', () => {
    const result = runPreflight(['compass-anomaly']);
    expect(result.cleared).toBe(true);
    expect(result.cautions).toBe(1);
  });

  it('maps every fault to a real checklist item', () => {
    const ids = new Set(runPreflight([]).items.map((i) => i.id));
    for (const fault of FAULTS) {
      expect(ids.has(fault.affects), fault.id).toBe(true);
    }
  });

  it('gives every fault a stated survey consequence', () => {
    for (const fault of FAULTS) {
      expect(fault.consequence.length, fault.id).toBeGreaterThan(40);
    }
  });

  it('gives every incident exactly one correct option with reasoning', () => {
    for (const incident of INCIDENTS) {
      const correct = incident.options.filter((o) => o.correct);
      expect(correct, incident.id).toHaveLength(1);
      for (const option of incident.options) {
        expect(option.reasoning.length, `${incident.id}/${option.label}`).toBeGreaterThan(40);
      }
    }
  });

  it('scales the raw-image asset size with the image count', () => {
    const small = postFlightAssets(100).find((a) => a.id === 'images')!;
    const large = postFlightAssets(400).find((a) => a.id === 'images')!;
    expect(large.sizeMb).toBeCloseTo(small.sizeMb * 4, 0);
    expect(postFlightAssets(100).every((a) => a.required)).toBe(true);
  });
});
