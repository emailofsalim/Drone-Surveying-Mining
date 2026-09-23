/**
 * GSD, FOOTPRINT, OVERLAP AND MISSION GEOMETRY — Spec §86–§92, §100, Phases 18/20.
 *
 * The lab drives the real mission-geometry engine, then applies it to the
 * virtual mine's actual relief so the learner sees the plan break over a pit.
 */

import { useMemo, useState } from 'react';
import {
  gsdAtSurface,
  gsdFromPixelPitch,
  gsdFromSensor,
  heightForGsd,
  imageFootprint,
  motionBlurPixels,
  pixelPitchMm,
  planMissionGeometry,
  rollingShutterSmearM,
} from '../../engine/camera/gsd';
import { CAMERAS, cameraById } from '../../data/cameras';
import { registry } from '../../data/formulas';
import { formatNumber, qty } from '../../engine/units/units';
import { PIT, STOCKPILE } from '../../data/mine';
import {
  Callout,
  FormulaWorking,
  NumberField,
  PageHeader,
  Readout,
  SelectField,
  SimulatedBanner,
  SliderField,
} from '../../components/ui';

export function GsdLabPage() {
  const [cameraId, setCameraId] = useState(CAMERAS[0]!.id);
  const [height, setHeight] = useState(110);
  const [forward, setForward] = useState(0.8);
  const [side, setSide] = useState(0.7);
  const [speed, setSpeed] = useState(7);
  const [exposure, setExposure] = useState(1 / 1000);

  const camera = cameraById(cameraId);
  const footprint = imageFootprint(camera, height);
  const pitch = pixelPitchMm(camera);

  // Area taken from the virtual mine's pit extent — one dataset, many views (§5).
  const areaWidthM = PIT.crestRadius * 2 + 200;
  const areaLengthM = PIT.crestRadius * 2 + 200;

  const plan = useMemo(
    () =>
      planMissionGeometry({
        camera,
        heightAboveSurfaceM: height,
        targetForwardOverlap: forward,
        targetSideOverlap: side,
        groundSpeedMs: speed,
        areaWidthM,
        areaLengthM,
      }),
    [camera, height, forward, side, speed, areaWidthM, areaLengthM],
  );

  /** Same flight, several surfaces of the same mine (§88). */
  const surfaces = [
    { name: 'Pit crest', rl: PIT.crestRl },
    { name: 'Mid-bench', rl: (PIT.crestRl + PIT.floorRl) / 2 },
    { name: 'Pit floor', rl: PIT.floorRl },
    { name: 'Stockpile crown', rl: STOCKPILE.baseRl + STOCKPILE.height },
  ];

  const gsdEval = useMemo(() => {
    try {
      return registry.evaluate('gsd.sensor', {
        H: qty(height, 'm'),
        Sw: qty(camera.sensorWidthMm, 'mm'),
        f: qty(camera.focalLengthMm, 'mm'),
        Wpx: qty(camera.imageWidthPx, 'px'),
      });
    } catch {
      return null;
    }
  }, [camera, height]);

  const smear = motionBlurPixels(speed, exposure, footprint.gsdM);
  const shutterShear =
    camera.shutter === 'rolling' ? rollingShutterSmearM(speed, 1 / 30) : 0;

  const targetGsdCm = 2;
  const heightForTarget = heightForGsd(camera, targetGsdCm / 100);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 18 & 20 — imaging geometry and mission planning"
        title="GSD is a geometric relationship, not a number in software"
        lede="Height, sensor and focal length fix the ground size of a pixel. Everything downstream — image count, flight time, data volume, what a matcher can find — follows from that one relationship."
      />

      <SimulatedBanner kind="model" />

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Payload</p>
            <SelectField
              label="Camera"
              value={cameraId}
              options={CAMERAS.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCameraId}
            />
            <dl className="kv small">
              <dt>Sensor</dt>
              <dd>
                {camera.sensorWidthMm} × {camera.sensorHeightMm} mm
              </dd>
              <dt>Image</dt>
              <dd>
                {camera.imageWidthPx} × {camera.imageHeightPx} px
              </dd>
              <dt>Focal length</dt>
              <dd>{camera.focalLengthMm} mm</dd>
              <dt>Pixel pitch</dt>
              <dd>{formatNumber(pitch * 1000, 3)} µm</dd>
              <dt>Shutter</dt>
              <dd>{camera.shutter}</dd>
            </dl>
            {camera.notes ? <p className="xs faint">{camera.notes}</p> : null}
          </div>

          <div className="panel">
            <p className="panel-title">Flight parameters</p>
            <SliderField
              label="Height above the imaged surface"
              value={height}
              onChange={setHeight}
              min={20}
              max={400}
              step={5}
              format={(v) => `${v} m`}
            />
            <SliderField
              label="Forward overlap"
              value={forward}
              onChange={setForward}
              min={0.5}
              max={0.95}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)} %`}
            />
            <SliderField
              label="Side overlap"
              value={side}
              onChange={setSide}
              min={0.4}
              max={0.9}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)} %`}
            />
            <SliderField
              label="Ground speed"
              value={speed}
              onChange={setSpeed}
              min={2}
              max={18}
              step={0.5}
              format={(v) => `${v} m/s`}
            />
            <NumberField
              label="Exposure time"
              unit="seconds"
              value={exposure}
              onChange={setExposure}
              step={0.0001}
            />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Imaging geometry</h3>
            <div className="grid grid-3">
              <Readout label="GSD" value={footprint.gsdM * 100} unit="cm/pixel" />
              <Readout label="Footprint width" value={footprint.widthM} unit="m" />
              <Readout label="Footprint length" value={footprint.lengthM} unit="m" />
              <Readout label="Footprint area" value={footprint.areaM2 / 10000} unit="ha" />
              <Readout label="Image spacing" value={plan.imageSpacingM} unit="m" />
              <Readout label="Line spacing" value={plan.lineSpacingM} unit="m" />
            </div>
            {gsdEval ? <FormulaWorking evaluation={gsdEval} /> : null}
            <p className="xs faint" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
              Cross-check, pixel-pitch form: GSD ={' '}
              {formatNumber(gsdFromPixelPitch(pitch, camera.focalLengthMm, height) * 100, 4)} cm/px.
              Sensor form: {formatNumber(gsdFromSensor(camera, height) * 100, 4)} cm/px. The two
              forms are algebraically identical and the test suite asserts it.
            </p>
          </div>

          <div className="card">
            <h3>Mission geometry over the pit block</h3>
            <p className="small muted">
              Block taken from the virtual mine: {formatNumber(areaWidthM, 0)} ×{' '}
              {formatNumber(areaLengthM, 0)} m centred on the pit.
            </p>
            <div className="grid grid-3">
              <Readout label="Flight lines" value={plan.lineCount} unit="lines" />
              <Readout label="Images per line" value={plan.imagesPerLine} unit="images" />
              <Readout label="Total images" value={plan.totalImages} unit="images" />
              <Readout label="Trigger interval" value={plan.triggerIntervalS} unit="s" />
              <Readout label="Flight distance" value={plan.totalFlightDistanceM / 1000} unit="km" />
              <Readout
                label="Flying time (geometry only)"
                value={plan.estimatedFlightTimeS / 60}
                unit="min"
                hint="no turns, wind or battery model"
              />
            </div>
            {plan.warnings.map((w) => (
              <Callout key={w} tone="warn">
                {w}
              </Callout>
            ))}
            <Callout tone="info" title="What this number is not.">
              This is pure geometry. It excludes turns, acceleration, wind, climb, battery swaps,
              take-off and landing, and any regulatory or site constraint. A real mission duration
              is longer, and the applicable limits come from the aircraft manufacturer and the site,
              not from this application.
            </Callout>
          </div>

          <div className="card">
            <h3>The pit breaks the plan (§88)</h3>
            <p className="small muted">
              The flight is planned for {formatNumber(height, 0)} m above the crest. Over a benched
              pit, the ground falls away — so the height above the imaged surface, and therefore the
              GSD, is different on every bench.
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Surface</th>
                  <th className="num">RL (m)</th>
                  <th className="num">Height above surface (m)</th>
                  <th className="num">GSD (cm/px)</th>
                  <th className="num">vs plan</th>
                </tr>
              </thead>
              <tbody>
                {surfaces.map((s) => {
                  const r = gsdAtSurface(camera, height, PIT.crestRl, s.rl);
                  return (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="num">{formatNumber(s.rl, 1)}</td>
                      <td className="num">{formatNumber(r.heightAboveActualM, 1)}</td>
                      <td className="num">{formatNumber(r.actualGsdM * 100, 2)}</td>
                      <td className="num">{formatNumber(r.ratio, 2)}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Callout tone="warn" title="Read the last column.">
              A plan that satisfies a {formatNumber(footprint.gsdM * 100, 1)} cm/px requirement at
              the crest does not satisfy it on the floor, and the achieved overlap over raised
              ground drops below the planned value because the footprint shrinks. Terrain following
              or a height chosen for the highest ground is the control (§79).
            </Callout>
          </div>

          <div className="card">
            <h3>Image quality limits</h3>
            <div className="grid grid-2">
              <Readout
                label="Motion smear"
                value={smear}
                unit="pixels"
                hint={`${formatNumber(speed, 1)} m/s × ${formatNumber(exposure * 1000, 2)} ms`}
              />
              <Readout
                label="Rolling-shutter shear"
                value={shutterShear}
                unit="m"
                hint={camera.shutter === 'rolling' ? 'at 1/30 s readout' : 'not applicable'}
              />
            </div>
            <Callout tone={smear > 1 ? 'warn' : 'ok'}>
              {smear > 1
                ? `Smear of ${formatNumber(smear, 2)} px degrades keypoint detection before it becomes visible to the eye. Slow down, shorten the exposure, or accept a coarser GSD — and state which you chose (§241).`
                : `Smear of ${formatNumber(smear, 2)} px is below one pixel at these settings. The acceptable limit for a deliverable is a project decision, not a constant this application supplies.`}
            </Callout>
            <p className="small muted" style={{ marginBottom: 0 }}>
              To achieve a {targetGsdCm} cm/px GSD with this camera, fly{' '}
              <strong>{formatNumber(heightForTarget, 1)} m</strong> above the surface being imaged —
              which is a different commanded altitude for the crest and for the floor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
