/**
 * SAFETY FRAMEWORK AND SOP LIBRARY — from `02_SAFETY_FRAMEWORK.md` and
 * `03_SOP_TEMPLATE_INDEX.md`; Spec §196, §197, §229, §230.
 */

import { SOPS, SOP_SECTIONS, SAFETY_PRIORITIES } from '../../data/sops';
import { MINE_FEATURES } from '../../data/mine';
import { Callout, PageHeader } from '../../components/ui';

const HAZARD_KINDS = new Set(['powerline', 'hemm', 'exclusion', 'water', 'crusher']);

export function SafetyPage() {
  const groups = [...new Set(SOPS.map((s) => s.group))];
  const hazards = MINE_FEATURES.filter((f) => HAZARD_KINDS.has(f.kind));

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Safety framework"
        title="Protect people first. Everything else is second."
        lede="This project contains educational safety simulations and generic SOP templates. They are not a substitute for applicable law, mine or site SOPs, manufacturer instructions, aircraft qualification, competent supervision, or current regulatory requirements."
      />

      <Callout tone="danger" title="Read this before using anything on this page.">
        Exact operating limits, emergency actions, battery handling, return-to-home behaviour,
        flight permissions, airspace rules, PPE, blast controls and separation requirements must be
        taken from the current applicable sources for your aircraft, your site and your
        jurisdiction. Nothing in this application establishes any of them.
      </Callout>

      <div className="split">
        <div className="card">
          <h3>Safety priorities</h3>
          <ol className="small" style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {SAFETY_PRIORITIES.map((p) => (
              <li key={p} style={{ marginBottom: 4 }}>
                {p}
              </li>
            ))}
          </ol>
        </div>

        <div className="card">
          <h3>Public repository rule</h3>
          <p className="small muted">
            Do not commit real mine coordinates, operational flight logs, private imagery,
            credentials, API keys, security layouts, confidential documents or restricted datasets
            to this repository. The site modelled in this application is fictitious, and every value
            it contains is simulated.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Hazards present in the simulated site</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Kind</th>
              <th>Why it matters</th>
            </tr>
          </thead>
          <tbody>
            {hazards.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td>
                  <span className="badge danger">{h.kind}</span>
                </td>
                <td className="small muted">{h.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>SOP template library</h3>
        <p className="small muted">
          Thirty-four configurable educational templates. Each is a structure to be completed
          against your own site's requirements — never a procedure to be followed as written.
        </p>
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: 'var(--sp-4)' }}>
            <p className="panel-title">{group}</p>
            <div className="grid grid-3">
              {SOPS.filter((s) => s.group === group).map((sop) => (
                <div key={sop.id} className="panel">
                  <strong className="small mono">{sop.id}</strong>
                  <div className="small">{sop.title}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Required structure of every SOP</h3>
        <div className="row">
          {SOP_SECTIONS.map((section) => (
            <span key={section} className="badge">
              {section}
            </span>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
          A template missing its <strong>Stop Conditions</strong> or <strong>Emergency Actions</strong>{' '}
          is incomplete. Those two sections are what make the difference between a procedure and a
          description.
        </p>
      </div>
    </div>
  );
}
