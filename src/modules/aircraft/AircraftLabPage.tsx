/**
 * AIRCRAFT, AERODYNAMICS, PROPULSION AND FLIGHT CONTROL LAB
 * Spec §19–§33, Phases 06–09.
 */

import { useMemo, useState } from 'react';
import {
  BATTERIES,
  centreOfGravityOffset,
  estimateEndurance,
  hoverAnalysis,
  hoverPowerW,
  inducedVelocityMs,
  mixMotors,
  propellerVibration,
  QUAD_X_MIXER,
  simulatePid,
  tiltForWind,
  tiltVector,
  airDensity,
} from '../../engine/flight/aerodynamics';
import { motionBlurPixels } from '../../engine/camera/gsd';
import { formatNumber } from '../../engine/units/units';
import { LineChart } from '../../components/LineChart';
import {
  Callout,
  PageHeader,
  Readout,
  SelectField,
  SimulatedBanner,
  SliderField,
} from '../../components/ui';

/**
 * Aircraft types — Spec §19. The specification forbids claiming universal
 * superiority, so each entry states what it trades away.
 */
const AIRCRAFT_TYPES = [
  {
    id: 'quad',
    name: 'Quadrotor',
    strengths: 'Simple, compact, precise station-keeping, vertical take-off in a confined pad.',
    trades: 'Shortest endurance and smallest area coverage. No redundancy: losing one motor of four is usually unrecoverable.',
    mining: 'Stockpiles, small blocks, inspection, highwall detail with oblique capture.',
  },
  {
    id: 'hex',
    name: 'Hexacopter',
    strengths: 'Carries a heavier payload and can often continue on five motors.',
    trades: 'Heavier, more power-hungry, more components to inspect and maintain.',
    mining: 'LiDAR and larger survey payloads where redundancy is required over people or plant.',
  },
  {
    id: 'octo',
    name: 'Octocopter',
    strengths: 'Highest payload capacity and the strongest redundancy argument.',
    trades: 'Heaviest, shortest endurance per kilogram, most expensive to operate.',
    mining: 'Heavy sensor combinations; rarely justified for routine RGB survey.',
  },
  {
    id: 'fw',
    name: 'Fixed wing',
    strengths: 'Far greater endurance and area coverage — the wing produces lift continuously.',
    trades: 'Cannot hover, needs launch and landing space, poor for vertical faces and confined pits.',
    mining: 'Lease-scale mapping, large dumps, rehabilitation and corridor work.',
  },
  {
    id: 'vtol',
    name: 'VTOL / hybrid',
    strengths: 'Vertical take-off with fixed-wing cruise efficiency.',
    trades: 'Two propulsion systems to maintain and a transition phase that is its own failure mode.',
    mining: 'Large areas launched from a small pad — the common compromise on constrained sites.',
  },
];

