import { Link } from 'react-router-dom';
import { buildProgress, TOPICS } from '../../data/knowledge-graph';
import { APPLICATION_MODES, GOLDEN_PRINCIPLES } from '../../data/sops';
import { PageHeader, SimulatedBanner } from '../../components/ui';

const ENTRY_POINTS = [
  {
    to: '/mine',
    title: 'The virtual mine',
    body: 'One simulated open pit, seen as 3D terrain, plan view and section — all generated from the same elevation model.',
    tag: 'Phase 02',
  },
  {
    to: '/knowledge',
    title: 'Knowledge graph',
    body: 'The full chain from procurement to engineering decision, as a dependency graph. Shows what is built and what is planned.',
    tag: 'Phase 03',
  },
  {
    to: '/north',
    title: 'North reference lab',
    body: 'True, magnetic and grid north. Convert a bearing, then see how far the set-out line moves when you get it wrong.',
    tag: 'Phase 12',
  },
  {
    to: '/crs',
    title: 'CRS & projection lab',
    body: 'UTM with real convergence and scale factor, plus the axis-order and zone traps that make a whole mine appear to move.',
    tag: 'Phase 13',
  },
  {
    to: '/height',
    title: 'Height & RL lab',
    body: 'h = H + N, levelling reduction with arithmetic checks, and the five different meanings of "flying at 100 m".',
    tag: 'Phase 14',
  },
  {
    to: '/gsd',
    title: 'GSD & mission geometry',
    body: 'Ground sampling distance, footprint, overlap and image count — and what a pit does to a plan flown at constant height.',
    tag: 'Phase 18/20',
  },
  {
    to: '/qaqc',
    title: 'QA/QC lab',
    body: 'GCP residuals versus independent checkpoint RMSE, systematic shifts, and the error budget behind a decision.',
    tag: 'Phase 36',
  },
  {
    to: '/formulas',
    title: 'Formula library',
    body: 'Every formula with its variables, substitution, dimensional analysis, assumptions and limitations.',
    tag: 'Phase 01',
  },
];

export function HomePage() {
  const progress = buildProgress();
  const built = TOPICS.filter((t) => t.status === 'built');

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Open-source educational simulator"
        title="From a drone on the mine to a defensible engineering decision."
        lede="See it. Fly it. Measure it. Process it. Verify it. An interactive digital laboratory in which the learner is the operator, pilot, survey engineer and analyst — not an audience."
      />

      <SimulatedBanner />

      <section className="grid grid-3">
        <div className="card">
          <h4>What this is</h4>
          <p className="small muted">
            A browser-based training platform that teaches the complete UAV survey lifecycle in
            mining from first principles: aircraft, sensors, geodesy, imaging, mission, data,
            photogrammetry, surfaces, volumes and quality assurance.
          </p>
        </div>
        <div className="card">
          <h4>What it is not</h4>
          <p className="small muted">
            Not an aircraft certification system, not a legal compliance guarantee, not a
            manufacturer-certified simulator, and not a substitute for applicable law, mine SOPs or
            competent supervision. Simulation is not certification.
          </p>
        </div>
        <div className="card">
          <h4>Build state</h4>
          <p className="small muted">
            {progress.built} topics built, {progress.partial} partial, {progress.planned} planned of{' '}
            {progress.total}. The specification requires phased delivery, so the roadmap is visible
            rather than hidden.
          </p>
          <Link className="small" to="/knowledge">
            Open the knowledge graph →
          </Link>
        </div>
      </section>

      <section>
        <h2>Start here</h2>
        <div className="grid grid-2">
          {ENTRY_POINTS.map((entry) => (
            <Link key={entry.to} to={entry.to} className="card card-link">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h4 style={{ margin: 0 }}>{entry.title}</h4>
                <span className="badge">{entry.tag}</span>
              </div>
              <p className="small muted" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
                {entry.body}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <p className="panel-title">Application modes (spec §3)</p>
          <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
            {APPLICATION_MODES.map((mode) => (
              <li key={mode.id} style={{ marginBottom: 4 }}>
                <strong>{mode.name}</strong>{' '}
                <span className={`badge ${mode.available ? 'built' : 'planned'}`}>
                  {mode.available ? 'available' : 'planned'}
                </span>
                <br />
                <span className="faint xs">{mode.description}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <p className="panel-title">Master golden principles (spec §257)</p>
          <ol className="small" style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {GOLDEN_PRINCIPLES.map((p) => (
              <li key={p} style={{ marginBottom: 2 }}>
                {p}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="card">
        <h3>Built and usable right now</h3>
        <div className="grid grid-3">
          {built.map((topic) => (
            <div key={topic.id}>
              <strong className="small">{topic.title}</strong>
              <p className="xs muted" style={{ margin: '2px 0 0' }}>
                {topic.summary}
              </p>
            </div>
          ))}
        </div>
      </section>

      <p className="small faint">
        Created / initiated by <strong>MD Salim Ansari</strong>. <Link to="/about">About this project</Link>.
      </p>
    </div>
  );
}
