/**
 * PROCUREMENT, RECEIVING AND INSPECTION LAB — Spec §10–§18, Phases 04–05.
 *
 * The specification's opening move (§10): the learner must NOT begin with
 * "which drone is best?" but with "what survey problem are we solving?".
 * The lab therefore refuses to name a winner and returns a technical
 * explanation instead (§10, §11, §19).
 *
 * NO VENDOR SPECIFICATIONS ARE FABRICATED (§11). Everything below is a generic
 * capability class. Product-specific values must be loaded from verified
 * manufacturer documentation.
 */

import { useMemo, useState } from 'react';
import { Callout, PageHeader, Readout, SelectField, SimulatedBanner } from '../../components/ui';
import { heightForGsd, imageFootprint, spacingForOverlap } from '../../engine/camera/gsd';
import { CAMERAS } from '../../data/cameras';

/** Survey objectives, §10. */
const OBJECTIVES = [
  { id: 'pit', label: 'Monthly pit progress', areaHa: 90, gsdCm: 3, verticalTolM: 0.08, vegetated: false, terrain: 'Benched pit with 120 m relief', deliverable: 'DTM, contours, volume against last month' },
  { id: 'stockpile', label: 'Stockpile volume', areaHa: 6, gsdCm: 2, verticalTolM: 0.05, vegetated: false, terrain: 'Conical piles on a prepared pad', deliverable: 'DTM, boundary, volume with stated base' },
  { id: 'lease', label: 'Lease-scale mapping', areaHa: 1800, gsdCm: 8, verticalTolM: 0.4, vegetated: true, terrain: 'Rolling ground, partial vegetation', deliverable: 'Orthomosaic, DSM, boundary plan' },
  { id: 'highwall', label: 'Highwall condition', areaHa: 12, gsdCm: 1.5, verticalTolM: 0.05, vegetated: false, terrain: 'Near-vertical face, 60 m high', deliverable: 'Dense cloud, mesh, structural mapping' },
  { id: 'rehab', label: 'Rehabilitation monitoring', areaHa: 240, gsdCm: 5, verticalTolM: 0.25, vegetated: true, terrain: 'Established regrowth over shaped ground', deliverable: 'DTM under cover, NDVI, change detection' },
  { id: 'haul', label: 'Haul road condition', areaHa: 45, gsdCm: 2.5, verticalTolM: 0.06, vegetated: false, terrain: 'Linear corridor, active traffic', deliverable: 'Surface, cross-sections, grade compliance' },
];

/** Generic platform classes — capability, not product (§11, §19). */
const PLATFORMS = [
  { id: 'multirotor-small', label: 'Small multirotor', enduranceMin: 25, cruiseMs: 7, vtol: true, payloadKg: 1.0, note: 'Confined pads, vertical faces, small blocks.' },
  { id: 'multirotor-large', label: 'Large multirotor / hexacopter', enduranceMin: 35, cruiseMs: 9, vtol: true, payloadKg: 4.5, note: 'Heavier payloads and redundancy where required.' },
  { id: 'vtol', label: 'VTOL hybrid', enduranceMin: 70, cruiseMs: 18, vtol: true, payloadKg: 1.8, note: 'Large areas from a constrained launch point.' },
  { id: 'fixed-wing', label: 'Fixed wing', enduranceMin: 90, cruiseMs: 22, vtol: false, payloadKg: 1.2, note: 'Greatest coverage; needs launch and landing space.' },
];

const PAYLOAD_CLASSES = [
  { id: 'rgb', label: 'RGB mapping camera', suitsVegetation: false, suitsVertical: true, spectral: false },
  { id: 'lidar', label: 'LiDAR', suitsVegetation: true, suitsVertical: true, spectral: false },
  { id: 'multispectral', label: 'Multispectral', suitsVegetation: false, suitsVertical: false, spectral: true },
];

