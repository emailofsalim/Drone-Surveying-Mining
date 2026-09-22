/**
 * PAYLOAD LAB — LiDAR, thermal, multispectral. Spec §93–§99, Phases 19, 31, 32.
 */

import { useMemo, useState } from 'react';
import {
  apparentTemperature,
  boresightStripSeparation,
  LIDAR_PROFILES,
  lidarCoverage,
  ndvi,
  recommendPayload,
  timingPrecisionForRange,
  trajectoryErrorBudget,
  TYPICAL_BANDS,
} from '../../engine/payloads/payloads';
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

const TASKS = [
  { id: 'pit', label: 'Monthly pit progress — bare benches, clear day', hasTexture: true, vegetated: false, lowLight: false, nonGeometric: false },
  { id: 'rehab', label: 'Rehabilitation area — dense regrowth over the ground', hasTexture: true, vegetated: true, lowLight: false, nonGeometric: false },
  { id: 'muck', label: 'Freshly graded muck pile — uniform, no texture', hasTexture: false, vegetated: false, lowLight: false, nonGeometric: false },
  { id: 'night', label: 'Night shift progress survey', hasTexture: true, vegetated: false, lowLight: true, nonGeometric: false },
  { id: 'heating', label: 'Spontaneous heating in a coal stockpile', hasTexture: true, vegetated: false, lowLight: false, nonGeometric: true },
];

