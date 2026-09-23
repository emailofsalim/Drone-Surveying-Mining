/**
 * IMU AND COMPASS LAB — Spec §36–§50, Phases 10 & 11.
 */

import { useMemo, useState } from 'react';
import {
  complementaryFilter,
  driftTimeToLimit,
  freeInertialDrift,
  IMU_GRADES,
  rmsError,
} from '../../engine/sensors/imu';
import { v3 } from '../../engine/sensors/imu';
import {
  assessCalibration,
  calibrate,
  disturbanceAt,
  headingErrorFromDisturbance,
  horizontalIntensity,
  NO_DISTORTION,
  safeDistanceM,
  yawSweep,
  type Distortion,
  type DisturbanceSource,
  type MagneticField,
} from '../../engine/sensors/magnetometer';
import { MINE_FEATURES } from '../../data/mine';
import { formatNumber } from '../../engine/units/units';
import { LineChart, ScatterPlot } from '../../components/LineChart';
import {
  Callout,
  PageHeader,
  Readout,
  SelectField,
  SimulatedBanner,
  SliderField,
} from '../../components/ui';

const DISTURBANCE_SOURCES: DisturbanceSource[] = [
  { id: 'HM-01', name: 'Haul truck on the ramp', e: 980, n: 980, strengthUT: 9000 },
  { id: 'CR-01', name: 'Primary crusher', e: 1420, n: 640, strengthUT: 26000 },
  { id: 'OF-01', name: 'Site office (steel frame)', e: 130, n: 220, strengthUT: 3500 },
];

