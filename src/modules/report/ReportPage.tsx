/**
 * REPORT GENERATOR, DECISION GATE AND ASSESSMENT
 * Spec §173, §177, §192–§193, §245, §246, §247. Phases 38, 39, 41.
 */

import { useMemo, useState } from 'react';
import {
  ASSESSMENT,
  generateReport,
  scoreAssessment,
  scoreSimulation,
  VERDICT_LABEL,
  VERDICT_TONE,
  type ReportInputs,
  type SimulationEvent,
} from '../../engine/assessment/report';
import { formatNumber } from '../../engine/units/units';
import { Callout, PageHeader, Readout, SimulatedBanner, SliderField } from '../../components/ui';

/** Failure injections available to the trainer — Spec §194. */
const INJECTIONS: Array<{ id: string; label: string; apply: (i: ReportInputs) => ReportInputs; event?: SimulationEvent }> = [
  {
    id: 'no-checkpoints',
    label: 'No independent checkpoints observed',
    apply: (i) => ({ ...i, checkpointCount: 0 }),
    event: { id: 'e-cp', category: 'qc', description: 'Issued without independent validation' },
  },
  {
    id: 'ellipsoidal',
    label: 'Ellipsoidal height used as RL',
    apply: (i) => ({ ...i, geoidModel: null, meanVerticalResidualM: 0.19, checkRmseVerticalM: 0.2 }),
    event: { id: 'e-h', category: 'reference', description: 'Wrong vertical reference carried into the deliverable' },
  },
  {
    id: 'unclassified',
    label: 'Volume computed from an unclassified DSM',
    apply: (i) => ({ ...i, surfaceKind: 'DSM', classified: false }),
    event: { id: 'e-dsm', category: 'processing', description: 'Cover measured as material' },
  },
  {
    id: 'no-method',
    label: 'Volume reported with no base or method',
    apply: (i) => ({ ...i, volumeBase: null, volumeMethod: null }),
    event: { id: 'e-vm', category: 'processing', description: 'Volume reported without methodology' },
  },
  {
    id: 'low-overlap',
    label: 'Overlap reduced to 60% / 45%',
    apply: (i) => ({ ...i, forwardOverlap: 0.6, sideOverlap: 0.45 }),
    event: { id: 'e-ol', category: 'mission-design', description: 'Insufficient observational redundancy' },
  },
  {
    id: 'gsd-spread',
    label: 'Constant-height flight over the pit',
    apply: (i) => ({ ...i, achievedGsdMaxCm: i.achievedGsdMinCm * 2.1 }),
    event: { id: 'e-gsd', category: 'mission-design', description: 'GSD not held over the block' },
  },
  {
    id: 'coverage-gap',
    label: 'Coverage gap inside the volume boundary',
    apply: (i) => ({ ...i, coverageGapM2: 780 }),
    event: { id: 'e-gap', category: 'data-loss', description: 'Missing coverage inside the measured boundary' },
  },
  {
    id: 'weak-control',
    label: 'Only two ground control points',
    apply: (i) => ({ ...i, gcpCount: 2 }),
    event: { id: 'e-gcp', category: 'control', description: 'Block weakly constrained' },
  },
  {
    id: 'unsafe',
    label: 'Flew with an unresolved pre-flight failure',
    apply: (i) => i,
    event: { id: 'e-safe', category: 'unsafe', description: 'Flew with a known stop condition outstanding' },
  },
];

const BASE_INPUTS: ReportInputs = {
  projectName: 'Hillock Ridge — monthly pit progress (SIMULATED)',
  objective: 'Pit progress and ROM stockpile volume for the monthly reconciliation',
  date: '2026-09-22',
  operator: 'Trainee operator',
  aircraft: 'Generic quadrotor, RTK-equipped',
  payload: 'Generic 1" 20 MP mapping camera',
  positioningMode: 'RTK-fixed with PPK backup',
  crs: 'Hillock Ridge Mine Local Grid (simulated)',
  verticalReference: 'Mine RL datum (orthometric), BM-07 = 500.000 m',
  geoidModel: 'Applicable geoid model for the site',
  plannedGsdCm: 3,
  achievedGsdMinCm: 2.9,
  achievedGsdMaxCm: 3.2,
  forwardOverlap: 0.8,
  sideOverlap: 0.7,
  imageCount: 612,
  gcpCount: 6,
  checkpointCount: 4,
  checkRmseHorizontalM: 0.028,
  checkRmseVerticalM: 0.041,
  meanVerticalResidualM: 0.004,
  surfaceKind: 'DTM',
  classified: true,
  volumeM3: 98450,
  volumeMethod: 'grid-prism, 2 m cells',
  volumeBase: 'horizontal plane at RL 505.0 m',
  coverageGapM2: 0,
  requiredHorizontalM: 0.05,
  requiredVerticalM: 0.08,
};

