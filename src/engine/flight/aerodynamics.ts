/**
 * AERODYNAMICS, PROPULSION AND ENERGY — Spec §21–§33, Phases 07–09.
 *
 * SIMPLIFIED TRAINING MODEL (§208, §21). These are educational relationships.
 * They do not completely describe multirotor rotor aerodynamics: blade-element
 * effects, rotor inflow, ground effect, vortex-ring state and airframe
 * interference are all absent. The purpose is to connect thrust, tilt, wind
 * and energy to the survey outcome, not to predict aircraft performance.
 */

export const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m³, ISA
export const GRAVITY = 9.80665;

/** ISA density at altitude — thinner air means less thrust for the same RPM. */
export function airDensity(altitudeM: number, temperatureC = 15): number {
  // Simplified ISA troposphere model.
  const T0 = 288.15;
  const L = 0.0065;
  const T = T0 - L * altitudeM;
  const p = 101325 * Math.pow(T / T0, 5.2561);
  const actualT = temperatureC + 273.15;
  return p / (287.05 * actualT);
}

/** W = m·g */
export const weightN = (massKg: number): number => massKg * GRAVITY;

/**
 * HOVER — Spec §22.  T_total ≈ m·g
 * Thrust-to-weight ratio is the headroom available for climb, wind rejection
 * and the loss of one motor.
 */
export interface HoverState {
  weightN: number;
  hoverThrustN: number;
  maxThrustN: number;
  thrustToWeight: number;
  /** Fraction of maximum thrust used just to stay up. */
  hoverLoad: number;
  /** Vertical acceleration available at full thrust, m/s². */
  climbAccelMs2: number;
  warnings: string[];
}

export function hoverAnalysis(massKg: number, maxThrustPerMotorN: number, motors: number): HoverState {
  const w = weightN(massKg);
  const maxThrust = maxThrustPerMotorN * motors;
  const ratio = maxThrust / w;
  const warnings: string[] = [];

  if (ratio < 1.3) {
    warnings.push(
      `Thrust-to-weight ${ratio.toFixed(2)} leaves very little margin for climb, wind or a gust. ` +
        'Applicable minimums come from the manufacturer, not from this application.',
    );
  }
  if (ratio < 1.0) {
    warnings.push('Thrust-to-weight below 1.0: this configuration cannot hover.');
  }

  return {
    weightN: w,
    hoverThrustN: w,
    maxThrustN: maxThrust,
    thrustToWeight: ratio,
    hoverLoad: w / maxThrust,
    climbAccelMs2: (maxThrust - w) / massKg,
    warnings,
  };
}

/**
 * FORCE VECTOR LAB — Spec §23.
 * Tilting the thrust vector by θ splits it:
 *   T_vertical   = T·cos θ
 *   T_horizontal = T·sin θ
 * To hold altitude while tilted, total thrust must rise to W / cos θ.
 */
export interface TiltResult {
  tiltDeg: number;
  verticalN: number;
  horizontalN: number;
  /** Thrust required to hold altitude at this tilt. */
  thrustForLevelFlightN: number;
  /** Horizontal acceleration at that thrust, m/s². */
  horizontalAccelMs2: number;
  /** Extra thrust demanded by the tilt, as a fraction of hover thrust. */
  thrustPenalty: number;
}

export function tiltVector(totalThrustN: number, tiltDeg: number, massKg: number): TiltResult {
  const theta = (tiltDeg * Math.PI) / 180;
  const w = weightN(massKg);
  const required = w / Math.cos(theta);
  return {
    tiltDeg,
    verticalN: totalThrustN * Math.cos(theta),
    horizontalN: totalThrustN * Math.sin(theta),
    thrustForLevelFlightN: required,
    horizontalAccelMs2: (required * Math.sin(theta)) / massKg,
    thrustPenalty: required / w - 1,
  };
}

/**
 * Steady-state tilt required to hold station against a wind.
 * Drag D = ½ρV²·S·Cd must be balanced by the horizontal thrust component:
 *   tan θ = D / W
 */
export function tiltForWind(
  windMs: number,
  massKg: number,
  frontalAreaM2: number,
  dragCoefficient = 1.1,
  densityKgM3 = AIR_DENSITY_SEA_LEVEL,
): { dragN: number; tiltDeg: number; thrustPenalty: number } {
  const drag = 0.5 * densityKgM3 * windMs ** 2 * frontalAreaM2 * dragCoefficient;
  const w = weightN(massKg);
  const tilt = Math.atan(drag / w);
  return {
    dragN: drag,
    tiltDeg: (tilt * 180) / Math.PI,
    thrustPenalty: 1 / Math.cos(tilt) - 1,
  };
}