/** Exploded-view component list — Spec §20. */
const COMPONENTS = [
  { part: 'Airframe and arms', purpose: 'Carries load and holds the motors in a fixed geometry.', failure: 'Cracks and loose joints change the geometry the controller assumes.', survey: 'Flex introduces vibration, which reaches the camera as blur.' },
  { part: 'Motor', purpose: 'Converts electrical power to shaft torque.', failure: 'Bearing wear, demagnetisation, thermal cut.', survey: 'Asymmetric thrust forces constant correction, costing endurance.' },
  { part: 'ESC', purpose: 'Commutates the motor and regulates current from the controller demand.', failure: 'Desync, thermal shutdown, capacitor failure.', survey: 'A desync mid-line ends the flight and leaves a gap in the block.' },
  { part: 'Propeller', purpose: 'Converts shaft torque into thrust by accelerating air.', failure: 'Chips, cracks, imbalance, delamination.', survey: 'Imbalance is the single most common cause of vibration-induced image blur.' },
  { part: 'Battery', purpose: 'Stores the energy for the whole mission.', failure: 'Capacity fade, cell imbalance, cold-weather voltage sag.', survey: 'Sets what area can be covered in one sortie.' },
  { part: 'Flight controller', purpose: 'Estimates state and closes the control loops.', failure: 'Firmware mismatch, sensor fault, configuration error.', survey: 'A poorly tuned loop produces attitude oscillation and rolling-shutter shear.' },
  { part: 'IMU', purpose: 'Measures angular rate and specific force.', failure: 'Bias drift, temperature sensitivity, saturation.', survey: 'Attitude error rotates the camera; for LiDAR it is multiplied by the range.' },
  { part: 'Magnetometer', purpose: 'Provides a heading reference from the local magnetic field.', failure: 'Hard/soft-iron error, local attraction, poor calibration.', survey: 'Heading error rotates footprints and degrades the initial alignment.' },
  { part: 'Barometer', purpose: 'Provides a fast relative altitude reference.', failure: 'Drift with weather, pressure disturbance in the airflow.', survey: 'Drifting altitude changes achieved GSD through the flight.' },
  { part: 'GNSS receiver and antenna', purpose: 'Absolute position, and camera positions for direct georeferencing.', failure: 'Multipath, masking, correction loss, antenna offset not applied.', survey: 'Position quality flows straight into the block; the antenna offset is a classic silent bias.' },
  { part: 'Gimbal', purpose: 'Isolates the camera from airframe motion and holds attitude.', failure: 'Worn isolators, motor fault, mis-levelling.', survey: 'Failed isolation transmits vibration; mis-levelling makes "nadir" imagery oblique.' },
  { part: 'Camera / payload', purpose: 'Makes the observation the survey is built from.', failure: 'Focus, exposure, shutter, storage, trigger.', survey: 'Everything downstream is derived from these images and no better than them.' },
];