/** §11 — technical evaluation criteria. */
const EVALUATION_CRITERIA = [
  ['Airframe', 'Configuration, redundancy concept, ingress protection, field serviceability.'],
  ['Payload capacity', 'Mass and interface for the sensors the objective actually needs.'],
  ['Endurance', 'Under the real mission profile, in the site conditions — not the brochure hover figure.'],
  ['Wind capability', 'Stated limit and the margin it leaves at the site\'s typical afternoon wind.'],
  ['Battery system', 'Chemistry, cycle life, charging infrastructure, transport rules, spares availability.'],
  ['Controller and telemetry', 'Range, interference behaviour, failsafe configuration.'],
  ['GNSS and RTK/PPK', 'Positioning modes, raw-observation logging, antenna offset handling.'],
  ['Payload interface', 'Whether third-party sensors can be fitted, and on what terms.'],
  ['Storage', 'Capacity for the largest planned sortie and the write rate at the planned trigger interval.'],
  ['Image metadata', 'What is recorded per exposure, and in what reference frame.'],
  ['Raw logs', 'Whether raw GNSS and flight logs are accessible — PPK is impossible without them.'],
  ['Software dependency', 'What the workflow requires, on what licence, and what happens if it lapses.'],
  ['Export options', 'Which formats, and whether CRS metadata travels with them.'],
  ['SDK / data access', 'Whether the data can be used outside the vendor ecosystem.'],
  ['Spare parts', 'Lead time for propellers, arms, motors and batteries.'],
  ['Warranty and repair', 'Turnaround, in-country support, loan units.'],
  ['Training', 'Operator qualification, currency, and who provides it.'],
  ['Total cost of ownership', 'Purchase, batteries, software, training, maintenance, downtime — over the asset life.'],
];

/** §12, §13 — acceptance and incoming inspection with a hidden fault. */
const INSPECTION_ITEMS = [
  { id: 'body', label: 'Airframe body', normal: 'Shell intact, no deformation, fasteners torqued.' },
  { id: 'arms', label: 'Arms and folding joints', normal: 'No play, locks engage positively.', fault: 'Hairline crack at the base of the rear-left arm, under the decal.' },
  { id: 'motors', label: 'Motor mounts and bearings', normal: 'Spin freely, no roughness, no axial play.' },
  { id: 'props', label: 'Propellers', normal: 'No chips, cracks or delamination; matched set.' },
  { id: 'gimbal', label: 'Gimbal and isolators', normal: 'Free movement, isolators supple, no witness marks.' },
  { id: 'camera', label: 'Camera and lens', normal: 'Glass clean, no fungus, focus smooth.' },
  { id: 'connectors', label: 'Connectors and looms', normal: 'No corrosion, no chafe, strain relief intact.' },
  { id: 'batteries', label: 'Batteries', normal: 'No swelling, cells balanced, cycle count as declared.' },
  { id: 'antennas', label: 'Antennas', normal: 'Secure, undamaged, correct orientation.' },
  { id: 'docs', label: 'Documents and serials', normal: 'Serial numbers match the delivery note and the asset register.' },
];

/** §14 — asset traceability chain. */
const TRACEABILITY = [
  'Aircraft ID', 'Payload ID', 'Battery ID', 'Controller ID',
  'Mission ID', 'Dataset ID', 'Processing project', 'Final report',
];

