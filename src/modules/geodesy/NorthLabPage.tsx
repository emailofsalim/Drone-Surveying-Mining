/**
 * NORTH REFERENCE LAB — Spec §51–§59, §256, Phase 12.
 * Layer A intuition (the compass rose), Layer B operation (convert a bearing),
 * Layer C mathematics (formula + substitution), plus the consequence lab (§58).
 */

import { useMemo, useState } from 'react';
import {
  convertAzimuth,
  gridAzimuth,
  northConversionError,
  NORTH_LABEL,
  normalizeAzimuth,
  type NorthReference,
} from '../../engine/geodesy/north';
import { meridianConvergence } from '../../engine/geodesy/utm';
import { registry } from '../../data/formulas';
import { qty, formatNumber } from '../../engine/units/units';
import { MINE_FEATURES, MINE_NOMINAL_POSITION } from '../../data/mine';
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

const REFS: Array<{ value: NorthReference; label: string }> = [
  { value: 'true', label: 'True north' },
  { value: 'magnetic', label: 'Magnetic north' },
  { value: 'grid', label: 'Grid north' },
];

export function NorthLabPage() {
  const [azimuth, setAzimuth] = useState(47.5);
  const [from, setFrom] = useState<NorthReference>('magnetic');
  const [to, setTo] = useState<NorthReference>('grid');
  const [declination, setDeclination] = useState(-1.35);
  const [convergence, setConvergence] = useState(
    Number(meridianConvergence(MINE_NOMINAL_POSITION.latDeg, MINE_NOMINAL_POSITION.lonDeg).toFixed(4)),
  );
  const [distance, setDistance] = useState(600);

  const ctx = useMemo(
    () => ({ declinationDeg: declination, convergenceDeg: convergence }),
    [declination, convergence],
  );

  const converted = convertAzimuth(azimuth, from, to, ctx);

  const error = useMemo(
    () => northConversionError(azimuth, to, from, ctx, distance),
    [azimuth, from, to, ctx, distance],
  );

  const evaluation = useMemo(() => {
    try {
      return registry.evaluate('north.gridFromMagnetic', {
        Am: qty(azimuth, 'deg'),
        D: qty(declination, 'deg'),
        y: qty(convergence, 'deg'),
      });
    } catch {
      return null;
    }
  }, [azimuth, declination, convergence]);

  // A known line between two control monuments — the independent reference (§48).
  const knownLine = useMemo(() => {
    const a = MINE_FEATURES.find((f) => f.id === 'SM-01')!;
    const b = MINE_FEATURES.find((f) => f.id === 'BM-07')!;
    return { ...gridAzimuth({ e: a.e, n: a.n }, { e: b.e, n: b.n }), a, b };
  }, []);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phase 12 — north references"
        title="Three norths, one line"
        lede="The same physical line has three different bearings depending on what you measured it from. Getting the conversion wrong does not produce an obviously wrong number — it produces a plausible number and a displaced mine."
      />

      <SimulatedBanner kind="model" />

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Observation</p>
            <SliderField
              label="Observed azimuth"
              value={azimuth}
              onChange={setAzimuth}
              min={0}
              max={359.9}
              step={0.1}
              format={(v) => `${v.toFixed(1)}°`}
            />
            <SelectField
              label="Referenced to"
              value={from}
              options={REFS}
              onChange={(v) => setFrom(v)}
            />
            <SelectField label="Convert to" value={to} options={REFS} onChange={(v) => setTo(v)} />
          </div>

          <div className="panel">
            <p className="panel-title">Site parameters — you must supply these</p>
            <NumberField
              label="Magnetic declination D"
              unit="degrees, east positive"
              value={declination}
              onChange={setDeclination}
              step={0.01}
            />
            <NumberField
              label="Meridian convergence γ"
              unit="degrees, east positive"
              value={convergence}
              onChange={setConvergence}
              step={0.01}
            />
            <NumberField
              label="Set-out distance"
              unit="metres"
              value={distance}
              onChange={setDistance}
              step={10}
            />
            <p className="xs faint" style={{ marginBottom: 0 }}>
              γ is pre-filled from the simulated site position ({MINE_NOMINAL_POSITION.latDeg}°N,{' '}
              {MINE_NOMINAL_POSITION.lonDeg}°E) using the UTM engine. D is not pre-filled: this
              application ships no geomagnetic model and will not invent a declination.
            </p>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Result</h3>
            <div className="grid grid-3">
              <Readout label="Input azimuth" value={normalizeAzimuth(azimuth)} unit="deg" hint={NORTH_LABEL[from]} />
              <Readout label="Converted azimuth" value={converted} unit="deg" hint={NORTH_LABEL[to]} />
              <Readout
                label="Conversion applied"
                value={formatNumber(
                  ((converted - normalizeAzimuth(azimuth) + 540) % 360) - 180,
                  4,
                )}
                unit="deg"
              />
            </div>
          </div>

          {evaluation ? (
            <div className="card">
              <h4>Show your work — grid from magnetic</h4>
              <FormulaWorking evaluation={evaluation} />
              <p className="xs faint" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
                Sign convention: D and γ are both east-positive. True = Magnetic + D. Grid = True − γ.
              </p>
            </div>
          ) : null}

          <div className="card">
            <h3>Consequence — what the mistake costs</h3>
            <p className="small muted">
              A bearing referenced to <strong>{NORTH_LABEL[from]}</strong> is used as if it were
              referenced to <strong>{NORTH_LABEL[to]}</strong>, without conversion.
            </p>
            <div className="grid grid-3">
              <Readout label="Angular error" value={error.angularErrorDeg} unit="deg" />
              <Readout
                label="Lateral displacement"
                value={error.lateralErrorM}
                unit="m"
                hint={`at ${formatNumber(distance, 0)} m`}
              />
              <Readout
                label="As a ratio"
                value={`1 : ${formatNumber(
                  Math.abs(error.lateralErrorM) > 1e-9 ? distance / Math.abs(error.lateralErrorM) : Infinity,
                  0,
                )}`}
              />
            </div>
            {Math.abs(error.lateralErrorM) > 0.05 ? (
              <Callout tone="warn" title="This is a set-out error, not a rounding error.">
                Every line on the site rotates by the same amount. A drill pattern, a toe line or a
                boundary peg placed this way is wrong by {formatNumber(Math.abs(error.lateralErrorM), 2)} m
                at {formatNumber(distance, 0)} m — and nothing in the data looks suspicious.
              </Callout>
            ) : (
              <Callout tone="ok" title="No conversion error here.">
                The two references coincide for the parameters you entered. That is a special case,
                not a general property — change the declination or convergence and it disappears.
              </Callout>
            )}
          </div>

          <div className="card">
            <h3>Prove it — the independent reference</h3>
            <p className="small muted">
              A compass calibration that reports success does not prove the environment is
              magnetically clean (§48, §49). The check is an independent one: observe a line whose
              grid azimuth is already known from control.
            </p>
            <table className="data">
              <tbody>
                <tr>
                  <td>Known line</td>
                  <td className="num">
                    {knownLine.a.id} → {knownLine.b.id}
                  </td>
                </tr>
                <tr>
                  <td>Grid azimuth from coordinates</td>
                  <td className="num">{formatNumber(knownLine.azimuthDeg, 4)}°</td>
                </tr>
                <tr>
                  <td>Grid distance</td>
                  <td className="num">{formatNumber(knownLine.distanceM, 3)} m</td>
                </tr>
                <tr>
                  <td>Expected magnetic azimuth</td>
                  <td className="num">
                    {formatNumber(convertAzimuth(knownLine.azimuthDeg, 'grid', 'magnetic', ctx), 4)}°
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="xs faint" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
              If the aircraft or a handheld compass reads materially differently from the expected
              magnetic azimuth above while sitting on this line, the difference is evidence — of
              declination applied wrongly, of local attraction, or of a calibration performed in a
              disturbed location. Diagnose it before flying (§239).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
