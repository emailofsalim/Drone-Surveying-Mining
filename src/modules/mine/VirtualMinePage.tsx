/**
 * VIRTUAL MINE — Spec Phase 02, §4 (the mine), §5 (digital twin), §236 (metadata first).
 */

import { useState } from 'react';
import { MineTerrain } from './MineTerrain';
import { PlanView, ProfileView } from './PlanView';
import {
  featureCoordinate,
  featureRl,
  MINE_CRS,
  MINE_EXTENT,
  MINE_FEATURES,
  PIT,
  STOCKPILE,
  stockpileTruth,
  WASTE_DUMP,
  type MineFeature,
} from '../../data/mine';
import { coordinateMetadata } from '../../engine/geodesy/coordinate';
import {
  Callout,
  MetadataList,
  PageHeader,
  Readout,
  SimulatedBanner,
  SliderField,
} from '../../components/ui';

type ViewMode = '3d' | 'plan' | 'profile';

export function VirtualMinePage() {
  const [view, setView] = useState<ViewMode>('3d');
  const [selected, setSelected] = useState<MineFeature | null>(
    MINE_FEATURES.find((f) => f.id === 'SP-01') ?? null,
  );
  const [contourInterval, setContourInterval] = useState(10);
  const [sectionAzimuth, setSectionAzimuth] = useState(90);
  const [wireframe, setWireframe] = useState(false);
  const [spin, setSpin] = useState(false);
  const [segments, setSegments] = useState(180);

  // The section line runs through the pit centre at the chosen azimuth, so
  // every view shows the same cut.
  const half = 780;
  const rad = (sectionAzimuth * Math.PI) / 180;
  const sectionFrom = {
    e: PIT.centreE - Math.sin(rad) * half,
    n: PIT.centreN - Math.cos(rad) * half,
  };
  const sectionTo = {
    e: PIT.centreE + Math.sin(rad) * half,
    n: PIT.centreN + Math.cos(rad) * half,
  };

  const truth = stockpileTruth();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phase 02 — the virtual mine"
        title="One dataset, many views"
        lede="The 3D terrain, the plan view with contours and the section are all generated from the same elevation function. Nothing here is a separate illustration — which is what makes it possible to follow one feature through the whole workflow."
      />

      <SimulatedBanner />

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="segmented" role="group" aria-label="View mode">
          <button aria-pressed={view === '3d'} onClick={() => setView('3d')}>
            3D view
          </button>
          <button aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
            Plan view
          </button>
          <button aria-pressed={view === 'profile'} onClick={() => setView('profile')}>
            Section A–A′
          </button>
        </div>
        {view === '3d' ? (
          <div className="row">
            <button aria-pressed={wireframe} onClick={() => setWireframe(!wireframe)}>
              Wireframe
            </button>
            <button aria-pressed={spin} onClick={() => setSpin(!spin)}>
              Orbit
            </button>
          </div>
        ) : null}
      </div>

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">View controls</p>
            <SliderField
              label="Section azimuth"
              value={sectionAzimuth}
              onChange={setSectionAzimuth}
              min={0}
              max={180}
              step={5}
              format={(v) => `${v}° grid`}
            />
            {view === 'plan' ? (
              <SliderField
                label="Contour interval"
                value={contourInterval}
                onChange={setContourInterval}
                min={2}
                max={25}
                step={1}
                format={(v) => `${v} m`}
              />
            ) : null}
            {view === '3d' ? (
              <SliderField
                label="Mesh resolution"
                value={segments}
                onChange={setSegments}
                min={60}
                max={320}
                step={20}
                format={(v) => `${v}² cells`}
              />
            ) : null}
          </div>

          <div className="panel">
            <p className="panel-title">Site model</p>
            <dl className="kv small">
              <dt>Extent</dt>
              <dd>
                {MINE_EXTENT.eMax - MINE_EXTENT.eMin} × {MINE_EXTENT.nMax - MINE_EXTENT.nMin} m
              </dd>
              <dt>Pit crest RL</dt>
              <dd>{PIT.crestRl} m</dd>
              <dt>Pit floor RL</dt>
              <dd>{PIT.floorRl} m</dd>
              <dt>Bench height</dt>
              <dd>{PIT.benchHeight} m</dd>
              <dt>Bench width</dt>
              <dd>{PIT.benchWidth} m</dd>
              <dt>Face angle</dt>
              <dd>{PIT.faceAngleDeg}°</dd>
              <dt>Stockpile</dt>
              <dd>
                r {STOCKPILE.baseRadius} m, h {STOCKPILE.height} m
              </dd>
              <dt>Waste dump</dt>
              <dd>
                r {WASTE_DUMP.baseRadius} m, h {WASTE_DUMP.height} m
              </dd>
            </dl>
          </div>

          <div className="panel">
            <p className="panel-title">Legend</p>
            <ul className="xs" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {[
                ['#e2703a', 'GCP — constrains the adjustment'],
                ['#4ec9a5', 'Checkpoint — validates it'],
                ['#e6edf3', 'Survey monument / benchmark'],
                ['#62a8e5', 'Launch / recovery'],
                ['#e9b949', 'Powerline corridor'],
                ['#e5645f', 'HEMM / exclusion zone'],
                ['#b09a56', 'Stockpile / waste dump'],
              ].map(([color, label]) => (
                <li key={label} className="row" style={{ gap: 6, marginBottom: 3 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: color,
                      display: 'inline-block',
                    }}
                  />
                  <span className="muted">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="stack">
          <div
            className="card"
            style={{ padding: 0, overflow: 'hidden', minHeight: view === '3d' ? 520 : undefined }}
          >
            {view === '3d' ? (
              <div style={{ height: 520 }}>
                <MineTerrain
                  segments={segments}
                  wireframe={wireframe}
                  spin={spin}
                  sectionFrom={sectionFrom}
                  sectionTo={sectionTo}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
            ) : view === 'plan' ? (
              <PlanView
                contourInterval={contourInterval}
                sectionFrom={sectionFrom}
                sectionTo={sectionTo}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <ProfileView from={sectionFrom} to={sectionTo} />
            )}
          </div>

          {selected ? (
            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>{selected.name}</h3>
                <span className="badge">{selected.kind}</span>
              </div>
              <p className="panel-title" style={{ marginTop: 'var(--sp-3)' }}>
                Metadata first (§236)
              </p>
              <MetadataList rows={coordinateMetadata(featureCoordinate(selected))} />
              <div className="grid grid-3" style={{ marginTop: 'var(--sp-3)' }}>
                <Readout label="Easting" value={selected.e} unit="m (local grid)" />
                <Readout label="Northing" value={selected.n} unit="m (local grid)" />
                <Readout
                  label="RL"
                  value={featureRl(selected)}
                  unit="m"
                  hint={selected.rl ? 'stated value' : 'sampled from the surface model'}
                />
              </div>
              {selected.notes ? (
                <Callout tone="warn" title="Note">
                  {selected.notes}
                </Callout>
              ) : null}
            </div>
          ) : null}

          <div className="card">
            <h3>Follow one object (§5, §6)</h3>
            <p className="small muted">
              The stockpile SP-01 exists in this model as an analytic solid. Its true values are
              recorded here so that a volume the learner later measures from a point cloud can be
              compared against something (§220 truth dataset).
            </p>
            <div className="grid grid-3">
              <Readout label="Plan area" value={truth.planAreaM2 / 10000} unit="ha" />
              <Readout label="Volume above base RL" value={truth.volumeM3} unit="m³" />
              <Readout
                label="Mass"
                value={truth.tonnes}
                unit="t"
                hint={`at ${STOCKPILE.bulkDensityTm3} t/m³`}
              />
            </div>
            <Callout tone="info" title="What this number is, precisely.">
              The volume between the analytic pile surface and the horizontal plane at RL{' '}
              {STOCKPILE.baseRl} m, inside the {STOCKPILE.baseRadius} m base radius, computed by
              numerical integration. Surface, boundary, base and method — stated, because a volume
              without all four is not a result (golden principle 18).
            </Callout>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="panel-title">Project CRS declared for this dataset</p>
        <MetadataList
          rows={[
            { label: 'CRS', value: MINE_CRS.name },
            { label: 'Kind', value: MINE_CRS.kind },
            { label: 'Datum', value: MINE_CRS.datum },
            { label: 'Axis order', value: MINE_CRS.axisOrder },
            { label: 'Units', value: MINE_CRS.units },
            { label: 'Vertical', value: 'Local RL, benchmark BM-07 = 500.000 m (simulated)' },
          ]}
        />
        <p className="xs faint" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
          The site is fictitious. No real mine coordinates, flight logs, imagery or site layouts
          appear anywhere in this repository.
        </p>
      </div>
    </div>
  );
}
