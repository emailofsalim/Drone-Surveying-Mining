/**
 * QA/QC LAB — Spec §152–§156, §242, §245, Phase 36.
 *
 * The scenario switcher injects the three classic outcomes: a genuinely good
 * result, a result that fitted its own control but does not generalise, and a
 * result with a systematic vertical shift (the h-used-as-H blunder).
 */

import { useMemo, useState } from 'react';
import { assessControl, errorBudget, type ControlPoint, type ErrorBudgetItem } from '../../engine/qaqc/rmse';
import { formatNumber } from '../../engine/units/units';
import { featureRl, MINE_FEATURES } from '../../data/mine';
import { Callout, PageHeader, Readout, SelectField, SimulatedBanner } from '../../components/ui';

type ScenarioId = 'good' | 'overfitted' | 'vertical-shift';

const SCENARIOS: Array<{ value: ScenarioId; label: string }> = [
  { value: 'good', label: 'A — result that validates' },
  { value: 'overfitted', label: 'B — fitted its own control only' },
  { value: 'vertical-shift', label: 'C — systematic vertical shift' },
];

/** SIMULATED residual patterns, built on the virtual mine's real control layout. */
function buildControl(scenario: ScenarioId): ControlPoint[] {
  const gcps = MINE_FEATURES.filter((f) => f.kind === 'gcp');
  const checks = MINE_FEATURES.filter((f) => f.kind === 'checkpoint');

  // Deterministic pseudo-noise so the lab is reproducible (§219, §220).
  const noise = (seed: number, amplitude: number) =>
    amplitude * (Math.sin(seed * 12.9898) * 43758.5453 - Math.floor(Math.sin(seed * 12.9898) * 43758.5453) - 0.5) * 2;

  const gcpAmp = scenario === 'overfitted' ? 0.012 : 0.022;
  const checkAmp = scenario === 'overfitted' ? 0.14 : 0.03;
  const verticalBias = scenario === 'vertical-shift' ? 0.186 : 0;

  const points: ControlPoint[] = [];

  gcps.forEach((f, i) => {
    const z = featureRl(f);
    points.push({
      id: f.id,
      role: 'gcp',
      surveyed: { e: f.e, n: f.n, z },
      modelled: {
        e: f.e + noise(i + 1, gcpAmp),
        n: f.n + noise(i + 11, gcpAmp),
        z: z + noise(i + 21, gcpAmp) + verticalBias,
      },
    });
  });

  checks.forEach((f, i) => {
    const z = featureRl(f);
    points.push({
      id: f.id,
      role: 'check',
      surveyed: { e: f.e, n: f.n, z },
      modelled: {
        e: f.e + noise(i + 31, checkAmp),
        n: f.n + noise(i + 41, checkAmp),
        z: z + noise(i + 51, checkAmp) + verticalBias,
      },
    });
  });

  return points;
}

const BUDGET: ErrorBudgetItem[] = [
  { source: 'GNSS control observation (network RTK)', sigmaM: 0.02, kind: 'random' },
  { source: 'GCP target centring and marking', sigmaM: 0.015, kind: 'random' },
  { source: 'Image measurement / tie-point residual', sigmaM: 0.018, kind: 'random' },
  { source: 'Surface interpolation over a bench edge', sigmaM: 0.03, kind: 'random' },
  { source: 'Antenna height recorded 30 mm short', sigmaM: 0.03, kind: 'systematic' },
];