export function ReportPage() {
  const [active, setActive] = useState<string[]>([]);
  const [reqH, setReqH] = useState(0.05);
  const [reqV, setReqV] = useState(0.08);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const inputs = useMemo(() => {
    let result: ReportInputs = { ...BASE_INPUTS, requiredHorizontalM: reqH, requiredVerticalM: reqV };
    for (const injection of INJECTIONS) {
      if (active.includes(injection.id)) result = injection.apply(result);
    }
    return result;
  }, [active, reqH, reqV]);

  const report = useMemo(() => generateReport(inputs), [inputs]);

  const events = useMemo(
    () =>
      INJECTIONS.filter((i) => active.includes(i.id))
        .map((i) => i.event)
        .filter((e): e is SimulationEvent => e !== undefined),
    [active],
  );
  const simulation = useMemo(() => scoreSimulation(events), [events]);

  const assessment = useMemo(() => scoreAssessment(answers), [answers]);

  const toggle = (id: string) =>
    setActive((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const downloadReport = () => {
    const lines: string[] = [
      `# ${report.inputs.projectName}`,
      '',
      'SIMULATED TRAINING DATA — NOT A REAL MINE OBSERVATION',
      '',
      `## Decision: ${VERDICT_LABEL[report.verdict]}`,
      '',
      report.verdictReason,
      '',
    ];
    for (const section of report.sections) {
      lines.push(`## ${section.heading}`, '');
      for (const row of section.rows) lines.push(`- **${row.label}:** ${row.value}`);
      lines.push('');
    }
    if (report.findings.length > 0) {
      lines.push('## Findings', '');
      for (const f of report.findings) {
        lines.push(`- **[${f.severity}] ${f.topic}** (${f.basis}): ${f.statement}`);
      }
      lines.push('');
    }
    lines.push('## Limitations', '');
    for (const l of report.limitations) lines.push(`- ${l}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulated-survey-report.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 38, 39 & 41 — report, decision gate, assessment"
        title="Can this result support the decision it was commissioned for?"
        lede="A survey report is not a description of what was done. It is the evidence that the deliverable is fit for its purpose — and anything that cannot be evidenced becomes a stated limitation, never a silent omission."
      />

      <SimulatedBanner />

      {/* ------------------- failure injection ------------------- */}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Inject failures (§194)</p>
            <div className="stack" style={{ display: 'grid', gap: 'var(--sp-1)' }}>
              {INJECTIONS.map((injection) => (
                <button
                  key={injection.id}
                  aria-pressed={active.includes(injection.id)}
                  onClick={() => toggle(injection.id)}
                  style={{ textAlign: 'left', width: '100%' }}
                >
                  {injection.label}
                </button>
              ))}
            </div>
            <button className="ghost" onClick={() => setActive([])} style={{ width: '100%', marginTop: 'var(--sp-3)' }}>
              Clear all
            </button>
          </div>

          <div className="panel">
            <p className="panel-title">Project tolerance</p>
            <SliderField label="Required horizontal" value={reqH} onChange={setReqH} min={0.01} max={0.5} step={0.01} format={(v) => `${(v * 100).toFixed(0)} cm`} />
            <SliderField label="Required vertical" value={reqV} onChange={setReqV} min={0.01} max={0.5} step={0.01} format={(v) => `${(v * 100).toFixed(0)} cm`} />
            <p className="xs faint" style={{ marginBottom: 0 }}>
              The tolerance comes from the project specification and the decision the survey
              supports — never from what the survey happened to achieve.
            </p>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Engineering decision gate (§245)</h3>
              <span className={`badge ${VERDICT_TONE[report.verdict] === 'ok' ? 'ok' : VERDICT_TONE[report.verdict] === 'warn' ? 'partial' : 'danger'}`}>
                {VERDICT_LABEL[report.verdict]}
              </span>
            </div>
            <Callout tone={VERDICT_TONE[report.verdict]} title={VERDICT_LABEL[report.verdict]}>
              {report.verdictReason}
            </Callout>
            <div className="grid grid-3">
              <Readout label="Blockers" value={report.findings.filter((f) => f.severity === 'blocker').length} unit="findings" />
              <Readout label="Limitations" value={report.findings.filter((f) => f.severity === 'limitation').length} unit="findings" />
              <Readout label="Checkpoint horizontal RMSE" value={inputs.checkpointCount > 0 ? inputs.checkRmseHorizontalM * 100 : NaN} unit="cm" />
            </div>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              The application indicates; the engineer decides. Acceptance criteria come from the
              project specification and competent professional judgement (golden principle 22).
            </p>
          </div>

          {report.findings.length > 0 ? (
            <div className="card">
              <h3>Findings, each with its basis</h3>
              <table className="data">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Topic</th>
                    <th>Statement</th>
                    <th>Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {report.findings.map((f) => (
                    <tr key={`${f.topic}-${f.basis}`}>
                      <td>
                        <span className={`badge ${f.severity === 'blocker' ? 'danger' : f.severity === 'limitation' ? 'partial' : ''}`}>
                          {f.severity}
                        </span>
                      </td>
                      <td><strong className="small">{f.topic}</strong></td>
                      <td className="small muted">{f.statement}</td>
                      <td className="xs num">{f.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Survey report (§173)</h3>
              <button className="primary" onClick={downloadReport}>Download</button>
            </div>
            <div className="grid grid-2" style={{ marginTop: 'var(--sp-3)' }}>
              {report.sections.map((section) => (
                <div key={section.heading} className="panel">
                  <p className="panel-title">{section.heading}</p>
                  <dl className="kv small">
                    {section.rows.map((row) => (
                      <div key={row.label} style={{ display: 'contents' }}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Stated limitations</h3>
            <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
              {report.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <Callout tone="warn" title="An unstated limitation is a defect.">
              Every constraint on how the deliverable may be used belongs in the report. Omitting
              one does not make the result better — it makes it undefendable (§228).
            </Callout>
          </div>
        </div>
      </div>

      {/* ---------------- super-simulation scoring --------------- */}

      <div className="card">
        <h3>Super-simulation scoring (§193)</h3>
        <div className="grid grid-3">
          <Readout label="Score" value={simulation.score} unit="/ 100" />
          <Readout label="Deductions" value={simulation.deductions.length} unit="events" />
          <Readout label="Unsafe decisions" value={events.filter((e) => e.category === 'unsafe').length} unit="events" />
        </div>
        {simulation.deductions.length > 0 ? (
          <table className="data" style={{ marginTop: 'var(--sp-3)' }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Event</th>
                <th className="num">Penalty</th>
              </tr>
            </thead>
            <tbody>
              {simulation.deductions.map((d) => (
                <tr key={d.event.id}>
                  <td><span className={`badge ${d.event.category === 'unsafe' ? 'danger' : ''}`}>{d.event.category}</span></td>
                  <td className="small muted">{d.event.description}</td>
                  <td className="num">−{d.penalty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <Callout tone={events.some((e) => e.category === 'unsafe') ? 'danger' : simulation.score >= 80 ? 'ok' : 'warn'}>
          {simulation.outcome}
        </Callout>
        <p className="xs faint" style={{ marginBottom: 0 }}>
          Time is not scored at all. The specification is explicit: do not reward speed over
          engineering correctness. Unsafe decisions and reference errors carry the heaviest weight
          because they are the ones that reach the deliverable — or the people.
        </p>
      </div>

      {/* ------------------------ assessment --------------------- */}

      <div className="card">
        <h3>Competency assessment (§177, §178)</h3>
        <p className="small muted">
          Competencies are tracked independently. A single averaged score hides exactly the
          information a trainer needs.
        </p>

        <div className="stack">
          {ASSESSMENT.map((question) => {
            const chosen = answers[question.id];
            const show = revealed[question.id];
            return (
              <div key={question.id} className="panel">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="badge info">{question.competency}</span>
                </div>
                <p className="small" style={{ marginTop: 'var(--sp-2)' }}>{question.prompt}</p>
                <div className="stack" style={{ display: 'grid', gap: 'var(--sp-1)' }}>
                  {question.options.map((option, i) => (
                    <button
                      key={option.label}
                      aria-pressed={chosen === i}
                      onClick={() => {
                        setAnswers((a) => ({ ...a, [question.id]: i }));
                        setRevealed((r) => ({ ...r, [question.id]: true }));
                      }}
                      style={{ textAlign: 'left', width: '100%' }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {show && chosen !== undefined ? (
                  <Callout tone={question.options[chosen]!.correct ? 'ok' : 'warn'}>
                    {question.options[chosen]!.reasoning}
                    {!question.options[chosen]!.correct ? (
                      <>
                        <br />
                        <br />
                        <strong>The sound answer:</strong> {question.options.find((o) => o.correct)!.label} —{' '}
                        {question.options.find((o) => o.correct)!.reasoning}
                      </>
                    ) : null}
                  </Callout>
                ) : null}
              </div>
            );
          })}
        </div>

        {assessment.answered > 0 ? (
          <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
            <h4>Competency profile</h4>
            <div className="grid grid-3">
              <Readout label="Answered" value={assessment.answered} unit={`of ${ASSESSMENT.length}`} />
              <Readout label="Correct" value={assessment.correct} unit="answers" />
              <Readout label="Weakest competency" value={assessment.weakest ?? '—'} />
            </div>
            <table className="data" style={{ marginTop: 'var(--sp-3)' }}>
              <thead>
                <tr>
                  <th>Competency</th>
                  <th className="num">Correct</th>
                  <th className="num">Asked</th>
                  <th className="num">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {assessment.byCompetency.map((c) => (
                  <tr key={c.competency}>
                    <td className="small">{c.competency}</td>
                    <td className="num">{c.correct}</td>
                    <td className="num">{c.asked}</td>
                    <td className="num">{formatNumber(c.ratio * 100, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 'var(--sp-3)' }}>
          <button
            className="ghost"
            onClick={() => {
              setAnswers({});
              setRevealed({});
            }}
          >
            Reset assessment
          </button>
        </div>
      </div>
    </div>
  );
}