/**
 * MOMENT / TORQUE — Spec §24.  τ = r × F
 * A differential in motor thrust across the arm length produces the control
 * moment that rotates the aircraft.
 */
export function controlMoment(thrustDifferenceN: number, armLengthM: number): number {
  return thrustDifferenceN * armLengthM;
}

/** Angular acceleration from a moment and a moment of inertia. */
export function angularAccel(momentNm: number, inertiaKgM2: number): number {
  return momentNm / inertiaKgM2;
}

/**
 * CENTRE OF GRAVITY — Spec §25.
 * A payload offset from the centre creates a standing moment the controller
 * must cancel continuously — costing thrust asymmetry and therefore endurance.
 */
export interface CgResult {
  offsetM: number;
  standingMomentNm: number;
  /** Thrust the controller must add on one side to hold level, newtons. */
  correctionThrustN: number;
  /** Fraction of hover thrust consumed by the correction. */
  correctionPenalty: number;
}

export function centreOfGravityOffset(
  airframeMassKg: number,
  payloadMassKg: number,
  payloadOffsetM: number,
  armLengthM: number,
): CgResult {
  const totalMass = airframeMassKg + payloadMassKg;
  const cgOffset = (payloadMassKg * payloadOffsetM) / totalMass;
  const moment = weightN(totalMass) * cgOffset;
  const correction = moment / (2 * armLengthM);
  return {
    offsetM: cgOffset,
    standingMomentNm: moment,
    correctionThrustN: correction,
    correctionPenalty: correction / weightN(totalMass),
  };
}

/**
 * PROPELLER LAB — Spec §28.
 * Momentum-theory ideal hover thrust for a rotor of diameter d absorbing
 * power P:   T = (2ρA P²)^(1/3),  A = πd²/4
 * Real propellers achieve a fraction of this — the figure of merit.
 */
export function propellerThrustN(
  diameterM: number,
  shaftPowerW: number,
  figureOfMerit = 0.7,
  densityKgM3 = AIR_DENSITY_SEA_LEVEL,
): number {
  const area = (Math.PI * diameterM ** 2) / 4;
  const ideal = Math.cbrt(2 * densityKgM3 * area * shaftPowerW ** 2);
  return ideal * figureOfMerit;
}

/** Induced velocity in hover: v = √(T / (2ρA)). */
export function inducedVelocityMs(
  thrustN: number,
  diameterM: number,
  densityKgM3 = AIR_DENSITY_SEA_LEVEL,
): number {
  const area = (Math.PI * diameterM ** 2) / 4;
  return Math.sqrt(thrustN / (2 * densityKgM3 * area));
}

/**
 * Vibration from a damaged or unbalanced propeller, and the image blur it
 * causes — Spec §28. A mass imbalance m at radius r spinning at ω produces a
 * force m·r·ω², which displaces the camera and smears the image.
 */
export function propellerVibration(
  rpm: number,
  imbalanceGrams: number,
  radiusM: number,
  gimbalIsolation = 0.05,
): { frequencyHz: number; forceN: number; cameraDisplacementMm: number } {
  const omega = (rpm * 2 * Math.PI) / 60;
  const force = (imbalanceGrams / 1000) * radiusM * omega ** 2;
  return {
    frequencyHz: rpm / 60,
    forceN: force,
    // Crude single-DOF response: displacement scales with force and isolation.
    cameraDisplacementMm: force * gimbalIsolation,
  };
}

/**
 * MOTOR LAB — Spec §29.
 * KV is the no-load RPM per volt. Electrical power P ≈ V·I.
 */
export function motorNoLoadRpm(kv: number, voltageV: number): number {
  return kv * voltageV;
}

export function electricalPowerW(voltageV: number, currentA: number): number {
  return voltageV * currentA;
}

/**
 * BATTERY SCIENCE — Spec §16.
 *   E = V · Q       (energy from voltage and charge)
 *   P = V · I       (power)
 *   t = E / P       (endurance)
 * Usable capacity is always less than nameplate: a reserve must be kept, and
 * cold and ageing both reduce what is available.
 */
