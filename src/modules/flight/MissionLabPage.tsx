/**
 * MISSION PLANNER, PRE-FLIGHT, FLIGHT AND POST-FLIGHT LAB
 * Spec §100–§111, Phases 20–23.
 */

import { useMemo, useState } from 'react';
import {
  FAULTS,
  flyMission,
  INCIDENTS,
  postFlightAssets,
  runPreflight,
  type FaultId,
  type MissionPlan,
} from '../../engine/flight/mission';
import { CAMERAS, cameraById } from '../../data/cameras';
import { featureRl, MINE_EXTENT, MINE_FEATURES, PIT } from '../../data/mine';
import { formatNumber } from '../../engine/units/units';
import {
  Callout,
  PageHeader,
  Readout,
  SelectField,
  SimulatedBanner,
  SliderField,
} from '../../components/ui';

/** Ordered planning flow — Spec §100. */
const PLANNING_FLOW = [
  'Objective', 'Aircraft', 'Payload', 'CRS / reference', 'Control', 'Area of interest',
  'Hazards', 'Altitude', 'GSD', 'Overlap', 'Speed', 'Flight direction',
  'Terrain following', 'Return to home', 'Battery', 'Review', 'Validate',
];

export function MissionLabPage() {
  const [cameraId, setCameraId] = useState(CAMERAS[0]!.id);
  const [height, setHeight] = useState(120);
  const [forward, setForward] = useState(0.8);
  const [side, setSide] = useState(0.7);
  const [speed, setSpeed] = useState(7);
  const [azimuth, setAzimuth] = useState(0);
  const [terrainFollowing, setTerrainFollowing] = useState(false);
  const [windFrom, setWindFrom] = useState(90);
  const [windSpeed, setWindSpeed] = useState(4);
  const [faults, setFaults] = useState<FaultId[]>(['damaged-prop']);
  const [incidentIndex, setIncidentIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);

  const launch = MINE_FEATURES.find((f) => f.id === 'LZ-01')!;
  const takeoffRl = featureRl(launch);

  const plan: MissionPlan = useMemo(
    () => ({
      aoi: {
        eMin: PIT.centreE - PIT.crestRadius - 90,
        eMax: PIT.centreE + PIT.crestRadius + 90,
        nMin: PIT.centreN - PIT.crestRadius - 90,
        nMax: PIT.centreN + PIT.crestRadius + 90,
      },
      camera: cameraById(cameraId),
      heightAboveTakeoffM: height,
      takeoffRl,
      forwardOverlap: forward,
      sideOverlap: side,
      airspeedMs: speed,
      lineAzimuthDeg: azimuth,
      terrainFollowing,
      windFromDeg: windFrom,
      windSpeedMs: windSpeed,
      turnAllowanceS: 8,
    }),
    [cameraId, height, takeoffRl, forward, side, speed, azimuth, terrainFollowing, windFrom, windSpeed],
  );

  const flight = useMemo(() => flyMission(plan), [plan]);
  const preflight = useMemo(() => runPreflight(faults), [faults]);
  const assets = useMemo(() => postFlightAssets(flight.images.length), [flight.images.length]);
  const incident = INCIDENTS[incidentIndex]!;

  const toggleFault = (id: FaultId) =>
    setFaults((current) => (current.includes(id) ? current.filter((f) => f !== id) : [...current, id]));

  // Flight-path plan view.
  const planW = 560;
  const planH = 560;
  const sx = planW / (MINE_EXTENT.eMax - MINE_EXTENT.eMin);
  const sy = planH / (MINE_EXTENT.nMax - MINE_EXTENT.nMin);
  const toX = (e: number) => (e - MINE_EXTENT.eMin) * sx;
  const toY = (n: number) => planH - (n - MINE_EXTENT.nMin) * sy;

  const pathByLine = useMemo(() => {
    const lines = new Map<number, Array<{ e: number; n: number }>>();
    for (const wp of flight.waypoints) {
      const list = lines.get(wp.line) ?? [];
      list.push({ e: wp.e, n: wp.n });
      lines.set(wp.line, list);
    }
    return [...lines.entries()];
  }, [flight.waypoints]);

  const flaggedImages = flight.images.filter((i) => i.flagged);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 20–23 — mission, pre-flight, flight, data"
        title="Objective first. The software comes last."
        lede="A mission plan is a chain of decisions, and every one of them is constrained by the one before. Changing the altitude changes the GSD, the footprint, the overlap, the image count, the flight time and the processing load — so the planner shows all of them at once."
      />

      <SimulatedBanner kind="model" />

      <div className="card">
        <p className="panel-title">Planning flow (§100)</p>
        <div className="row">
          {PLANNING_FLOW.map((step, i) => (
            <span key={step} className="row" style={{ gap: 4 }}>
              <span className="badge">{step}</span>
              {i < PLANNING_FLOW.length - 1 ? <span className="faint xs">→</span> : null}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------------- mission planner ---------------------- */}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Mission parameters</p>
            <SelectField
              label="Payload"
              value={cameraId}
              options={CAMERAS.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCameraId}
            />
            <SliderField label="Height above take-off" value={height} onChange={setHeight} min={40} max={300} step={5} format={(v) => `${v} m`} />
            <SliderField label="Forward overlap" value={forward} onChange={setForward} min={0.5} max={0.92} step={0.01} format={(v) => `${(v * 100).toFixed(0)}%`} />
            <SliderField label="Side overlap" value={side} onChange={setSide} min={0.4} max={0.88} step={0.01} format={(v) => `${(v * 100).toFixed(0)}%`} />
            <SliderField label="Airspeed" value={speed} onChange={setSpeed} min={3} max={18} step={0.5} format={(v) => `${v} m/s`} />
            <SliderField label="Flight-line direction" value={azimuth} onChange={setAzimuth} min={0} max={175} step={5} format={(v) => `${v}° grid`} />
            <button
              aria-pressed={terrainFollowing}
              onClick={() => setTerrainFollowing(!terrainFollowing)}
              style={{ width: '100%' }}
            >
              Terrain following: {terrainFollowing ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="panel">
            <p className="panel-title">Conditions</p>
            <SliderField label="Wind from" value={windFrom} onChange={setWindFrom} min={0} max={355} step={5} format={(v) => `${v}°`} />
            <SliderField label="Wind speed" value={windSpeed} onChange={setWindSpeed} min={0} max={16} step={0.5} format={(v) => `${v.toFixed(1)} m/s`} />
            <dl className="kv small">
              <dt>Take-off RL</dt>
              <dd>{formatNumber(takeoffRl, 1)} m</dd>
              <dt>Ground speed out</dt>
              <dd>{formatNumber(flight.groundSpeedOutMs, 2)} m/s</dd>
              <dt>Ground speed back</dt>
              <dd>{formatNumber(flight.groundSpeedBackMs, 2)} m/s</dd>
            </dl>
          </div>
        </div>

        <div className="stack">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <svg viewBox={`0 0 ${planW} ${planH}`} style={{ width: '100%', height: 'auto', background: 'var(--c-surface)' }} role="img" aria-label="Planned flight path over the mine">
              <circle cx={toX(PIT.centreE)} cy={toY(PIT.centreN)} r={PIT.crestRadius * sx} fill="var(--c-surface-2)" stroke="var(--c-border-strong)" />
              {pathByLine.map(([line, points]) => (
                <polyline
                  key={line}
                  points={points.map((p) => `${toX(p.e).toFixed(1)},${toY(p.n).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke="var(--c-accent)"
                  strokeWidth={1}
                  opacity={0.8}
                />
              ))}
              {flaggedImages.map((img, i) => (
                <circle key={i} cx={toX(img.e)} cy={toY(img.n)} r={3} fill="var(--c-danger)" />
              ))}
              <circle cx={toX(launch.e)} cy={toY(launch.n)} r={5} fill="var(--c-info)" />
              <text x={toX(launch.e) + 8} y={toY(launch.n) + 4} fontSize={10} fill="var(--c-text-muted)">LZ-01</text>
              <text x={12} y={planH - 12} fontSize={10} fill="var(--c-text-faint)">
                {flight.lineCount} lines · {flight.images.length} images · SIMULATED
              </text>
            </svg>
          </div>

          <div className="card">
            <h3>Mission geometry over the pit</h3>
            <div className="grid grid-3">
              <Readout label="Flight lines" value={flight.lineCount} unit="lines" />
              <Readout label="Images" value={flight.images.length} unit="images" />
              <Readout label="Line spacing" value={flight.lineSpacingM} unit="m" />
              <Readout label="Image spacing" value={flight.imageSpacingM} unit="m" />
              <Readout label="Flight distance" value={flight.totalDistanceM / 1000} unit="km" />
              <Readout label="Flying time" value={flight.flightTimeS / 60} unit="min" hint="geometry only" />
              <Readout label="Best GSD achieved" value={flight.gsdMinM * 100} unit="cm/px" />
              <Readout label="Worst GSD achieved" value={flight.gsdMaxM * 100} unit="cm/px" />
              <Readout label="Minimum clearance" value={flight.minClearanceM} unit="m" />
            </div>
            {flight.warnings.map((w) => (
              <Callout key={w} tone="warn">{w}</Callout>
            ))}
            <Callout tone={terrainFollowing ? 'ok' : 'info'} title={terrainFollowing ? 'Terrain following holds GSD.' : 'Constant height does not hold GSD.'}>
              {terrainFollowing
                ? `Height above the ground is held at ${formatNumber(height, 0)} m everywhere, so GSD varies by ${formatNumber((flight.gsdMaxM / flight.gsdMinM - 1) * 100, 1)}% across the block. The trade is that the aircraft must climb and descend with the benches, which costs energy.`
                : `The aircraft holds a constant absolute height, so it is ${formatNumber(flight.minClearanceM, 0)} m above the highest ground and far more above the pit floor. GSD varies by ${formatNumber((flight.gsdMaxM / flight.gsdMinM - 1) * 100, 0)}% across the block as a result (§79, §88).`}
            </Callout>
          </div>

          <div className="card">
            <h3>Image records — the lineage anchor</h3>
            <p className="small muted">
              Every exposure records its filename, time, position, height above the ground beneath
              it, heading and achieved GSD. This is what makes it possible to trace a final volume
              back to the images that produced it (§107, §111).
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th className="num">t (s)</th>
                  <th className="num">E</th>
                  <th className="num">N</th>
                  <th className="num">AGL (m)</th>
                  <th className="num">GSD (cm)</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {flight.images.slice(0, 8).map((img) => (
                  <tr key={img.filename}>
                    <td className="num">{img.filename}</td>
                    <td className="num">{formatNumber(img.t, 1)}</td>
                    <td className="num">{formatNumber(img.e, 0)}</td>
                    <td className="num">{formatNumber(img.n, 0)}</td>
                    <td className="num">{formatNumber(img.agl, 0)}</td>
                    <td className="num">{formatNumber(img.gsdM * 100, 2)}</td>
                    <td>
                      {img.flags.length === 0 ? (
                        <span className="badge ok">ok</span>
                      ) : (
                        img.flags.map((f) => <span key={f} className="badge danger">{f}</span>)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="xs faint" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
              Showing 8 of {flight.images.length}. {flaggedImages.length} image(s) flagged.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------- pre-flight ------------------------ */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">Inject faults (§103)</p>
          <div className="stack" style={{ display: 'grid', gap: 'var(--sp-1)' }}>
            {FAULTS.map((fault) => (
              <button
                key={fault.id}
                aria-pressed={faults.includes(fault.id)}
                onClick={() => toggleFault(fault.id)}
                style={{ textAlign: 'left', width: '100%' }}
              >
                {fault.label}
              </button>
            ))}
          </div>
          <button className="ghost" onClick={() => setFaults([])} style={{ width: '100%', marginTop: 'var(--sp-3)' }}>
            Clear all
          </button>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Pre-flight checklist</h3>
              <span className={`badge ${preflight.cleared ? 'ok' : 'danger'}`}>
                {preflight.cleared ? 'cleared for flight' : 'STOP'}
              </span>
            </div>
            <div className="grid grid-3" style={{ marginTop: 'var(--sp-3)' }}>
              <Readout label="Passed" value={preflight.passed} unit={`of ${preflight.items.length}`} />
              <Readout label="Cautions" value={preflight.cautions} unit="items" />
              <Readout label="Failures" value={preflight.failures} unit="items" />
            </div>

            {!preflight.cleared ? (
              <Callout tone="danger" title="A checklist is not a score.">
                {preflight.passed} of {preflight.items.length} items pass, and the aircraft still
                does not fly. One failure is a stop condition — there is no percentage at which a
                failed item becomes acceptable.
              </Callout>
            ) : preflight.cautions > 0 ? (
              <Callout tone="warn" title="Cleared, with cautions to resolve.">
                A caution is not a stop, but it is a decision that must be taken deliberately and
                recorded — not skipped past.
              </Callout>
            ) : (
              <Callout tone="ok" title="All items pass.">
                Cleared. Record the checklist with the mission: it is part of the evidence that the
                flight was conducted properly.
              </Callout>
            )}

            <table className="data" style={{ marginTop: 'var(--sp-3)' }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>State</th>
                  <th>Stop condition</th>
                </tr>
              </thead>
              <tbody>
                {preflight.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="small">{item.label}</strong>
                      <br />
                      <span className="xs faint">{item.group}</span>
                      {item.detail ? <><br /><span className="xs" style={{ color: 'var(--c-warn)' }}>{item.detail}</span></> : null}
                    </td>
                    <td>
                      <span className={`badge ${item.state === 'pass' ? 'ok' : item.state === 'caution' ? 'partial' : 'danger'}`}>
                        {item.state}
                      </span>
                    </td>
                    <td className="small muted">{item.stopCondition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {faults.length > 0 ? (
            <div className="card">
              <h3>If it is flown anyway</h3>
              {FAULTS.filter((f) => faults.includes(f.id)).map((fault) => (
                <Callout key={fault.id} tone="danger" title={fault.label}>
                  {fault.consequence}
                </Callout>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* -------------------------- incidents ------------------------ */}

      <div className="card">
        <h3>In-flight incidents (§108)</h3>
        <div className="row">
          {INCIDENTS.map((inc, i) => (
            <button
              key={inc.id}
              aria-pressed={i === incidentIndex}
              onClick={() => {
                setIncidentIndex(i);
                setChosen(null);
              }}
            >
              {inc.title}
            </button>
          ))}
        </div>

        <p className="small muted" style={{ marginTop: 'var(--sp-4)' }}>{incident.situation}</p>

        <div className="stack">
          {incident.options.map((option, i) => (
            <button
              key={option.label}
              onClick={() => setChosen(i)}
              aria-pressed={chosen === i}
              style={{ textAlign: 'left', width: '100%' }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {chosen !== null ? (
          <Callout
            tone={incident.options[chosen]!.correct ? 'ok' : 'warn'}
            title={incident.options[chosen]!.correct ? 'Sound decision.' : 'Think again.'}
          >
            {incident.options[chosen]!.reasoning}
          </Callout>
        ) : (
          <p className="xs faint" style={{ marginBottom: 0 }}>
            Choose an action. Every option carries reasoning, including the correct one — being
            told you were right teaches nothing.
          </p>
        )}
      </div>

      {/* ------------------------- post-flight ----------------------- */}

      <div className="card">
        <h3>Post-flight: preserve before you process (§110, §111)</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Approx. size</th>
              <th>Why it is required</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td><strong className="small">{asset.label}</strong></td>
                <td className="num">{asset.sizeMb >= 1024 ? `${formatNumber(asset.sizeMb / 1024, 1)} GB` : `${asset.sizeMb} MB`}</td>
                <td className="small muted">{asset.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Callout tone="danger" title="Never overwrite a raw observation.">
          The raw images, logs and GNSS observations are the evidence. Processing works on copies.
          A workflow that edits the originals destroys the only thing that can be re-examined when
          a result is challenged (§111, golden principle 19).
        </Callout>
      </div>
    </div>
  );
}
