/**
 * GNSS / RTK / PPK / CORS / NTRIP LAB — Spec Phases 15 & 16.
 */

import { useMemo, useState } from 'react';
import {
  baseCoordinateErrorImpact,
  computeDop,
  dropoutComparison,
  MODES,
  NTRIP_CHAIN,
  pitMaskAngleDeg,
  solvePosition,
  syntheticConstellation,
  type PositioningMode,
} from '../../engine/gnss/gnss';
import { PIT } from '../../data/mine';
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

export function GnssLabPage() {
  const [mode, setMode] = useState<PositioningMode>('RTK-fixed');
  const [depth, setDepth] = useState(80);
  const [baseline, setBaseline] = useState(3);
  const [correctionAge, setCorrectionAge] = useState(1);
  const [baseError, setBaseError] = useState(0.3);

  const satellites = useMemo(() => syntheticConstellation(18, 7), []);

  // Standing on the pit floor, the highwall masks everything below this angle.
  const distanceToCrest = PIT.crestRadius;
  const maskDeg = pitMaskAngleDeg(depth, distanceToCrest);

  const openSky = useMemo(() => computeDop(satellites, 10), [satellites]);
  const inPit = useMemo(() => computeDop(satellites, Math.max(10, maskDeg)), [satellites, maskDeg]);

  const solution = useMemo(
    () =>
      solvePosition({
        mode,
        satellites,
        elevationMaskDeg: Math.max(10, maskDeg),
        baselineKm: baseline,
        correctionAgeS: correctionAge,
      }),
    [mode, satellites, maskDeg, baseline, correctionAge],
  );

  const dropout = useMemo(() => dropoutComparison(180, 60), []);
  const baseImpact = baseCoordinateErrorImpact(baseError);

  // Sky plot geometry.
  const skySize = 300;
  const skyCentre = skySize / 2;
  const skyRadius = skySize / 2 - 24;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 15 & 16 — GNSS, RTK, PPK, CORS and NTRIP"
        title="Geometry multiplies error, and differencing cancels it"
        lede="Two relationships carry the whole subject. Position error is DOP times range error — so the sky the receiver can see matters as much as the receiver. And nearby receivers share most of their error, which is why differencing works and why baseline length is not free."
      />

      <SimulatedBanner kind="model" />

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Receiver and corrections</p>
            <SelectField
              label="Positioning mode"
              value={mode}
              options={MODES.map((m) => ({ value: m.mode, label: m.label }))}
              onChange={(v) => setMode(v)}
            />
            <p className="xs faint">{MODES.find((m) => m.mode === mode)!.description}</p>
            <SliderField
              label="Baseline to base or CORS"
              value={baseline}
              onChange={setBaseline}
              min={0.1}
              max={80}
              step={0.5}
              format={(v) => `${v.toFixed(1)} km`}
            />
            <SliderField
              label="Correction age"
              value={correctionAge}
              onChange={setCorrectionAge}
              min={0}
              max={60}
              step={1}
              format={(v) => `${v.toFixed(0)} s`}
            />
          </div>

          <div className="panel">
            <p className="panel-title">Position in the pit</p>
            <SliderField
              label="Depth below the crest"
              value={depth}
              onChange={setDepth}
              min={0}
              max={PIT.crestRl - PIT.floorRl}
              step={5}
              format={(v) => `${v} m`}
            />
            <dl className="kv small">
              <dt>Distance to crest</dt>
              <dd>{distanceToCrest} m</dd>
              <dt>Highwall mask angle</dt>
              <dd>{formatNumber(maskDeg, 1)}°</dd>
              <dt>Satellites visible</dt>
              <dd>
                {inPit.used} of {openSky.used}
              </dd>
            </dl>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Sky plot and dilution of precision</h3>
            <div className="grid grid-2">
              <svg
                viewBox={`0 0 ${skySize} ${skySize}`}
                style={{ width: '100%', height: 'auto' }}
                role="img"
                aria-label="Satellite sky plot with the highwall mask"
              >
                {[0, 30, 60].map((el) => {
                  const r = skyRadius * (1 - el / 90);
                  return (
                    <circle key={el} cx={skyCentre} cy={skyCentre} r={r} fill="none" stroke="var(--c-border)" strokeWidth={0.7} />
                  );
                })}
                {/* The masked cone — everything below the highwall angle. */}
                <circle
                  cx={skyCentre}
                  cy={skyCentre}
                  r={skyRadius}
                  fill="var(--c-danger-dim)"
                  stroke="none"
                />
                <circle
                  cx={skyCentre}
                  cy={skyCentre}
                  r={skyRadius * (1 - Math.max(10, maskDeg) / 90)}
                  fill="var(--c-surface)"
                  stroke="var(--c-warn)"
                  strokeDasharray="4 3"
                />
                <line x1={skyCentre} y1={skyCentre - skyRadius} x2={skyCentre} y2={skyCentre + skyRadius} stroke="var(--c-border)" strokeWidth={0.6} />
                <line x1={skyCentre - skyRadius} y1={skyCentre} x2={skyCentre + skyRadius} y2={skyCentre} stroke="var(--c-border)" strokeWidth={0.6} />
                <text x={skyCentre} y={14} fontSize={10} textAnchor="middle" fill="var(--c-text-faint)">N</text>

                {satellites.map((sat) => {
                  const r = skyRadius * (1 - sat.elevationDeg / 90);
                  const a = (sat.azimuthDeg * Math.PI) / 180;
                  const x = skyCentre + r * Math.sin(a);
                  const y = skyCentre - r * Math.cos(a);
                  const blocked = sat.elevationDeg < Math.max(10, maskDeg);
                  return (
                    <circle
                      key={sat.id}
                      cx={x}
                      cy={y}
                      r={4}
                      fill={blocked ? 'var(--c-danger)' : 'var(--c-ok)'}
                      opacity={blocked ? 0.45 : 1}
                    />
                  );
                })}
              </svg>

              <div className="stack">
                <Readout label="Satellites used" value={inPit.used} unit="SVs" hint={`mask ${formatNumber(Math.max(10, maskDeg), 0)}°`} />
                <Readout label="PDOP" value={inPit.pdop} unit="—" hint={`open sky ${formatNumber(openSky.pdop, 2)}`} />
                <Readout label="HDOP" value={inPit.hdop} unit="—" />
                <Readout label="VDOP" value={inPit.vdop} unit="—" hint="always the weaker component" />
              </div>
            </div>
            {!inPit.solvable ? (
              <Callout tone="danger" title="No solution available.">
                Fewer than four satellites clear the highwall. Three coordinates plus the receiver
                clock need four observations — there is no position at all here, at any quality.
              </Callout>
            ) : (
              <Callout tone="info" title="The receiver did not get worse; the sky did.">
                On the crest the geometry gives PDOP {formatNumber(openSky.pdop, 2)}. At{' '}
                {formatNumber(depth, 0)} m below it, the wall subtends{' '}
                {formatNumber(maskDeg, 1)}° and PDOP becomes {formatNumber(inPit.pdop, 2)} — the
                same receiver, the same corrections, a worse answer.
              </Callout>
            )}
          </div>

          <div className="card">
            <h3>Position error budget</h3>
            <div className="grid grid-3">
              <Readout label="Horizontal 1σ" value={solution.horizontalSigmaM * 100} unit="cm" />
              <Readout label="Vertical 1σ" value={solution.verticalSigmaM * 100} unit="cm" />
              <Readout label="Range 1σ (mode)" value={MODES.find((m) => m.mode === mode)!.rangeSigmaM * 100} unit="cm" />
              <Readout label="Baseline term" value={solution.baselineErrorM * 100} unit="cm" hint="≈1 mm per km" />
              <Readout label="Correction-age term" value={solution.latencyErrorM * 100} unit="cm" />
              <Readout
                label="Vertical ÷ horizontal"
                value={solution.verticalSigmaM / solution.horizontalSigmaM}
                unit="×"
              />
            </div>
            {solution.warnings.map((w) => (
              <Callout key={w} tone="warn">
                {w}
              </Callout>
            ))}
          </div>

          <div className="card">
            <h3>RTK against PPK through a link dropout</h3>
            <LineChart
              series={[
                { label: 'RTK — degrades from the moment corrections stop', color: 'var(--c-danger)', points: dropout.map((d) => ({ x: d.t, y: d.rtkSigmaM })) },
                { label: 'PPK — solved afterwards, forward and backward', color: 'var(--c-ok)', points: dropout.map((d) => ({ x: d.t, y: d.ppkSigmaM })) },
              ]}
              xLabel="Time since the correction link dropped (s)"
              yLabel="Range 1σ (m)"
              logY
              height={230}
            />
            <Callout tone="info" title="Why PPK is common over pits.">
              A pit blocks radio as effectively as it blocks satellites. RTK needs the link at the
              moment of exposure; PPK logs the raw observations and solves them later, so a dropout
              during the flight is repaired in processing rather than lost. The trade is that
              nothing is known in the field — a bad flight is discovered at the office.
            </Callout>
          </div>

          <div className="card">
            <h3>The base coordinate — the blunder nothing detects</h3>
            <SliderField
              label="Error in the entered base coordinate"
              value={baseError}
              onChange={setBaseError}
              min={0}
              max={2}
              step={0.05}
              format={(v) => `${v.toFixed(2)} m`}
            />
            <div className="grid grid-3">
              <Readout label="Shift applied to every rover position" value={baseImpact.surveyShiftM} unit="m" />
              <Readout label="Detected by RTK quality indicators" value={baseImpact.detectableInternally ? 'yes' : 'NO'} />
              <Readout label="Detected by independent checkpoints" value="yes" />
            </div>
            <Callout tone="danger" title="One-for-one, and completely silent.">
              {baseImpact.note} Every internal indicator stays green because the solution is
              internally consistent — it is simply consistent about the wrong place.
            </Callout>
          </div>

          <div className="card">
            <h3>NTRIP — how a correction reaches the rover</h3>
            <table className="data">
              <tbody>
                {NTRIP_CHAIN.map((step, i) => (
                  <tr key={step.step}>
                    <td className="num" style={{ width: 32 }}>
                      {i + 1}
                    </td>
                    <td style={{ width: '28%' }}>
                      <strong className="small">{step.step}</strong>
                    </td>
                    <td className="small muted">{step.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Every link in this chain can fail independently: no mobile coverage, a caster
              outage, wrong mountpoint, wrong credentials, or a stream whose constellations the
              rover cannot use. "RTK is not fixing" is a diagnosis with five candidate causes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