export function AircraftLabPage() {
  const [massKg, setMassKg] = useState(6.2);
  const [maxThrustPerMotor, setMaxThrustPerMotor] = useState(22);
  const [motors, setMotors] = useState(4);
  const [windMs, setWindMs] = useState(6);
  const [altitudeM, setAltitudeM] = useState(300);
  const [payloadOffset, setPayloadOffset] = useState(0.05);
  const [kp, setKp] = useState(8);
  const [ki, setKi] = useState(2);
  const [kd, setKd] = useState(1.4);
  const [rpm, setRpm] = useState(5200);
  const [imbalanceG, setImbalanceG] = useState(0);
  const [batteryId, setBatteryId] = useState(BATTERIES[1]!.id);
  const [temperatureC, setTemperatureC] = useState(22);
  const [selectedType, setSelectedType] = useState(AIRCRAFT_TYPES[0]!.id);

  const hover = useMemo(
    () => hoverAnalysis(massKg, maxThrustPerMotor, motors),
    [massKg, maxThrustPerMotor, motors],
  );

  const density = airDensity(altitudeM, temperatureC);
  const wind = useMemo(() => tiltForWind(windMs, massKg, 0.09, 1.1, density), [windMs, massKg, density]);
  const tilt = useMemo(() => tiltVector(hover.hoverThrustN, wind.tiltDeg, massKg), [hover, wind, massKg]);
  const cg = useMemo(() => centreOfGravityOffset(massKg - 1.1, 1.1, payloadOffset, 0.35), [massKg, payloadOffset]);

  const pid = useMemo(() => simulatePid({ kp, ki, kd }, { durationS: 5, disturbance: 0.35 }), [kp, ki, kd]);

  const vibration = useMemo(
    () => propellerVibration(rpm, imbalanceG, 0.17),
    [rpm, imbalanceG],
  );
  // Vibration reaching the camera acts like extra exposure-time smear.
  const vibrationBlurPx = motionBlurPixels(vibration.cameraDisplacementMm / 1000 * vibration.frequencyHz, 1 / 500, 0.03);

  const battery = BATTERIES.find((b) => b.id === batteryId)!;
  const hoverPower = hoverPowerW(massKg, 0.4, motors, 0.65, density);
  const endurance = useMemo(
    () =>
      estimateEndurance({
        battery,
        averagePowerW: hoverPower * (1 + wind.thrustPenalty),
        reserveFraction: 0.25,
        temperatureC,
        stateOfHealth: 1,
      }),
    [battery, hoverPower, wind.thrustPenalty, temperatureC],
  );

  const mix = useMemo(
    () => mixMotors(QUAD_X_MIXER, { throttle: 0.55, roll: 0.15, pitch: 0.1, yaw: 0.05 }),
    [],
  );

  const type = AIRCRAFT_TYPES.find((t) => t.id === selectedType)!;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 06–09 — aircraft, aerodynamics, propulsion, flight control"
        title="Every gram, every degree of tilt and every gust costs energy"
        lede="Hover thrust equals weight. Tilting to move, or to hold station against wind, demands more thrust than hovering. That extra thrust comes out of the battery, and the battery is what decides how much of the mine you can survey in one sortie."
      />

      <SimulatedBanner kind="model" />

      <Callout tone="warn" title="Simplified educational relationships.">
        These are teaching models. They do not fully describe multirotor rotor aerodynamics, and
        the PID behaviour here must never be transferred to a real aircraft. Operating limits come
        from the manufacturer (§21, §22, §33).
      </Callout>

      {/* ----------------------- aircraft types ---------------------- */}

      <div className="card">
        <h3>Aircraft types — no universal winner</h3>
        <div className="row">
          {AIRCRAFT_TYPES.map((t) => (
            <button key={t.id} aria-pressed={t.id === selectedType} onClick={() => setSelectedType(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="grid grid-3" style={{ marginTop: 'var(--sp-4)' }}>
          <div className="panel">
            <p className="panel-title">Strengths</p>
            <p className="small" style={{ margin: 0 }}>{type.strengths}</p>
          </div>
          <div className="panel">
            <p className="panel-title">What it trades away</p>
            <p className="small" style={{ margin: 0 }}>{type.trades}</p>
          </div>
          <div className="panel">
            <p className="panel-title">Mining use</p>
            <p className="small" style={{ margin: 0 }}>{type.mining}</p>
          </div>
        </div>
      </div>

      {/* -------------------------- physics -------------------------- */}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Airframe</p>
            <SliderField label="All-up mass" value={massKg} onChange={setMassKg} min={1} max={25} step={0.1} format={(v) => `${v.toFixed(1)} kg`} />
            <SliderField label="Max thrust per motor" value={maxThrustPerMotor} onChange={setMaxThrustPerMotor} min={5} max={80} step={1} format={(v) => `${v} N`} />
            <SelectField
              label="Motors"
              value={String(motors)}
              options={[
                { value: '4', label: '4 — quadrotor' },
                { value: '6', label: '6 — hexacopter' },
                { value: '8', label: '8 — octocopter' },
              ]}
              onChange={(v) => setMotors(Number(v))}
            />
            <SliderField label="Payload offset from centre" value={payloadOffset} onChange={setPayloadOffset} min={0} max={0.3} step={0.01} format={(v) => `${(v * 100).toFixed(0)} cm`} />
          </div>

          <div className="panel">
            <p className="panel-title">Conditions</p>
            <SliderField label="Wind speed" value={windMs} onChange={setWindMs} min={0} max={20} step={0.5} format={(v) => `${v.toFixed(1)} m/s`} />
            <SliderField label="Site elevation" value={altitudeM} onChange={setAltitudeM} min={0} max={4000} step={100} format={(v) => `${v} m`} />
            <SliderField label="Temperature" value={temperatureC} onChange={setTemperatureC} min={-20} max={45} step={1} format={(v) => `${v} °C`} />
            <dl className="kv small">
              <dt>Air density</dt>
              <dd>{formatNumber(density, 4)} kg/m³</dd>
            </dl>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Hover and thrust margin</h3>
            <div className="grid grid-3">
              <Readout label="Weight" value={hover.weightN} unit="N" />
              <Readout label="Hover thrust required" value={hover.hoverThrustN} unit="N" />
              <Readout label="Maximum thrust" value={hover.maxThrustN} unit="N" />
              <Readout label="Thrust-to-weight" value={hover.thrustToWeight} unit="×" />
              <Readout label="Throttle used to hover" value={hover.hoverLoad * 100} unit="%" />
              <Readout label="Climb acceleration available" value={hover.climbAccelMs2} unit="m/s²" />
            </div>
            {hover.warnings.map((w) => (
              <Callout key={w} tone="danger">{w}</Callout>
            ))}
          </div>

          <div className="card">
            <h3>Wind: tilt, drag and the thrust penalty</h3>
            <div className="grid grid-3">
              <Readout label="Drag at this wind" value={wind.dragN} unit="N" />
              <Readout label="Tilt to hold station" value={wind.tiltDeg} unit="deg" />
              <Readout label="Extra thrust demanded" value={wind.thrustPenalty * 100} unit="%" />
              <Readout label="Vertical component" value={tilt.verticalN} unit="N" />
              <Readout label="Horizontal component" value={tilt.horizontalN} unit="N" />
              <Readout label="Induced velocity" value={inducedVelocityMs(hover.hoverThrustN / motors, 0.4, density)} unit="m/s" />
            </div>
            <LineChart
              series={[
                {
                  label: 'Thrust penalty against wind speed',
                  color: 'var(--c-accent)',
                  points: Array.from({ length: 41 }, (_, i) => {
                    const w = i * 0.5;
                    return { x: w, y: tiltForWind(w, massKg, 0.09, 1.1, density).thrustPenalty * 100 };
                  }),
                },
              ]}
              xLabel="Wind speed (m/s)"
              yLabel="Extra thrust over hover (%)"
              height={200}
            />
            <Callout tone="info" title="Drag goes as the square of the wind.">
              Doubling the wind quadruples the drag, and the thrust penalty rises with it. That is
              why a survey planned in calm conditions can run out of battery halfway through the
              block when the afternoon wind arrives.
            </Callout>
          </div>

          <div className="card">
            <h3>Centre of gravity — a standing load the controller never stops carrying</h3>
            <div className="grid grid-3">
              <Readout label="CG offset from centre" value={cg.offsetM * 100} unit="cm" />
              <Readout label="Standing moment" value={cg.standingMomentNm} unit="N·m" />
              <Readout label="Correction thrust" value={cg.correctionThrustN} unit="N" />
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              An offset payload is not a one-off trim problem. It is a moment the control loop
              cancels continuously, with asymmetric motor output for the whole flight — reduced
              endurance, uneven motor wear, and less margin in a gust.
            </p>
          </div>

          <div className="card">
            <h3>Energy and endurance</h3>
            <div className="row">
              <div style={{ minWidth: 280 }}>
                <SelectField
                  label="Battery"
                  value={batteryId}
                  options={BATTERIES.map((b) => ({ value: b.id, label: b.name }))}
                  onChange={setBatteryId}
                />
              </div>
            </div>
            <div className="grid grid-3">
              <Readout label="Hover power" value={hoverPower} unit="W" />
              <Readout label="Power including wind penalty" value={hoverPower * (1 + wind.thrustPenalty)} unit="W" />
              <Readout label="Nameplate energy" value={endurance.nameplateEnergyWh} unit="Wh" />
              <Readout label="Usable energy" value={endurance.usableEnergyWh} unit="Wh" hint="25% reserve held" />
              <Readout label="Temperature derate" value={endurance.temperatureDerate * 100} unit="%" />
              <Readout label="Endurance" value={endurance.enduranceMin} unit="min" />
            </div>
            {endurance.warnings.map((w) => (
              <Callout key={w} tone="warn">{w}</Callout>
            ))}
            <Callout tone="danger" title="Never a substitute for the manufacturer's figures.">
              This is a momentum-theory estimate with a flat efficiency. Real endurance depends on
              the aircraft, the payload, the profile and the conditions. Battery handling,
              charging and storage must follow the manufacturer's instructions (§16).
            </Callout>
          </div>
        </div>
      </div>

      {/* --------------------- control and vibration ------------------ */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">PID gains (educational only)</p>
          <SliderField label="Proportional — responds to the current error" value={kp} onChange={setKp} min={0} max={60} step={1} />
          <SliderField label="Integral — responds to accumulated error" value={ki} onChange={setKi} min={0} max={30} step={0.5} />
          <SliderField label="Derivative — responds to the rate of change" value={kd} onChange={setKd} min={0} max={6} step={0.1} />
          <p className="xs faint" style={{ marginBottom: 0 }}>
            A constant disturbance is applied, representing the standing load from a CG offset or a
            steady wind. Without it there would be no steady-state error for the integral term to
            remove.
          </p>
        </div>

        <div className="stack">
          <div className="card">
            <h3>PID response</h3>
            <LineChart
              series={[
                { label: 'Setpoint', color: 'var(--c-text-faint)', points: pid.samples.map((s) => ({ x: s.t, y: s.setpoint })), dashed: true },
                { label: 'Response', color: 'var(--c-accent)', points: pid.samples.map((s) => ({ x: s.t, y: s.actual })) },
              ]}
              xLabel="Time (s)"
              yLabel="Attitude (normalised)"
              height={230}
            />
            <div className="grid grid-3">
              <Readout label="Overshoot" value={pid.overshoot * 100} unit="%" />
              <Readout label="Settling time" value={pid.settlingTimeS} unit="s" />
              <Readout label="Steady-state error" value={pid.steadyStateError} unit="—" />
            </div>
            <Callout tone={pid.oscillating ? 'danger' : 'ok'}>
              {pid.oscillating
                ? 'The loop is oscillating. On an aircraft this becomes airframe vibration, which reaches the camera as blur and, on a rolling shutter, as frame shear (§28, §82).'
                : 'The loop settles. Remember that a simulator plant is not an aircraft — never transfer these gains to real hardware (§33).'}
            </Callout>
          </div>

          <div className="card">
            <h3>Propeller balance and image blur</h3>
            <div className="row">
              <div style={{ flex: 1, minWidth: 220 }}>
                <SliderField label="Motor RPM" value={rpm} onChange={setRpm} min={2000} max={9000} step={100} format={(v) => `${v} rpm`} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <SliderField label="Blade imbalance" value={imbalanceG} onChange={setImbalanceG} min={0} max={3} step={0.1} format={(v) => `${v.toFixed(1)} g`} />
              </div>
            </div>
            <div className="grid grid-3">
              <Readout label="Vibration frequency" value={vibration.frequencyHz} unit="Hz" />
              <Readout label="Imbalance force" value={vibration.forceN} unit="N" />
              <Readout label="Blur contribution" value={vibrationBlurPx} unit="px" />
            </div>
            <Callout tone={imbalanceG > 0.5 ? 'danger' : 'info'} title="Why a chipped blade is a stop condition.">
              The imbalance force goes as the square of the RPM. A blade chip weighing under a gram
              produces a force that the gimbal only partly isolates, and the residual reaches the
              sensor as blur — blur that degrades keypoint detection long before it is visible to
              the eye (§28, §241).
            </Callout>
          </div>

          <div className="card">
            <h3>Motor mixing</h3>
            <p className="small muted">
              One throttle demand plus roll, pitch and yaw, resolved to four motor outputs. Motor
              numbering is configurable because platforms differ (§31).
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Motor</th>
                  <th>Spin</th>
                  <th className="num">Output</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {mix.map((m, i) => (
                  <tr key={m.motor}>
                    <td>{m.motor}</td>
                    <td className="small muted">{QUAD_X_MIXER[i]!.spin === 1 ? 'clockwise' : 'counter-clockwise'}</td>
                    <td className="num">{formatNumber(m.output * 100, 1)}%</td>
                    <td>
                      <span className={`badge ${m.saturated ? 'danger' : 'ok'}`}>
                        {m.saturated ? 'saturated' : 'in range'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Counter-rotating pairs cancel one another's reaction torque in the hover. Yaw is
              produced by deliberately unbalancing them — which is why a hard yaw while already
              near full throttle saturates motors and costs attitude authority.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------ exploded view ---------------------- */}

      <div className="card">
        <h3>Exploded view — every component, and what it does to the survey</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Component</th>
              <th>Purpose</th>
              <th>Failure modes</th>
              <th>Effect on the survey</th>
            </tr>
          </thead>
          <tbody>
            {COMPONENTS.map((c) => (
              <tr key={c.part}>
                <td><strong className="small">{c.part}</strong></td>
                <td className="small muted">{c.purpose}</td>
                <td className="small muted">{c.failure}</td>
                <td className="small muted">{c.survey}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
