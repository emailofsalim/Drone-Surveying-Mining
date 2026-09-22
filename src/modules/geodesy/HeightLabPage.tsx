/**
 * HEIGHT & RL LAB — Spec §64–§79, §238 ("Why is the RL wrong?"), Phase 14.
 */

import { useMemo, useState } from 'react';
import {
  ignoredGeoidError,
  orthometricFromEllipsoidal,
  reduceRiseAndFall,
  resolveAltitude,
  trigonometricHeightDifference,
  type LevellingObservation,
} from '../../engine/geodesy/height';
import { registry } from '../../data/formulas';
import { formatNumber, qty } from '../../engine/units/units';
import { featureRl, PIT, STOCKPILE, stockpileTruth, MINE_FEATURES } from '../../data/mine';
import {
  Callout,
  FormulaWorking,
  NumberField,
  PageHeader,
  Readout,
  SimulatedBanner,
} from '../../components/ui';

/** SIMULATED levelling run from BM-07 to the launch pad. */
const LEVELLING_RUN: LevellingObservation[] = [
  { station: 'BM-07 (datum)', backsight: 1.842 },
  { station: 'TP-1', intersight: 1.216 },
  { station: 'TP-2', foresight: 0.934, backsight: 2.105 },
  { station: 'TP-3', intersight: 1.688 },
  { station: 'TP-4', foresight: 2.741, backsight: 1.502 },
  { station: 'LZ-01 pad', foresight: 1.019 },
];