export interface BatterySpec {
  id: string;
  name: string;
  cells: number;
  /** Nominal volts per cell. */
  nominalVoltsPerCell: number;
  capacityAh: number;
  massKg: number;
}

export const BATTERIES: BatterySpec[] = [
  { id: 'bat-6s-5-2', name: 'Generic 6S 5.2 Ah', cells: 6, nominalVoltsPerCell: 3.7, capacityAh: 5.2, massKg: 0.68 },
  { id: 'bat-6s-9-0', name: 'Generic 6S 9.0 Ah', cells: 6, nominalVoltsPerCell: 3.7, capacityAh: 9.0, massKg: 1.15 },
  { id: 'bat-12s-16', name: 'Generic 12S 16 Ah (heavy lift)', cells: 12, nominalVoltsPerCell: 3.7, capacityAh: 16, massKg: 4.6 },
];

export interface EnduranceInput {
  battery: BatterySpec;
  /** Average electrical power drawn in the mission profile, watts. */
  averagePowerW: number;
  /** Reserve held back, as a fraction of nameplate capacity. */
  reserveFraction: number;
  /** Ambient temperature, °C. */
  temperatureC: number;
  /** State of health, 1.0 = new. */
  stateOfHealth: number;
}

export interface EnduranceResult {
  nominalVoltageV: number;
  nameplateEnergyWh: number;
  usableEnergyWh: number;
  enduranceMin: number;
  /** Capacity derating actually applied, as a fraction. */
  temperatureDerate: number;
  warnings: string[];
}

export function estimateEndurance(input: EnduranceInput): EnduranceResult {
  const { battery, averagePowerW, reserveFraction, temperatureC, stateOfHealth } = input;
  const voltage = battery.cells * battery.nominalVoltsPerCell;
  const nameplateWh = voltage * battery.capacityAh;

  // Cold reduces usable capacity; the curve below is illustrative, not a
  // manufacturer specification.
  const temperatureDerate =
    temperatureC >= 20 ? 1 : Math.max(0.55, 1 - (20 - temperatureC) * 0.012);

  const usableWh = nameplateWh * (1 - reserveFraction) * temperatureDerate * stateOfHealth;
  const enduranceMin = averagePowerW > 0 ? (usableWh / averagePowerW) * 60 : Number.POSITIVE_INFINITY;

  const warnings: string[] = [];
  if (reserveFraction < 0.2) {
    warnings.push(
      `Reserve of ${(reserveFraction * 100).toFixed(0)}% is thin. The reserve covers the return leg, an ` +
        'unforecast headwind and a go-around — the applicable minimum comes from the site and the manufacturer.',
    );
  }
  if (temperatureC < 5) {
    warnings.push(
      `At ${temperatureC.toFixed(0)} °C usable capacity is derated to ${(temperatureDerate * 100).toFixed(0)}%. ` +
        'Cold packs also sag harder under load, which can trigger a low-voltage failsafe earlier than the ' +
        'percentage suggests.',
    );
  }
  if (stateOfHealth < 0.8) {
    warnings.push(
      `State of health ${(stateOfHealth * 100).toFixed(0)}%. Plan on the measured capacity, not the label.`,
    );
  }

  return {
    nominalVoltageV: voltage,
    nameplateEnergyWh: nameplateWh,
    usableEnergyWh: usableWh,
    enduranceMin,
    temperatureDerate,
    warnings,
  };
}

/**
 * Hover power from momentum theory — the dominant term in a multirotor's
 * energy budget.
 *   P_ideal = T^(3/2) / √(2ρA)
 * divided by the propulsive and electrical efficiencies.
 */
export function hoverPowerW(
  massKg: number,
  rotorDiameterM: number,
  rotors: number,
  efficiency = 0.65,
  densityKgM3 = AIR_DENSITY_SEA_LEVEL,
): number {
  const thrustPerRotor = weightN(massKg) / rotors;
  const area = (Math.PI * rotorDiameterM ** 2) / 4;
  const idealPerRotor = Math.pow(thrustPerRotor, 1.5) / Math.sqrt(2 * densityKgM3 * area);
  return (idealPerRotor * rotors) / efficiency;
}

/**
 * PID LAB — Spec §33.
 *
 * Second-order plant driven by a PID controller, integrated with a fixed step.
 * Educational only: the specification is explicit that simulator gains must
 * never be transferred to a real aircraft.
 */