export function PayloadLabPage() {
  const [lidarId, setLidarId] = useState(LIDAR_PROFILES[0]!.id);
  const [aglM, setAglM] = useState(80);
  const [speedMs, setSpeedMs] = useState(8);
  const [lineSpacing, setLineSpacing] = useState(60);
  const [attitudeSigma, setAttitudeSigma] = useState(0.02);
  const [positionSigma, setPositionSigma] = useState(0.03);
  const [boresightErr, setBoresightErr] = useState(0.02);
  const [emissivity, setEmissivity] = useState(0.95);
  const [backgroundC, setBackgroundC] = useState(15);
  const [transmission, setTransmission] = useState(0.95);
  const [surfaceC, setSurfaceC] = useState(48);
  const [nir, setNir] = useState(0.42);
  const [red, setRed] = useState(0.08);
  const [taskId, setTaskId] = useState(TASKS[0]!.id);

  const lidar = LIDAR_PROFILES.find((l) => l.id === lidarId)!;
  const coverage = useMemo(
    () => lidarCoverage(lidar, aglM, speedMs, lineSpacing),
    [lidar, aglM, speedMs, lineSpacing],
  );

  const budget = useMemo(
    () => trajectoryErrorBudget(positionSigma, attitudeSigma, aglM, lidar.rangeSigmaM),
    [positionSigma, attitudeSigma, aglM, lidar.rangeSigmaM],
  );

  const thermal = useMemo(
    () =>
      apparentTemperature({
        surfaceTempC: surfaceC,
        emissivity,
        backgroundTempC: backgroundC,
        transmission,
        pathTempC: backgroundC,
      }),
    [surfaceC, emissivity, backgroundC, transmission],
  );

  const vegetationIndex = useMemo(
    () => ndvi({ nir, red, nirBand: TYPICAL_BANDS.nir!, redBand: TYPICAL_BANDS.red! }),
    [nir, red],
  );

  const task = TASKS.find((t) => t.id === taskId)!;
  const recommendation = recommendPayload(task);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 19, 31 & 32 — LiDAR, thermal, multispectral"
        title="Passive sensing infers geometry. Active sensing measures it."
        lede="Photogrammetry needs texture, light and overlap. LiDAR supplies its own energy and measures range directly — and in exchange needs a trajectory and a boresight calibration good enough to place every shot. Thermal and multispectral measure something else entirely."
      />

      <SimulatedBanner kind="model" />

      {/* -------------------- payload selection -------------------- */}

      <div className="card">
        <h3>Choose the payload from the objective, not the case</h3>
        <SelectField
          label="Survey task"
          value={taskId}
          options={TASKS.map((t) => ({ value: t.id, label: t.label }))}
          onChange={setTaskId}
        />
        <div className="grid grid-2" style={{ marginTop: 'var(--sp-3)' }}>
          <Callout tone="ok" title={`Recommended: ${recommendation.payload}`}>
            {recommendation.reasoning}
          </Callout>
          <Callout tone="warn" title="What it costs you">
            {recommendation.caveat}
          </Callout>
        </div>
        <p className="xs faint" style={{ marginBottom: 0 }}>
          The specification forbids claiming universal superiority (§19). Every recommendation here
          states a trade, because there always is one.
        </p>
      </div>

      {/* --------------------------- LiDAR ------------------------- */}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">LiDAR configuration</p>
            <SelectField
              label="Sensor"
              value={lidarId}
              options={LIDAR_PROFILES.map((l) => ({ value: l.id, label: l.name }))}
              onChange={setLidarId}
            />
            <dl className="kv small">
              <dt>Pulse rate</dt><dd>{(lidar.pulseRateHz / 1000).toFixed(0)} kHz</dd>
              <dt>Field of view</dt><dd>{lidar.fieldOfViewDeg}°</dd>
              <dt>Scan rate</dt><dd>{lidar.scanRateHz} Hz</dd>
              <dt>Range σ</dt><dd>{(lidar.rangeSigmaM * 1000).toFixed(0)} mm</dd>
              <dt>Returns</dt><dd>{lidar.returns} per pulse</dd>
            </dl>
            <SliderField label="Height above ground" value={aglM} onChange={setAglM} min={20} max={200} step={5} format={(v) => `${v} m`} />
            <SliderField label="Ground speed" value={speedMs} onChange={setSpeedMs} min={2} max={20} step={0.5} format={(v) => `${v} m/s`} />
            <SliderField label="Flight-line spacing" value={lineSpacing} onChange={setLineSpacing} min={10} max={250} step={5} format={(v) => `${v} m`} />
          </div>

          <div className="panel">
            <p className="panel-title">Trajectory quality</p>
            <SliderField label="Position 1σ" value={positionSigma} onChange={setPositionSigma} min={0.005} max={0.5} step={0.005} format={(v) => `${(v * 100).toFixed(1)} cm`} />
            <SliderField label="Attitude 1σ" value={attitudeSigma} onChange={setAttitudeSigma} min={0.001} max={0.3} step={0.001} format={(v) => `${v.toFixed(3)}°`} />
            <SliderField label="Boresight residual" value={boresightErr} onChange={setBoresightErr} min={0} max={0.3} step={0.005} format={(v) => `${v.toFixed(3)}°`} />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Swath and density</h3>
            <div className="grid grid-3">
              <Readout label="Swath width" value={coverage.swathWidthM} unit="m" />
              <Readout label="Point density" value={coverage.pointDensityPerM2} unit="pts/m²" />
              <Readout label="Beam footprint" value={coverage.beamFootprintM * 100} unit="cm" />
              <Readout label="Along-track line spacing" value={coverage.lineSpacingM * 100} unit="cm" />
              <Readout label="Across-track spacing" value={coverage.acrossSpacingM * 100} unit="cm" />
              <Readout label="Swath overlap" value={coverage.swathOverlap * 100} unit="%" />
            </div>
            {coverage.warnings.map((w) => (
              <Callout key={w} tone="warn">{w}</Callout>
            ))}
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Centimetre ranging needs about {formatNumber(timingPrecisionForRange(0.01) * 1e12, 1)} ps
              of timing precision. That is why the clock, not the laser, is the expensive part of a
              LiDAR.
            </p>
          </div>

          <div className="card">
            <h3>The attitude error is multiplied by the range</h3>
            <LineChart
              series={[
                {
                  label: 'Attitude contribution',
                  color: 'var(--c-danger)',
                  points: Array.from({ length: 40 }, (_, i) => {
                    const r = 10 + i * 5;
                    return { x: r, y: trajectoryErrorBudget(positionSigma, attitudeSigma, r, lidar.rangeSigmaM).attitudeContributionM };
                  }),
                },
                {
                  label: 'Position contribution (constant)',
                  color: 'var(--c-info)',
                  points: Array.from({ length: 40 }, (_, i) => ({ x: 10 + i * 5, y: positionSigma })),
                  dashed: true,
                },
                {
                  label: 'Total',
                  color: 'var(--c-accent)',
                  points: Array.from({ length: 40 }, (_, i) => {
                    const r = 10 + i * 5;
                    return { x: r, y: trajectoryErrorBudget(positionSigma, attitudeSigma, r, lidar.rangeSigmaM).totalM };
                  }),
                },
              ]}
              xLabel="Range to the ground (m)"
              yLabel="Point position error (m)"
              height={230}
            />
            <div className="grid grid-3">
              <Readout label="At this height, attitude term" value={budget.attitudeContributionM * 100} unit="cm" />
              <Readout label="Total point error" value={budget.totalM * 100} unit="cm" />
              <Readout label="Dominant term" value={budget.dominant} />
            </div>
            <Callout tone="info" title="Why LiDAR demands a better IMU than photogrammetry.">
              A position error moves a point one-for-one. An attitude error is a lever: the same
              fraction of a degree costs ten times more from 200 m than from 20 m. That is the
              whole argument for a tactical-grade IMU on a LiDAR payload (§96).
            </Callout>
          </div>

          <div className="card">
            <h3>Boresight — the constant that looks like a bad surface</h3>
            <div className="grid grid-3">
              <Readout label="Boresight residual" value={boresightErr} unit="deg" />
              <Readout label="Strip separation at this height" value={boresightStripSeparation(boresightErr, aglM)} unit="m" />
              <Readout label="Separation at 200 m" value={boresightStripSeparation(boresightErr, 200)} unit="m" />
            </div>
            <Callout tone={boresightErr > 0.01 ? 'danger' : 'ok'}>
              {boresightErr > 0.01
                ? `A residual of ${boresightErr.toFixed(3)}° separates overlapping strips flown in opposite directions by ${formatNumber(boresightStripSeparation(boresightErr, aglM), 3)} m. Because it is constant it does not look like noise — it looks like a genuine step in the terrain, and it will be contoured as one.`
                : 'A well-calibrated boresight keeps opposing strips together. Overlapping swaths are how the calibration is checked in the first place — which is why swath overlap is not optional.'}
            </Callout>
          </div>
        </div>
      </div>

      {/* -------------------------- thermal ------------------------ */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">Thermal scene</p>
          <SliderField label="True surface temperature" value={surfaceC} onChange={setSurfaceC} min={-10} max={120} step={1} format={(v) => `${v} °C`} />
          <SliderField label="Emissivity" value={emissivity} onChange={setEmissivity} min={0.2} max={1} step={0.01} format={(v) => v.toFixed(2)} />
          <SliderField label="Reflected background" value={backgroundC} onChange={setBackgroundC} min={-20} max={60} step={1} format={(v) => `${v} °C`} />
          <SliderField label="Atmospheric transmission" value={transmission} onChange={setTransmission} min={0.5} max={1} step={0.01} format={(v) => v.toFixed(2)} />
        </div>

        <div className="card">
          <h3>Thermal — radiance is not temperature</h3>
          <div className="grid grid-3">
            <Readout label="True surface temperature" value={surfaceC} unit="°C" />
            <Readout label="Apparent temperature" value={thermal.apparentTempC} unit="°C" hint="if ε and τ are assumed to be 1" />
            <Readout label="Error from that assumption" value={thermal.errorC} unit="°C" />
          </div>
          <LineChart
            series={[
              {
                label: 'Apparent temperature against emissivity',
                color: 'var(--c-accent)',
                points: Array.from({ length: 41 }, (_, i) => {
                  const e = 0.2 + i * 0.02;
                  return {
                    x: e,
                    y: apparentTemperature({ surfaceTempC: surfaceC, emissivity: e, backgroundTempC: backgroundC, transmission, pathTempC: backgroundC }).apparentTempC,
                  };
                }),
              },
              {
                label: 'True surface temperature',
                color: 'var(--c-text-faint)',
                points: Array.from({ length: 41 }, (_, i) => ({ x: 0.2 + i * 0.02, y: surfaceC })),
                dashed: true,
              },
            ]}
            xLabel="Emissivity"
            yLabel="Temperature (°C)"
            height={220}
          />
          {thermal.notes.map((note) => (
            <Callout key={note} tone="info">{note}</Callout>
          ))}
        </div>
      </div>

      {/* ----------------------- multispectral --------------------- */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">Band reflectance</p>
          <SliderField label="Near infrared" value={nir} onChange={setNir} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} />
          <SliderField label="Red" value={red} onChange={setRed} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} />
          <dl className="kv small">
            <dt>NIR band</dt><dd>{TYPICAL_BANDS.nir!.centreNm} nm</dd>
            <dt>Red band</dt><dd>{TYPICAL_BANDS.red!.centreNm} nm</dd>
          </dl>
        </div>

        <div className="card">
          <h3>Multispectral — NDVI</h3>
          <div className="formula" style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="step">
              <span className="step-label">Formula</span>
              NDVI = (NIR − Red) / (NIR + Red)
            </span>
            <span className="step">
              <span className="step-label">Substitution</span>
              NDVI = ({nir.toFixed(2)} − {red.toFixed(2)}) / ({nir.toFixed(2)} + {red.toFixed(2)})
            </span>
            <span className="step">
              <span className="step-label">Result</span>
              <span className="result">NDVI = {formatNumber(vegetationIndex.ndvi, 4)}</span>
            </span>
          </div>
          <div className="grid grid-2">
            <Readout label="NDVI" value={vegetationIndex.ndvi} unit="—" />
            <Readout label="Bands used" value={vegetationIndex.bands} />
          </div>
          <Callout tone="info" title={vegetationIndex.interpretation}>
            {vegetationIndex.caveat}
          </Callout>
          <p className="xs faint" style={{ marginBottom: 0 }}>
            In mining this matters twice over: as a rehabilitation measure in its own right, and as
            a warning that a photogrammetric surface over high-NDVI ground is a canopy, not terrain.
          </p>
        </div>
      </div>
    </div>
  );
}