export function HeightLabPage() {
  const [h, setH] = useState(561.42);
  const [N, setN] = useState(46.31);
  const [aboveTakeoff, setAboveTakeoff] = useState(100);

  const H = orthometricFromEllipsoidal(h, N);

  const levelling = useMemo(() => reduceRiseAndFall(LEVELLING_RUN, 500.0), []);

  const launch = MINE_FEATURES.find((f) => f.id === 'LZ-01')!;
  const takeoffRl = featureRl(launch);

  // The same flight, read over three different surfaces of the same mine.
  const surfaces = useMemo(
    () => [
      { name: 'Launch pad', rl: takeoffRl },
      { name: 'Pit crest', rl: PIT.crestRl },
      { name: 'Pit floor', rl: PIT.floorRl },
      { name: 'Stockpile crown', rl: STOCKPILE.baseRl + STOCKPILE.height },
    ],
    [takeoffRl],
  );

  const truth = stockpileTruth();
  const geoidBlunder = ignoredGeoidError(N, truth.planAreaM2);

  const heightEval = useMemo(() => {
    try {
      return registry.evaluate('height.hHN', { H: qty(H, 'm'), N: qty(N, 'm') });
    } catch {
      return null;
    }
  }, [H, N]);

  const trigEval = useMemo(() => {
    try {
      return registry.evaluate('height.trigonometric', {
        S: qty(148.372, 'm'),
        Z: qty(87.4215, 'deg'),
        HI: qty(1.512, 'm'),
        HT: qty(1.700, 'm'),
      });
    } catch {
      return null;
    }
  }, []);

  const trigWrongTarget = trigonometricHeightDifference(148.372, 87.4215, 1.512, 2.000);
  const trigCorrect = trigonometricHeightDifference(148.372, 87.4215, 1.512, 1.7);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phase 14 — height, geoid and RL"
        title="Every height needs a type before it needs a value"
        lede="GNSS gives h. Engineering uses H. They differ by the geoid separation N, which can be tens of metres. Confusing them does not produce an error message — it produces a surface that is wrong everywhere by exactly the same amount."
      />

      <SimulatedBanner />

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">h = H + N</p>
            <NumberField
              label="Ellipsoidal height h"
              unit="metres above the ellipsoid"
              value={h}
              onChange={setH}
              step={0.001}
            />
            <NumberField
              label="Geoid separation N"
              unit="metres, from the applicable geoid model"
              value={N}
              onChange={setN}
              step={0.001}
            />
            <Callout tone="warn" title="No geoid model ships with this application.">
              N must come from the geoid model valid for the site and the vertical datum in use.
              An invented separation would be worse than no answer at all.
            </Callout>
          </div>

          <div className="panel">
            <p className="panel-title">Flight altitude</p>
            <NumberField
              label="Commanded height above take-off"
              unit="metres ATO"
              value={aboveTakeoff}
              onChange={setAboveTakeoff}
              step={5}
            />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Orthometric height</h3>
            <div className="grid grid-3">
              <Readout label="h — ellipsoidal" value={h} unit="m" hint="raw GNSS" />
              <Readout label="N — separation" value={N} unit="m" hint="geoid model" />
              <Readout label="H — orthometric / RL" value={H} unit="m" hint="engineering height" />
            </div>
            {heightEval ? <FormulaWorking evaluation={heightEval} /> : null}
            <Callout tone="danger" title="If h is used as RL by mistake:">
              The entire surface sits {formatNumber(Math.abs(N), 3)} m too {N > 0 ? 'high' : 'low'}.
              Over the {formatNumber(truth.planAreaM2 / 10000, 2)} ha stockpile footprint alone,
              a volume computed against a fixed design surface is out by{' '}
              <strong>{formatNumber(Math.abs(geoidBlunder.volumeM3), 0)} m³</strong> — about{' '}
              {formatNumber(Math.abs(geoidBlunder.volumeM3) * STOCKPILE.bulkDensityTm3, 0)} t at the
              assumed bulk density. The ortho still looks perfect (§242).
            </Callout>
          </div>

          <div className="card">
            <h3>"Flying at {formatNumber(aboveTakeoff, 0)} m" — over which surface?</h3>
            <p className="small muted">
              One commanded altitude, read against the real terrain of the virtual mine. ATO is
              constant; AGL is not (§77, §78).
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Surface</th>
                  <th className="num">Surface RL (m)</th>
                  <th className="num">Height above it (m)</th>
                  <th className="num">Divergence from ATO (m)</th>
                </tr>
              </thead>
              <tbody>
                {surfaces.map((s) => {
                  const res = resolveAltitude(aboveTakeoff, takeoffRl, s.rl);
                  return (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="num">{formatNumber(s.rl, 1)}</td>
                      <td className="num">{formatNumber(res.agl, 1)}</td>
                      <td className="num">{formatNumber(res.divergence, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Callout tone="warn" title="Consequence for the survey.">
              The aircraft is{' '}
              {formatNumber(resolveAltitude(aboveTakeoff, takeoffRl, PIT.floorRl).agl, 0)} m above
              the pit floor but only{' '}
              {formatNumber(
                resolveAltitude(aboveTakeoff, takeoffRl, STOCKPILE.baseRl + STOCKPILE.height).agl,
                0,
              )}{' '}
              m above the stockpile crown. GSD, footprint and achieved overlap all change with it —
              see the <a href="#/gsd">GSD lab</a>. Terrain following exists precisely because of
              this (§79).
            </Callout>
          </div>

          <div className="card">
            <h3>Levelling reduction — rise and fall</h3>
            <p className="small muted">
              SIMULATED run from benchmark BM-07 (RL 500.000 m) to the launch pad. The arithmetic
              check is not decoration: it is the only proof that the reduction itself is right (§74).
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Station</th>
                  <th className="num">Rise (m)</th>
                  <th className="num">Fall (m)</th>
                  <th className="num">RL (m)</th>
                </tr>
              </thead>
              <tbody>
                {levelling.rows.map((row) => (
                  <tr key={row.station}>
                    <td>{row.station}</td>
                    <td className="num">{row.rise !== undefined ? formatNumber(row.rise, 3) : ''}</td>
                    <td className="num">{row.fall !== undefined ? formatNumber(row.fall, 3) : ''}</td>
                    <td className="num">{formatNumber(row.rl, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-3" style={{ marginTop: 'var(--sp-3)' }}>
              <Readout label="ΣBS − ΣFS" value={levelling.sumBacksight - levelling.sumForesight} unit="m" />
              <Readout label="ΣRise − ΣFall" value={levelling.sumRise - levelling.sumFall} unit="m" />
              <Readout label="Last RL − First RL" value={levelling.lastRl - levelling.firstRl} unit="m" />
            </div>
            <Callout tone={levelling.checksPass ? 'ok' : 'danger'} title={levelling.checksPass ? 'Arithmetic check passes.' : 'Arithmetic check FAILS.'}>
              {levelling.checksPass
                ? 'The three totals agree, so the reduction is arithmetically correct. That says nothing about whether the observations themselves were good — misclosure against a second benchmark is a separate check.'
                : 'The reduction contains an arithmetic error. Do not proceed to use these RLs.'}
            </Callout>
          </div>

          <div className="card">
            <h3>Trigonometric height — and a 300 mm target-height blunder</h3>
            {trigEval ? <FormulaWorking evaluation={trigEval} /> : null}
            <div className="grid grid-2" style={{ marginTop: 'var(--sp-3)' }}>
              <Readout label="ΔH with HT = 1.700 m" value={trigCorrect} unit="m" />
              <Readout label="ΔH with HT = 2.000 m" value={trigWrongTarget} unit="m" />
            </div>
            <p className="small muted" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
              The difference is exactly the target-height error: {formatNumber(Math.abs(trigCorrect - trigWrongTarget), 3)} m,
              applied to every point observed from that setup. A wrong prism height is on the
              specification's list of causes for a wrong RL (§238) for this reason — it is
              systematic, silent and survives every internal check.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