export interface PidGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface PidSample {
  t: number;
  setpoint: number;
  actual: number;
  error: number;
  output: number;
}

export interface PidResult {
  samples: PidSample[];
  /** Peak overshoot as a fraction of the step. */
  overshoot: number;
  /** Time to stay within 2% of the setpoint, seconds. NaN if never. */
  settlingTimeS: number;
  /** Steady-state error at the end of the run. */
  steadyStateError: number;
  oscillating: boolean;
}

export function simulatePid(
  gains: PidGains,
  options: {
    setpoint?: number;
    durationS?: number;
    dtS?: number;
    inertia?: number;
    damping?: number;
    /**
     * Constant load acting on the plant — a standing moment from a centre-of-
     * gravity offset (§25) or a steady wind. Without it the plant is a pure
     * double integrator, which has no steady-state error even under P-only
     * control, and integral action would have nothing to correct.
     */
    disturbance?: number;
  } = {},
): PidResult {
  const {
    setpoint = 1,
    durationS = 6,
    dtS = 0.005,
    inertia = 0.05,
    damping = 0.08,
    disturbance = 0,
  } = options;
  const steps = Math.floor(durationS / dtS);

  let position = 0;
  let velocity = 0;
  let integral = 0;
  let previousError = setpoint;
  const samples: PidSample[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i * dtS;
    const error = setpoint - position;
    integral += error * dtS;
    const derivative = (error - previousError) / dtS;
    previousError = error;

    const output = gains.kp * error + gains.ki * integral + gains.kd * derivative;

    // Plant: J·ẍ + c·ẋ = u + d
    const accel = (output + disturbance - damping * velocity) / inertia;
    velocity += accel * dtS;
    position += velocity * dtS;

    samples.push({ t, setpoint, actual: position, error, output });
  }

  const peak = samples.reduce((m, s) => Math.max(m, s.actual), 0);
  const overshoot = setpoint !== 0 ? Math.max(0, (peak - setpoint) / setpoint) : 0;

  // Settling: last time the response leaves the ±2% band.
  const band = Math.abs(setpoint) * 0.02;
  let settlingTimeS = Number.NaN;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (Math.abs(samples[i]!.actual - setpoint) > band) {
      settlingTimeS = samples[Math.min(i + 1, samples.length - 1)]!.t;
      break;
    }
    if (i === 0) settlingTimeS = 0;
  }

  // Count sign changes of the error in the last 60% of the run.
  const tail = samples.slice(Math.floor(samples.length * 0.4));
  let crossings = 0;
  for (let i = 1; i < tail.length; i++) {
    if (Math.sign(tail[i]!.error) !== Math.sign(tail[i - 1]!.error)) crossings++;
  }

  return {
    samples,
    overshoot,
    settlingTimeS,
    steadyStateError: setpoint - (samples[samples.length - 1]?.actual ?? 0),
    oscillating: crossings > 6,
  };
}

/**
 * MOTOR MIXING — Spec §31.
 * Quadrotor in X configuration. Motor numbering is configurable because
 * platforms differ, so the mix is expressed as signed coefficients.
 */
export interface MixerChannel {
  motor: number;
  /** Spin direction: +1 clockwise, −1 counter-clockwise. */
  spin: 1 | -1;
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export const QUAD_X_MIXER: MixerChannel[] = [
  { motor: 1, spin: -1, throttle: 1, roll: -1, pitch: 1, yaw: 1 },
  { motor: 2, spin: 1, throttle: 1, roll: -1, pitch: -1, yaw: -1 },
  { motor: 3, spin: -1, throttle: 1, roll: 1, pitch: -1, yaw: 1 },
  { motor: 4, spin: 1, throttle: 1, roll: 1, pitch: 1, yaw: -1 },
];

export function mixMotors(
  mixer: MixerChannel[],
  demand: { throttle: number; roll: number; pitch: number; yaw: number },
): Array<{ motor: number; output: number; saturated: boolean }> {
  return mixer.map((c) => {
    const raw =
      c.throttle * demand.throttle +
      c.roll * demand.roll +
      c.pitch * demand.pitch +
      c.yaw * demand.yaw;
    const clamped = Math.min(1, Math.max(0, raw));
    return { motor: c.motor, output: clamped, saturated: clamped !== raw };
  });
}
