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
    to: '/procurement',
    title: 'Procurement & inspection',
    body: 'Start from the survey problem, not the catalogue. Technical evaluation, acceptance, and an incoming inspection with a hidden fault.',
    tag: 'Phases 04–05',
  },
  {
    to: '/aircraft',
    title: 'Aircraft & flight control',
    body: 'Hover margin, thrust vectors, wind penalty, centre of gravity, PID response, motor mixing and what a chipped blade does to your imagery.',
    tag: 'Phases 06–09',
  },
  {
    to: '/sensors',
    title: 'IMU & compass lab',
    body: 'Inertial drift on a log scale, sensor fusion, hard- and soft-iron calibration, and the cube law of local magnetic disturbance.',
    tag: 'Phases 10–11',
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
    to: '/gnss',
    title: 'GNSS, RTK & PPK',
    body: 'Sky plot and DOP inside a pit, positioning modes, baseline and correction age, and the base-coordinate blunder nothing detects.',
    tag: 'Phases 15–16',
  },
  {
    to: '/gsd',
    title: 'GSD & imaging geometry',
    body: 'Ground sampling distance, footprint, overlap and image count — and what a pit does to a plan flown at constant height.',
    tag: 'Phases 17–18',
  },
  {
    to: '/mission',
    title: 'Mission, pre-flight & flight',
    body: 'Plan a block over the pit, inject pre-flight faults, fly it, handle incidents, and preserve the raw data afterwards.',
    tag: 'Phases 20–23',
  },
  {
    to: '/photogrammetry',
    title: 'Photogrammetry lab',
    body: 'Keypoints, tie points, triangulation geometry and a real bundle adjustment — scored against independent checkpoints.',
    tag: 'Phases 24–27',
  },
  {
    to: '/products',
    title: 'Cloud, surfaces & volume',
    body: 'Classify a point cloud, build a DSM and a DTM, contour them, and measure a volume with its methodology attached.',
    tag: 'Phases 28–35',
  },
  {
    to: '/payloads',
    title: 'LiDAR, thermal & multispectral',
    body: 'Swath and density geometry, why attitude error is multiplied by range, boresight strip separation, emissivity and NDVI.',
    tag: 'Phases 19, 31–32',
  },
  {
    to: '/data',
    title: 'Formats, GIS & CAD',
    body: 'What each format loses, which ones carry a CRS, a layer stack that catches a mismatched frame, and real CSV/DXF/GeoJSON exports.',
    tag: 'Phases 33–34',
  },
  {
    to: '/qaqc',
    title: 'QA/QC lab',
    body: 'GCP residuals versus independent checkpoint RMSE, systematic shifts, and the error budget behind a decision.',
    tag: 'Phase 36',
  },
  {
    to: '/report',
    title: 'Report & decision gate',
    body: 'Inject failures and watch the verdict move between issue, reprocess, resurvey and reject — with every finding citing its basis.',
    tag: 'Phases 38–41',
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