export function ProcurementLabPage() {
  const [objectiveId, setObjectiveId] = useState(OBJECTIVES[0]!.id);
  const [platformId, setPlatformId] = useState(PLATFORMS[0]!.id);
  const [payloadId, setPayloadId] = useState(PAYLOAD_CLASSES[0]!.id);
  const [inspected, setInspected] = useState<string[]>([]);

  const objective = OBJECTIVES.find((o) => o.id === objectiveId)!;
  const platform = PLATFORMS.find((p) => p.id === platformId)!;
  const payload = PAYLOAD_CLASSES.find((p) => p.id === payloadId)!;

  /** Geometry check: can this configuration actually cover the area? */
  const analysis = useMemo(() => {
    // Use the widest generic camera as the representative RGB sensor.
    const camera = CAMERAS.find((c) => c.id === 'cam-4-3-20mp')!;
    const height = heightForGsd(camera, objective.gsdCm / 100);
    const footprint = imageFootprint(camera, height);
    const lineSpacing = spacingForOverlap(footprint.widthM, 0.7);

    const areaM2 = objective.areaHa * 10_000;
    const lineLength = Math.sqrt(areaM2);
    const lineCount = Math.ceil(lineLength / lineSpacing);
    const flightDistanceM = lineCount * lineLength;
    const flightTimeMin = flightDistanceM / platform.cruiseMs / 60;
    // Usable time per sortie, after take-off, climb, transit and the reserve.
    const usablePerSortie = platform.enduranceMin * 0.65;
    const sorties = Math.ceil(flightTimeMin / usablePerSortie);

    return { camera, height, footprint, lineSpacing, lineCount, flightDistanceM, flightTimeMin, sorties, usablePerSortie };
  }, [objective, platform]);

  const findings = useMemo(() => {
    const out: Array<{ tone: 'ok' | 'warn' | 'danger'; text: string }> = [];

    if (objective.vegetated && !payload.suitsVegetation) {
      out.push({
        tone: 'danger',
        text:
          'The objective involves vegetated ground, and this payload reconstructs the surface it ' +
          'can see. That surface is the canopy, not the terrain — and no amount of processing ' +
          'recovers ground the sensor never reached (§137, golden principle 16).',
      });
    }
    if (objectiveId === 'highwall' && !platform.vtol) {
      out.push({
        tone: 'danger',
        text:
          'A near-vertical face needs station-keeping and oblique capture close to the wall. A ' +
          'fixed wing cannot hold position, so nadir-only coverage of a highwall leaves the face ' +
          'itself almost unobserved (§138).',
      });
    }
    if (analysis.sorties > 1) {
      out.push({
        tone: analysis.sorties > 4 ? 'danger' : 'warn',
        text:
          `This configuration needs about ${analysis.sorties} sorties to cover ${objective.areaHa} ha ` +
          `at ${objective.gsdCm} cm/px. Each battery change is a break in the block, a fresh take-off ` +
          'and a chance for conditions to shift — plan the overlap between sorties deliberately.',
      });
    }
    if (objective.gsdCm < 2 && platform.cruiseMs > 15) {
      out.push({
        tone: 'warn',
        text:
          'A fine GSD at high cruise speed demands a very short exposure to keep motion smear under ' +
          'a pixel. Check the achievable shutter against the site\'s typical light (§84).',
      });
    }
    if (objective.verticalTolM < 0.06) {
      out.push({
        tone: 'warn',
        text:
          `A ${(objective.verticalTolM * 100).toFixed(0)} cm vertical tolerance is demanding. It needs ` +
          'observed control, independent checkpoints, and a stated geoid — the payload choice alone ' +
          'will not deliver it (§152).',
      });
    }
    if (payload.spectral && objective.id !== 'rehab') {
      out.push({
        tone: 'warn',
        text:
          'A multispectral payload measures reflectance, not geometry. For a geometric deliverable ' +
          'it adds cost and processing without improving the surface.',
      });
    }
    if (out.length === 0) {
      out.push({
        tone: 'ok',
        text:
          'No structural mismatch between the objective and this configuration. That is not the same ' +
          'as "correct" — the endurance, wind limit and support arrangements still have to be ' +
          'verified against the manufacturer\'s documentation and the site\'s conditions.',
      });
    }
    return out;
  }, [objective, objectiveId, payload, platform, analysis.sorties]);

  const foundFault = inspected.includes('arms');
  const faultItem = INSPECTION_ITEMS.find((i) => i.fault);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 04 & 05 — procurement, receiving, inspection"
        title="Not “which drone is best?” but “what survey problem are we solving?”"
        lede="Equipment selection is the last step of a specification, not the first. Define the objective, the area, the accuracy, the reference system, the control and the deliverable — then the aircraft and payload follow from them."
      />

      <SimulatedBanner />

      <Callout tone="danger" title="No vendor specifications appear in this application.">
        Every entry below is a generic capability class. The specification is explicit (§11): never
        fabricate vendor specifications. Product-specific values must be taken from verified
        manufacturer documentation for the actual equipment under consideration.
      </Callout>

      {/* --------------------- objective first --------------------- */}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">1 — Define the problem</p>
            <SelectField
              label="Survey objective"
              value={objectiveId}
              options={OBJECTIVES.map((o) => ({ value: o.id, label: o.label }))}
              onChange={setObjectiveId}
            />
            <dl className="kv small">
              <dt>Area</dt><dd>{objective.areaHa} ha</dd>
              <dt>Required GSD</dt><dd>{objective.gsdCm} cm/px</dd>
              <dt>Vertical tolerance</dt><dd>{(objective.verticalTolM * 100).toFixed(0)} cm</dd>
              <dt>Terrain</dt><dd>{objective.terrain}</dd>
              <dt>Vegetation</dt><dd>{objective.vegetated ? 'present' : 'none significant'}</dd>
              <dt>Deliverable</dt><dd>{objective.deliverable}</dd>
            </dl>
          </div>

          <div className="panel">
            <p className="panel-title">2 — Only now, the equipment</p>
            <SelectField
              label="Platform class"
              value={platformId}
              options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
              onChange={setPlatformId}
            />
            <p className="xs faint">{platform.note}</p>
            <SelectField
              label="Payload class"
              value={payloadId}
              options={PAYLOAD_CLASSES.map((p) => ({ value: p.id, label: p.label }))}
              onChange={setPayloadId}
            />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Does this configuration meet the objective?</h3>
            <div className="grid grid-3">
              <Readout label="Height for the required GSD" value={analysis.height} unit="m" />
              <Readout label="Footprint width" value={analysis.footprint.widthM} unit="m" />
              <Readout label="Line spacing at 70% side overlap" value={analysis.lineSpacing} unit="m" />
              <Readout label="Flight lines" value={analysis.lineCount} unit="lines" />
              <Readout label="Flying time" value={analysis.flightTimeMin} unit="min" hint="geometry only" />
              <Readout label="Sorties required" value={analysis.sorties} unit="sorties" />
            </div>
            {findings.map((f) => (
              <Callout key={f.text} tone={f.tone}>{f.text}</Callout>
            ))}
            <Callout tone="info" title="A technical explanation, not a winner.">
              The specification requires this lab to explain rather than to rank (§10). Two
              configurations can both meet an objective and differ entirely in cost, risk, support
              and how much of the workflow they lock to one vendor.
            </Callout>
          </div>

          <div className="card">
            <h3>Technical evaluation criteria (§11)</h3>
            <table className="data">
              <tbody>
                {EVALUATION_CRITERIA.map(([criterion, detail]) => (
                  <tr key={criterion}>
                    <td style={{ width: '26%' }}><strong className="small">{criterion}</strong></td>
                    <td className="small muted">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ---------------- receiving and inspection ---------------- */}

      <div className="split">
        <div className="card">
          <h3>Incoming inspection (§13)</h3>
          <p className="small muted">
            One of these items has a defect. Inspect each in turn. An acceptance that finds nothing
            because nothing was looked for is not an acceptance.
          </p>
          <div className="stack" style={{ display: 'grid', gap: 'var(--sp-1)' }}>
            {INSPECTION_ITEMS.map((item) => {
              const done = inspected.includes(item.id);
              return (
                <button
                  key={item.id}
                  aria-pressed={done}
                  onClick={() =>
                    setInspected((c) => (c.includes(item.id) ? c.filter((i) => i !== item.id) : [...c, item.id]))
                  }
                  style={{ textAlign: 'left', width: '100%' }}
                >
                  <span className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{item.label}</span>
                    {done ? (
                      <span className={`badge ${item.fault ? 'danger' : 'ok'}`}>
                        {item.fault ? 'DEFECT' : 'pass'}
                      </span>
                    ) : (
                      <span className="badge">not inspected</span>
                    )}
                  </span>
                  {done ? (
                    <span className="xs" style={{ color: item.fault ? 'var(--c-danger)' : 'var(--c-text-faint)' }}>
                      {item.fault ?? item.normal}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 'var(--sp-3)' }}>
            <button className="ghost" onClick={() => setInspected([])}>Reset</button>
            <span className="xs faint">
              {inspected.length} of {INSPECTION_ITEMS.length} inspected
            </span>
          </div>

          {foundFault ? (
            <Callout tone="danger" title="Defect found — reject the acceptance.">
              {faultItem?.fault} A crack in a load-bearing arm changes the geometry the flight
              controller assumes and will propagate under vibration. Record it against the serial
              number, raise it with the supplier before the warranty position is complicated, and
              do not enter the aircraft into service.
            </Callout>
          ) : inspected.length >= INSPECTION_ITEMS.length ? (
            <Callout tone="ok" title="All items inspected.">
              A complete inspection with a defect found is a successful inspection. A complete
              inspection with nothing found is only meaningful because it was complete.
            </Callout>
          ) : (
            <Callout tone="info" title="Keep going.">
              The specification requires hidden faults precisely because a real acceptance is not a
              formality (§13). Inspect every item before signing anything.
            </Callout>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h3>Asset traceability (§14)</h3>
            <p className="small muted">
              Every deliverable has to be traceable back to the equipment that produced it. This is
              not administration — it is what allows a challenged result to be investigated.
            </p>
            <div className="row">
              {TRACEABILITY.map((step, i) => (
                <span key={step} className="row" style={{ gap: 4 }}>
                  <span className="badge info">{step}</span>
                  {i < TRACEABILITY.length - 1 ? <span className="faint xs">↔</span> : null}
                </span>
              ))}
            </div>
            <Callout tone="info" title="Why it matters six months later.">
              When a volume is disputed, the questions are: which aircraft, which payload, which
              calibration, which batteries, which mission, which dataset, which processing run.
              Without the chain, none of them can be answered (§111, golden principle 20).
            </Callout>
          </div>

          <div className="card">
            <h3>Firmware and configuration control (§15)</h3>
            <table className="data">
              <tbody>
                <tr><td><strong className="small">Update</strong></td><td className="small muted">Obtain from the manufacturer, read the release notes, check payload compatibility.</td></tr>
                <tr><td><strong className="small">Test</strong></td><td className="small muted">Bench checks, then a controlled flight away from production work.</td></tr>
                <tr><td><strong className="small">Verify</strong></td><td className="small muted">Confirm the sensors, camera triggering and positioning behave as before.</td></tr>
                <tr><td><strong className="small">Record</strong></td><td className="small muted">Version against the asset ID and the date, in the register.</td></tr>
              </tbody>
            </table>
            <Callout tone="warn" title="Never “always update immediately”.">
              A firmware change is a configuration change to a measuring instrument. It can alter
              camera timing, positioning behaviour or failsafe logic. It belongs under controlled
              maintenance, tied to the manufacturer's guidance — not applied on the tailgate before
              a survey (§15).
            </Callout>
          </div>
        </div>
      </div>

      {/* ------------------------- mobilisation -------------------- */}

      <div className="card">
        <h3>Transport and mine entry (§17, §18)</h3>
        <div className="grid grid-2">
          <div className="panel">
            <p className="panel-title">Packing list — and what a forgotten item costs</p>
            <table className="data">
              <tbody>
                <tr><td className="small">GCP targets and measuring equipment</td><td className="small muted">No observed control: the block cannot be constrained or validated.</td></tr>
                <tr><td className="small">Base station and tripod</td><td className="small muted">No differential corrections; the survey drops to metre level.</td></tr>
                <tr><td className="small">Spare propellers</td><td className="small muted">One chip ends the day — the inspection finds it, and nothing replaces it.</td></tr>
                <tr><td className="small">Backup storage</td><td className="small muted">No means of preserving raw data before processing (§111).</td></tr>
                <tr><td className="small">Charged batteries and charger</td><td className="small muted">Coverage is capped by whatever arrived charged.</td></tr>
                <tr><td className="small">PPE and site documents</td><td className="small muted">No site entry at all; the survey does not start.</td></tr>
              </tbody>
            </table>
          </div>
          <div className="panel">
            <p className="panel-title">Mine entry starts with the site, not the software</p>
            <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
              <li>Induction, permits and the day's authorisation.</li>
              <li>Traffic management and HEMM movements in the survey area.</li>
              <li>Blasting schedule and the exclusion-zone interface.</li>
              <li>Powerline corridors and other vertical hazards.</li>
              <li>People working in or below the flight area.</li>
              <li>Radio communications and who must be informed before launch.</li>
              <li>Weather, visibility and the site's own operating restrictions.</li>
            </ul>
            <Callout tone="danger" title="§18, in one line.">
              Drone mission planning starts with site understanding, not with software. Everything
              in the planner is downstream of what the site will actually permit that day.
            </Callout>
          </div>
        </div>
      </div>
    </div>
  );
}
