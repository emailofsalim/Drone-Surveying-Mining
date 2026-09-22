/**
 * PROJECT IDENTITY AND LIMITATIONS — Spec §224 (credit), §225 (licence),
 * §228 (documentation of simulation limitations), §262.
 */

import { buildProgress } from '../../data/knowledge-graph';
import { Callout, PageHeader } from '../../components/ui';

const LIMITATIONS = [
  ['Aerodynamics and flight dynamics', 'Simplified training models. Not CFD, not a real autopilot, not a manufacturer-certified simulator.'],
  ['Geodesy', 'UTM is implemented from the standard series expansion for WGS 84/GRS 80. No datum transformations, no grid-shift files, no geoid model. Production work needs a proper transformation library and the applicable national parameters.'],
  ['Magnetic declination', 'Not modelled at all. The learner supplies a value; the application will not invent one.'],
  ['Photogrammetry', 'Not yet implemented. When it is, the algorithms and their limitations will be documented alongside it.'],
  ['Mine geometry', 'A fictitious parametric open pit. It is internally consistent but it is not a survey of anywhere.'],
  ['Every numeric value', 'Simulated training data. Nothing in this application is a real mine observation, flight log or deliverable.'],
];

export function AboutPage() {
  const progress = buildProgress();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="About"
        title="Drone Surveying in Mining — Interactive Training Simulator"
        lede="An open-source interactive educational platform for drone surveying in mining, created / initiated by MD Salim Ansari. MIT licensed."
      />

      <div className="card">
        <h3>What the build actually contains</h3>
        <p className="small muted">
          The master specification defines 45 build phases and explicitly requires them to be built
          incrementally, inspecting existing code before each phase. This build covers the
          foundation phases and a set of laboratories that establish the patterns the later phases
          reuse: {progress.built} topics built, {progress.partial} partial, {progress.planned}{' '}
          planned.
        </p>
        <ul className="small">
          <li>
            <strong>Phase 01</strong> — repository, design system, unit engine, formula engine,
            provenance/tagging engine, tests, CI.
          </li>
          <li>
            <strong>Phase 02</strong> — the virtual mine as a single dataset with 3D, plan and
            section views.
          </li>
          <li>
            <strong>Phase 03</strong> — the knowledge graph over the full specification chain.
          </li>
          <li>
            <strong>Phases 12–14</strong> — north references, CRS/projection, height and RL.
          </li>
          <li>
            <strong>Phases 18 &amp; 20</strong> — GSD, footprint, overlap and mission geometry.
          </li>
          <li>
            <strong>Phase 36</strong> — QA/QC, checkpoint RMSE and the error budget.
          </li>
        </ul>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Everything else is mapped in the knowledge graph and marked planned. Overstating the build
          state would be its own kind of undocumented number.
        </p>
      </div>

      <div className="card">
        <h3>Documented simulation limitations (§228)</h3>
        <table className="data">
          <tbody>
            {LIMITATIONS.map(([area, text]) => (
              <tr key={area}>
                <td style={{ width: '28%' }}>
                  <strong className="small">{area}</strong>
                </td>
                <td className="small muted">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout tone="warn" title="Simulation is not certification.">
        This is an educational simulator. It is not an aircraft certification system, not a legal
        compliance guarantee, not a manufacturer-certified simulator, and not a substitute for
        applicable laws, manufacturer instructions, mine SOPs or competent professional supervision.
        Software is a tool; engineering judgement remains essential.
      </Callout>

      <div className="card">
        <h3>Credit and licence</h3>
        <p className="small">
          Created / initiated by <strong>MD Salim Ansari</strong>.
        </p>
        <p className="small muted">
          Released under the MIT Licence. Third-party projects referenced in{' '}
          <code>docs/REFERENCE_REPOSITORIES.md</code> remain under their own licences; their
          architecture and public documentation were studied as references, and this project is
          implemented independently.
        </p>
      </div>
    </div>
  );
}