export function SensorLabPage() {
  const [imuId, setImuId] = useState(IMU_GRADES[0]!.id);
  const [tau, setTau] = useState(1.2);
  const [hardIronX, setHardIronX] = useState(12);
  const [hardIronY, setHardIronY] = useState(-7);
  const [softCross, setSoftCross] = useState(0);
  const [inclination, setInclination] = useState(38);
  const [standoff, setStandoff] = useState(12);

  const imu = IMU_GRADES.find((g) => g.id === imuId)!;

  const field: MagneticField = {
    intensityUT: 46,
    inclinationDeg: inclination,
    declinationDeg: -1.35,
  };

  /* ---------------------------- IMU ---------------------------- */

  const drift = useMemo(() => freeInertialDrift(imu, 120, 120), [imu]);
  const driftSeries = useMemo(
    () =>
      IMU_GRADES.map((grade, i) => ({
        label: grade.name,
        color: ['var(--c-danger)', 'var(--c-warn)', 'var(--c-ok)'][i]!,
        points: freeInertialDrift(grade, 120, 120).map((d) => ({ x: d.t, y: d.positionErrorM })),
      })),
    [],
  );

  const fusion = useMemo(
    () =>
      complementaryFilter({ imu, tauS: tau, dtS: 0.02, durationS: 60, seed: 3 }, (t) =>
        12 * Math.sin(t / 3),
      ),
    [imu, tau],
  );

  const fusionSeries = useMemo(
    () => [
      { label: 'Truth', color: 'var(--c-text-muted)', points: fusion.map((s) => ({ x: s.t, y: s.truthDeg })) },
      { label: 'Gyroscope only (drifts)', color: 'var(--c-danger)', points: fusion.map((s) => ({ x: s.t, y: s.gyroOnlyDeg })) },
      { label: 'Accelerometer only (noisy)', color: 'var(--c-info)', points: fusion.map((s) => ({ x: s.t, y: s.accelOnlyDeg })), dashed: true },
      { label: 'Fused estimate', color: 'var(--c-accent)', points: fusion.map((s) => ({ x: s.t, y: s.fusedDeg })) },
    ],
    [fusion],
  );

  /* ------------------------ magnetometer ----------------------- */

  const actualDistortion: Distortion = useMemo(
    () => ({
      hardIron: v3(hardIronX, hardIronY, 2),
      softScale: v3(1, 1, 1),
      softCross,
    }),
    [hardIronX, hardIronY, softCross],
  );

  const rawSweep = useMemo(() => yawSweep(field, actualDistortion, 72), [field, actualDistortion]);
  const cleanSweep = useMemo(() => yawSweep(field, NO_DISTORTION, 72), [field]);
  const estimate = useMemo(() => calibrate(rawSweep), [rawSweep]);
  const report = useMemo(
    () => assessCalibration(field, actualDistortion, estimate, 72),
    [field, actualDistortion, estimate],
  );

  const horizontal = horizontalIntensity(field);

  /* ------------------- local magnetic disturbance ------------------- */

  const launch = MINE_FEATURES.find((f) => f.id === 'LZ-01')!;
  const truck = DISTURBANCE_SOURCES[0]!;

  const standoffCurve = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const r = 2 + i;
        return {
          x: r,
          y: Math.abs(headingErrorFromDisturbance(disturbanceAt(truck.e + r, truck.n, [truck]), horizontal)),
        };
      }),
    [truck, horizontal],
  );

  const disturbanceAtStandoff = disturbanceAt(truck.e + standoff, truck.n, [truck]);
  const errorAtStandoff = headingErrorFromDisturbance(disturbanceAtStandoff, horizontal);
  const cleanDistance = safeDistanceM(truck, horizontal, 1);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 10 & 11 — inertial and magnetic sensing"
        title="What the sensors actually measure, and what they cannot"
        lede="A gyroscope measures rate, not angle. An accelerometer measures specific force, not tilt. A magnetometer measures the field it is sitting in, not north. Every heading and attitude the aircraft reports is an estimate built from all three."
      />

      <SimulatedBanner kind="model" />

      {/* ------------------------- IMU ------------------------- */}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Inertial sensor</p>
            <SelectField
              label="IMU grade"
              value={imuId}
              options={IMU_GRADES.map((g) => ({ value: g.id, label: g.name }))}
              onChange={setImuId}
            />
            <dl className="kv small">
              <dt>Gyro bias</dt>
              <dd>{imu.gyroBiasDegS} °/s</dd>
              <dt>Gyro noise</dt>
              <dd>{imu.gyroNoiseDegS} °/s</dd>
              <dt>Accel bias</dt>
              <dd>{imu.accelBiasMs2} m/s²</dd>
              <dt>Grade</dt>
              <dd>{imu.grade}</dd>
            </dl>
            <SliderField
              label="Fusion time constant τ"
              value={tau}
              onChange={setTau}
              min={0.1}
              max={8}
              step={0.1}
              format={(v) => `${v.toFixed(1)} s`}
            />
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Small τ trusts the accelerometer (noisy, no drift). Large τ trusts the gyroscope
              (smooth, drifts). The filter is the trade, not a solution to either.
            </p>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Inertial drift — why GNSS is not optional</h3>
            <p className="small muted">
              A stationary, level sensor. Everything plotted is error: a constant bias integrated
              once becomes a velocity error, integrated twice a position error, and the tilt error
              leaks gravity into the horizontal channel on top of that.
            </p>
            <LineChart
              series={driftSeries}
              xLabel="Time since the last position fix (s)"
              yLabel="Free-inertial position error (m)"
              logY
              note="log scale"
            />
            <div className="grid grid-3" style={{ marginTop: 'var(--sp-3)' }}>
              <Readout
                label="Attitude error at 60 s"
                value={drift.find((d) => d.t >= 60)?.attitudeErrorDeg ?? NaN}
                unit="deg"
              />
              <Readout
                label="Position error at 60 s"
                value={drift.find((d) => d.t >= 60)?.positionErrorM ?? NaN}
                unit="m"
              />
              <Readout
                label="Time to 1 m error"
                value={driftTimeToLimit(imu, 1)}
                unit="s"
                hint="free inertial"
              />
            </div>
            <Callout tone="info" title="Read the log scale.">
              Even a tactical-grade unit leaves the metre level within minutes of free inertial
              running. Inertial sensing provides attitude and short-term smoothing; the absolute
              position comes from GNSS, and a LiDAR trajectory is only as good as the fusion of
              both (§96).
            </Callout>
          </div>

          <div className="card">
            <h3>Sensor fusion — a state estimate is not an observation</h3>
            <LineChart
              series={fusionSeries}
              xLabel="Time (s)"
              yLabel="Pitch angle (deg)"
              height={260}
            />
            <div className="grid grid-3" style={{ marginTop: 'var(--sp-3)' }}>
              <Readout label="Gyro-only RMS error" value={rmsError(fusion, (s) => s.gyroOnlyDeg)} unit="deg" />
              <Readout label="Accel-only RMS error" value={rmsError(fusion, (s) => s.accelOnlyDeg)} unit="deg" />
              <Readout label="Fused RMS error" value={rmsError(fusion, (s) => s.fusedDeg)} unit="deg" />
            </div>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              The fused line is better than either input, which is the point of fusion — but it is a
              computed state, not a measurement. The specification insists these be distinguished
              (§40): only the raw observations are evidence.
            </p>
          </div>
        </div>
      </div>

      {/* --------------------- magnetometer --------------------- */}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Magnetic environment</p>
            <SliderField
              label="Hard-iron offset, X axis"
              value={hardIronX}
              onChange={setHardIronX}
              min={-25}
              max={25}
              step={1}
              format={(v) => `${v} µT`}
            />
            <SliderField
              label="Hard-iron offset, Y axis"
              value={hardIronY}
              onChange={setHardIronY}
              min={-25}
              max={25}
              step={1}
              format={(v) => `${v} µT`}
            />
            <SliderField
              label="Soft-iron cross-coupling"
              value={softCross}
              onChange={setSoftCross}
              min={0}
              max={0.4}
              step={0.01}
              format={(v) => v.toFixed(2)}
            />
            <SliderField
              label="Magnetic dip (inclination)"
              value={inclination}
              onChange={setInclination}
              min={0}
              max={85}
              step={1}
              format={(v) => `${v}°`}
            />
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Field intensity is held at 46 µT. Dip is what decides how much of it is horizontal —
              and the horizontal component is all a compass has to work with (§42).
            </p>
          </div>

          <div className="panel">
            <p className="panel-title">Field components</p>
            <dl className="kv small">
              <dt>Total intensity</dt>
              <dd>{field.intensityUT} µT</dd>
              <dt>Horizontal</dt>
              <dd>{formatNumber(horizontal, 2)} µT</dd>
              <dt>Vertical</dt>
              <dd>{formatNumber(field.intensityUT * Math.sin((inclination * Math.PI) / 180), 2)} µT</dd>
            </dl>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Calibration — sphere, offset, ellipsoid</h3>
            <div className="grid grid-2">
              <ScatterPlot
                xLabel="Mx (µT)"
                yLabel="My (µT)"
                groups={[
                  {
                    label: 'Undistorted (centred on origin)',
                    color: 'var(--c-text-faint)',
                    points: cleanSweep.map((s) => ({ x: s.ideal.x, y: s.ideal.y })),
                  },
                  {
                    label: 'Measured (offset and distorted)',
                    color: 'var(--c-danger)',
                    points: rawSweep.map((s) => ({ x: s.measured.x, y: s.measured.y })),
                  },
                ]}
              />
              <div className="stack">
                <Readout label="Estimated hard-iron X" value={estimate.hardIron.x} unit="µT" hint={`true ${hardIronX}`} />
                <Readout label="Estimated hard-iron Y" value={estimate.hardIron.y} unit="µT" hint={`true ${hardIronY}`} />
                <Readout label="Residual |m| spread" value={report.magnitudeResidualUT} unit="µT" hint="the 'fit quality' figure" />
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Heading error before and after calibration</h3>
            <LineChart
              series={[
                {
                  label: 'Uncalibrated',
                  color: 'var(--c-danger)',
                  points: report.samples.map((s) => ({ x: s.headingDeg, y: s.rawErrorDeg })),
                },
                {
                  label: 'After calibration',
                  color: 'var(--c-ok)',
                  points: report.samples.map((s) => ({ x: s.headingDeg, y: s.correctedErrorDeg })),
                },
              ]}
              xLabel="Aircraft heading (deg)"
              yLabel="Heading error (deg)"
              height={220}
            />
            <div className="grid grid-2" style={{ marginTop: 'var(--sp-3)' }}>
              <Readout label="Max heading error after calibration" value={report.maxHeadingErrorDeg} unit="deg" />
              <Readout label="RMS heading error after calibration" value={report.rmsHeadingErrorDeg} unit="deg" />
            </div>
            {softCross > 0.02 ? (
              <Callout tone="danger" title='A "successful" calibration that is still wrong.'>
                The calibration reports a tight fit — the residual magnitude spread is only{' '}
                {formatNumber(report.magnitudeResidualUT, 2)} µT — and yet up to{' '}
                {formatNumber(report.maxHeadingErrorDeg, 2)}° of heading error remains. A min/max
                procedure cannot observe cross-coupling, so it cannot correct it. This is exactly
                the §48 lesson: a successful calibration does not prove the result is good, and it
                certainly does not prove the environment is magnetically clean.
              </Callout>
            ) : (
              <Callout tone="ok" title="Hard-iron offset removed.">
                A pure offset is what a min/max calibration handles well. Add cross-coupling with
                the slider and watch the fit stay tight while the heading error returns.
              </Callout>
            )}
          </div>

          <div className="card">
            <h3>Local attraction — the cube law</h3>
            <p className="small muted">
              Calibration corrects what is bolted to the aircraft. It cannot correct the pit. A
              ferrous mass behaves roughly as a dipole, so its disturbance falls off as 1/r³ —
              doubling the distance cuts it by a factor of eight.
            </p>
            <LineChart
              series={[
                { label: `Heading error near the ${truck.name.toLowerCase()}`, color: 'var(--c-warn)', points: standoffCurve },
              ]}
              xLabel="Distance from the ferrous mass (m)"
              yLabel="Heading error (deg)"
              height={220}
              logY
            />
            <SliderField
              label="Stand-off distance"
              value={standoff}
              onChange={setStandoff}
              min={2}
              max={60}
              step={1}
              format={(v) => `${v} m`}
            />
            <div className="grid grid-3">
              <Readout label="Disturbance at stand-off" value={disturbanceAtStandoff} unit="µT" />
              <Readout label="Heading error" value={errorAtStandoff} unit="deg" />
              <Readout label="Distance for < 1° error" value={cleanDistance} unit="m" />
            </div>
            <Callout tone="warn" title="Where to calibrate, and where not to.">
              The launch pad LZ-01 sits at E {launch.e}, N {launch.n} — deliberately clear of the
              haul route and the crusher. Calibrating beside a truck bakes that truck's field into
              the correction; the aircraft then flies away from it and carries the error with it.
              Follow the manufacturer's procedure, in a magnetically clean location (§47, §48).
            </Callout>
          </div>
        </div>
      </div>
    </div>
  );
}