export function QaQcLabPage() {
  const [scenario, setScenario] = useState<ScenarioId>('good');
  const points = useMemo(() => buildControl(scenario), [scenario]);
  const verdict = useMemo(() => assessControl(points), [points]);
  const budget = useMemo(() => errorBudget(BUDGET), []);

  const decision =
    verdict.findings.length === 0
      ? { tone: 'ok' as const, text: 'Issue — the checkpoint evidence supports the intended decision.' }
      : scenario === 'vertical-shift'
        ? {
            tone: 'danger' as const,
            text: 'Reprocess — a systematic vertical shift must be found and removed, not averaged away.',
          }
        : {
            tone: 'warn' as const,
            text: 'Issue with limitations, or resurvey — the result does not generalise beyond its own control.',
          };

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phase 36 — quality assurance"
        title="GCP residuals describe the fit. Checkpoints describe the accuracy."
        lede="A model can report two-centimetre residuals on the points it was given and still fail badly on points it has never seen. Only the second number is evidence."
      />

      <SimulatedBanner />

      <div className="row">
        <div style={{ minWidth: 280 }}>
          <SelectField
            label="Scenario"
            value={scenario}
            options={SCENARIOS}
            onChange={(v) => setScenario(v)}
          />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>GCP residuals — the fit</h3>
          <div className="grid grid-2">
            <Readout label="Points" value={verdict.gcp.count} unit="GCPs" />
            <Readout label="Horizontal RMSE" value={verdict.gcp.rmseHorizontal * 100} unit="cm" />
            <Readout label="Vertical RMSE" value={verdict.gcp.rmseVertical * 100} unit="cm" />
            <Readout label="Max residual" value={verdict.gcp.maxTotal * 100} unit="cm" />
          </div>
          <p className="xs faint" style={{ marginBottom: 0 }}>
            These points constrained the adjustment. Low numbers here are expected — they are not
            an accuracy statement (golden principle 13).
          </p>
        </div>

        <div className="card">
          <h3>Checkpoint residuals — the accuracy</h3>
          <div className="grid grid-2">
            <Readout label="Points" value={verdict.check.count} unit="checkpoints" />
            <Readout label="Horizontal RMSE" value={verdict.check.rmseHorizontal * 100} unit="cm" />
            <Readout label="Vertical RMSE" value={verdict.check.rmseVertical * 100} unit="cm" />
            <Readout label="Mean vertical" value={verdict.check.meanZ * 100} unit="cm" hint="bias, not scatter" />
          </div>
          <p className="xs faint" style={{ marginBottom: 0 }}>
            These points were withheld from the adjustment. This is the number a deliverable is
            defended with.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>
          Generalisation ratio:{' '}
          <span className="num">
            {Number.isFinite(verdict.generalisationRatio)
              ? `${formatNumber(verdict.generalisationRatio, 2)}×`
              : '—'}
          </span>
        </h3>
        <p className="small muted">Checkpoint RMSE divided by GCP RMSE, horizontal.</p>
        {verdict.findings.length === 0 ? (
          <Callout tone="ok" title="No findings.">
            The checkpoints behave like the GCPs and no systematic component stands out. That is
            what a validated result looks like.
          </Callout>
        ) : (
          verdict.findings.map((f) => (
            <Callout key={f} tone="warn">
              {f}
            </Callout>
          ))
        )}
      </div>

      <div className="card">
        <h3>Residual table</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Point</th>
              <th>Role</th>
              <th className="num">dE (m)</th>
              <th className="num">dN (m)</th>
              <th className="num">dZ (m)</th>
              <th className="num">Horizontal (m)</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const dE = p.modelled.e - p.surveyed.e;
              const dN = p.modelled.n - p.surveyed.n;
              const dZ = p.modelled.z - p.surveyed.z;
              return (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>
                    <span className={`badge ${p.role === 'gcp' ? 'info' : 'ok'}`}>{p.role}</span>
                  </td>
                  <td className="num">{formatNumber(dE, 3)}</td>
                  <td className="num">{formatNumber(dN, 3)}</td>
                  <td className="num">{formatNumber(dZ, 3)}</td>
                  <td className="num">{formatNumber(Math.hypot(dE, dN), 3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Error budget (§154)</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Source</th>
                <th className="num">σ (m)</th>
                <th>Kind</th>
              </tr>
            </thead>
            <tbody>
              {BUDGET.map((item) => (
                <tr key={item.source}>
                  <td className="small">{item.source}</td>
                  <td className="num">{formatNumber(item.sigmaM, 3)}</td>
                  <td>
                    <span className={`badge ${item.kind === 'systematic' ? 'danger' : ''}`}>
                      {item.kind}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-3" style={{ marginTop: 'var(--sp-3)' }}>
            <Readout label="Random (quadrature)" value={budget.randomM * 100} unit="cm" />
            <Readout label="Systematic (additive)" value={budget.systematicM * 100} unit="cm" />
            <Readout label="Combined" value={budget.totalM * 100} unit="cm" />
          </div>
          <p className="xs faint" style={{ marginBottom: 0 }}>
            Random errors combine in quadrature; systematic errors add directly. Treating the
            antenna-height error as random would understate the budget by{' '}
            {formatNumber((budget.totalM - Math.hypot(budget.randomM, budget.systematicM)) * 100, 1)} cm.
          </p>
        </div>

        <div className="card">
          <h3>Engineering decision gate (§245)</h3>
          <p className="small muted">
            Can this result support the intended decision? The options are: issue, issue with
            limitations, reprocess, resurvey, or reject — each with evidence-based reasoning.
          </p>
          <Callout tone={decision.tone} title="Indicated outcome for this scenario:">
            {decision.text}
          </Callout>
          <p className="xs faint" style={{ marginBottom: 0 }}>
            The application indicates; it does not decide. The acceptance criteria for a deliverable
            come from the project specification and from competent professional judgement (golden
            principle 22).
          </p>
        </div>
      </div>
    </div>
  );
}
