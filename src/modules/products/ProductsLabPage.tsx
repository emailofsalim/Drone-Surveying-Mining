/**
 * POINT CLOUD, SURFACE AND VOLUME LAB — Spec §127–§148, Phases 28–30, 35.
 */

import { useMemo, useState } from 'react';
import {
  assessDensity,
  circularBoundary,
  classifyGround,
  generateCloud,
  removeOutliers,
} from '../../engine/pointcloud/cloud';
import {
  computeVolume,
  contourSurface,
  differenceSurfaces,
  gridFromCloud,
  reconcile,
  surfaceProfile,
  surfaceStats,
  type BaseSurface,
} from '../../engine/terrain/surfaces';
import { STOCKPILE, stockpileTruth } from '../../data/mine';
import { LineChart } from '../../components/LineChart';
import {
  Callout,
  PageHeader,
  Readout,
  SelectField,
  SimulatedBanner,
  SliderField,
} from '../../components/ui';

const BOUNDS = {
  eMin: STOCKPILE.centreE - 130,
  eMax: STOCKPILE.centreE + 130,
  nMin: STOCKPILE.centreN - 130,
  nMax: STOCKPILE.centreN + 130,
};

type BaseChoice = 'plane' | 'best-fit-plane' | 'lowest-perimeter';

export function ProductsLabPage() {
  const [density, setDensity] = useState(4);
  const [vegetation, setVegetation] = useState(0.35);
  const [vegHeight, setVegHeight] = useState(3);
  const [outliers, setOutliers] = useState(0.02);
  const [cleaned, setCleaned] = useState(true);
  const [classify, setClassify] = useState(true);
  const [threshold, setThreshold] = useState(0.6);
  const [cellSize, setCellSize] = useState(3);
  const [contourInterval, setContourInterval] = useState(2);
  const [baseChoice, setBaseChoice] = useState<BaseChoice>('plane');
  const [densityTm3, setDensityTm3] = useState(1.62);
  const [densitySigma, setDensitySigma] = useState(0.08);

  const rawCloud = useMemo(
    () =>
      generateCloud({
        bounds: BOUNDS,
        densityPerM2: density,
        noiseM: 0.02,
        vegetationCover: vegetation,
        vegetationHeightM: vegHeight,
        outlierRate: outliers,
        seed: 31,
      }),
    [density, vegetation, vegHeight, outliers],
  );

  const workingCloud = useMemo(
    () => (cleaned ? removeOutliers(rawCloud, 2.5, 10) : rawCloud),
    [rawCloud, cleaned],
  );

  const classification = useMemo(
    () => classifyGround(workingCloud, { cellSizeM: 5, thresholdM: threshold, slopeTolerance: 0.6 }),
    [workingCloud, threshold],
  );

  const cloudForSurface = classify ? classification.cloud : workingCloud;

  const dsm = useMemo(
    () =>
      gridFromCloud(cloudForSurface, {
        kind: 'DSM',
        cellSizeM: cellSize,
        bounds: BOUNDS,
        aggregate: 'mean',
        searchRadiusCells: 3,
      }),
    [cloudForSurface, cellSize],
  );

  const dtm = useMemo(
    () =>
      gridFromCloud(cloudForSurface, {
        kind: 'DTM',
        cellSizeM: cellSize,
        bounds: BOUNDS,
        aggregate: 'min',
        searchRadiusCells: 3,
        classes: ['ground'],
      }),
    [cloudForSurface, cellSize],
  );

  const dsmStats = surfaceStats(dsm);
  const dtmStats = surfaceStats(dtm);

  const boundary = useMemo(
    () => circularBoundary(STOCKPILE.centreE, STOCKPILE.centreN, STOCKPILE.baseRadius),
    [],
  );

  const base: BaseSurface =
    baseChoice === 'plane'
      ? { type: 'plane', rl: STOCKPILE.baseRl }
      : baseChoice === 'best-fit-plane'
        ? { type: 'best-fit-plane' }
        : { type: 'lowest-perimeter' };

  const surfaceForVolume = classify ? dtm : dsm;
  const volume = useMemo(
    () => computeVolume({ surface: surfaceForVolume, boundary, base, method: 'grid-prism' }),
    [surfaceForVolume, boundary, base],
  );

  const truth = stockpileTruth();
  const volumeErrorPct = truth.volumeM3 !== 0 ? ((volume.volumeM3 - truth.volumeM3) / truth.volumeM3) * 100 : NaN;

  const difference = useMemo(() => {
    try {
      return differenceSurfaces(dsm, dtm, 0.05);
    } catch {
      return null;
    }
  }, [dsm, dtm]);

  const densityAssessment = assessDensity(density, 0.02, cellSize);

  const profile = useMemo(
    () =>
      surfaceProfile(
        surfaceForVolume,
        { e: BOUNDS.eMin + 5, n: STOCKPILE.centreN },
        { e: BOUNDS.eMax - 5, n: STOCKPILE.centreN },
        160,
      ),
    [surfaceForVolume],
  );

  const contours = useMemo(() => {
    const stats = surfaceStats(surfaceForVolume);
    const out: Array<{ level: number; segments: ReturnType<typeof contourSurface> }> = [];
    const start = Math.ceil(stats.min / contourInterval) * contourInterval;
    for (let level = start; level <= stats.max; level += contourInterval) {
      out.push({ level, segments: contourSurface(surfaceForVolume, level) });
    }
    return out;
  }, [surfaceForVolume, contourInterval]);

  const reconciliation = useMemo(
    () =>
      reconcile({
        surveyVolumeM3: volume.volumeM3,
        volumeSigmaM3: Math.abs(volume.volumeM3) * 0.03,
        bulkDensityTm3: densityTm3,
        densitySigmaTm3: densitySigma,
      }),
    [volume.volumeM3, densityTm3, densitySigma],
  );

  // Contour rendering geometry.
  const mapSize = 460;
  const mapScale = mapSize / (BOUNDS.eMax - BOUNDS.eMin);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 28–30 & 35 — cloud, surfaces, volume"
        title="A point cloud is not terrain, and a volume is not a number"
        lede="What the sensor returns is the surface it could see. Ground comes from classification. And a volume only means something when the surface, the boundary, the base and the method are all stated with it."
      />

      <SimulatedBanner />

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Acquisition</p>
            <SliderField label="Point density" value={density} onChange={setDensity} min={0.5} max={20} step={0.5} format={(v) => `${v} pts/m²`} />
            <SliderField label="Vegetation cover" value={vegetation} onChange={setVegetation} min={0} max={0.7} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} />
            <SliderField label="Vegetation height" value={vegHeight} onChange={setVegHeight} min={0.5} max={8} step={0.5} format={(v) => `${v.toFixed(1)} m`} />
            <SliderField label="Gross outlier rate" value={outliers} onChange={setOutliers} min={0} max={0.1} step={0.005} format={(v) => `${(v * 100).toFixed(1)}%`} />
          </div>

          <div className="panel">
            <p className="panel-title">Processing</p>
            <button aria-pressed={cleaned} onClick={() => setCleaned(!cleaned)} style={{ width: '100%', marginBottom: 'var(--sp-2)' }}>
              Outlier removal: {cleaned ? 'ON' : 'OFF'}
            </button>
            <button aria-pressed={classify} onClick={() => setClassify(!classify)} style={{ width: '100%', marginBottom: 'var(--sp-3)' }}>
              Ground classification: {classify ? 'ON' : 'OFF'}
            </button>
            <SliderField label="Classification threshold" value={threshold} onChange={setThreshold} min={0.1} max={6} step={0.1} format={(v) => `${v.toFixed(1)} m`} />
            <SliderField label="Surface cell size" value={cellSize} onChange={setCellSize} min={1} max={12} step={1} format={(v) => `${v} m`} />
            <SliderField label="Contour interval" value={contourInterval} onChange={setContourInterval} min={0.5} max={10} step={0.5} format={(v) => `${v} m`} />
          </div>

          <div className="panel">
            <p className="panel-title">Volume basis</p>
            <SelectField
              label="Base surface"
              value={baseChoice}
              options={[
                { value: 'plane', label: `Horizontal plane at RL ${STOCKPILE.baseRl.toFixed(1)}` },
                { value: 'best-fit-plane', label: 'Plane fitted to the perimeter' },
                { value: 'lowest-perimeter', label: 'Lowest perimeter elevation' },
              ]}
              onChange={(v) => setBaseChoice(v as BaseChoice)}
            />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Cloud and classification</h3>
            <div className="grid grid-3">
              <Readout label="Points captured" value={rawCloud.points.length} unit="points" />
              <Readout label="After outlier removal" value={workingCloud.points.length} unit="points" />
              <Readout label="Mean spacing" value={workingCloud.meanSpacingM} unit="m" />
              <Readout label="Classified ground" value={classification.groundCount} unit="points" />
              <Readout label="Classified cover" value={classification.coverCount} unit="points" />
              <Readout label="Ground recall" value={classification.recall * 100} unit="%" />
            </div>
            <div className="grid grid-2" style={{ marginTop: 'var(--sp-3)' }}>
              <Readout label="Terrain wrongly rejected" value={classification.falseNegatives} unit="points" hint="ground thrown away" />
              <Readout label="Cover wrongly kept" value={classification.falsePositives} unit="points" hint="contamination left in" />
            </div>
            <Callout tone={classification.falsePositives > classification.groundCount * 0.05 ? 'danger' : 'ok'}>
              {classification.falsePositives > classification.groundCount * 0.05
                ? 'A permissive threshold leaves vegetation in the "ground" class. Every one of those points raises the surface, and the volume computed from it measures plants as material (§137, §240).'
                : 'The threshold is separating ground from cover cleanly here. Raise it and watch contamination return; drop it on a steep bench and watch genuine terrain be discarded instead.'}
            </Callout>
          </div>

          <div className="card">
            <h3>Density: resolution, not accuracy</h3>
            <div className="grid grid-3">
              <Readout label="Mean spacing" value={densityAssessment.meanSpacingM} unit="m" />
              <Readout label="Smallest resolvable feature" value={densityAssessment.resolvableFeatureM} unit="m" />
              <Readout label="Surface σ from averaging" value={densityAssessment.surfaceSigmaM * 1000} unit="mm" />
            </div>
            <Callout tone="info" title="Golden principle 14.">
              {densityAssessment.note}
            </Callout>
          </div>

          <div className="card">
            <h3>DSM against DTM</h3>
            <div className="grid grid-3">
              <Readout label="DSM mean RL" value={dsmStats.mean} unit="m" />
              <Readout label="DTM mean RL" value={dtmStats.mean} unit="m" />
              <Readout label="Mean separation" value={dsmStats.mean - dtmStats.mean} unit="m" />
              <Readout label="DSM no-data cells" value={dsmStats.noDataCells} unit="cells" />
              <Readout label="DTM no-data cells" value={dtmStats.noDataCells} unit="cells" />
              <Readout label="Interpolated cells" value={dtmStats.interpolatedCells} unit="cells" />
            </div>
            {difference ? (
              <>
                <div className="grid grid-3" style={{ marginTop: 'var(--sp-3)' }}>
                  <Readout label="Volume between the two surfaces" value={difference.fillVolumeM3} unit="m³" />
                  <Readout label="Area where they differ" value={difference.fillAreaM2 / 10000} unit="ha" />
                  <Readout label="Cells not comparable" value={difference.unusableCells} unit="cells" />
                </div>
                <Callout tone="warn" title="That volume is the cover, not material.">
                  The difference between a DSM and a DTM over the same ground is everything standing
                  on it. Reporting a DSM volume as a stockpile volume adds exactly this figure to
                  the answer.
                </Callout>
              </>
            ) : null}
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Surface method: {surfaceForVolume.method}. No-data cells are left as gaps rather than
              flattened, because a gap in the evidence is not a flat area.
            </p>
          </div>

          <div className="card">
            <h3>Contours and section</h3>
            <div className="grid grid-2">
              <svg
                viewBox={`0 0 ${mapSize} ${mapSize}`}
                style={{ width: '100%', height: 'auto', background: 'var(--c-surface-2)', borderRadius: 8 }}
                role="img"
                aria-label="Contour map of the stockpile surface"
              >
                {contours.map((c, ci) => (
                  <g
                    key={c.level}
                    stroke={ci % 5 === 0 ? 'var(--c-accent)' : 'var(--c-border-strong)'}
                    strokeWidth={ci % 5 === 0 ? 1.2 : 0.6}
                  >
                    {c.segments.map((s, i) => (
                      <line
                        key={i}
                        x1={(s.e1 - BOUNDS.eMin) * mapScale}
                        y1={mapSize - (s.n1 - BOUNDS.nMin) * mapScale}
                        x2={(s.e2 - BOUNDS.eMin) * mapScale}
                        y2={mapSize - (s.n2 - BOUNDS.nMin) * mapScale}
                      />
                    ))}
                  </g>
                ))}
                {/* Volume boundary. */}
                <polygon
                  points={boundary
                    .map((v) => `${((v.e - BOUNDS.eMin) * mapScale).toFixed(1)},${(mapSize - (v.n - BOUNDS.nMin) * mapScale).toFixed(1)}`)
                    .join(' ')}
                  fill="none"
                  stroke="var(--c-ok)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                <text x={10} y={mapSize - 10} fontSize={10} fill="var(--c-text-faint)">
                  {contourInterval} m interval · green = volume boundary · SIMULATED
                </text>
              </svg>

              <LineChart
                series={[
                  { label: `${surfaceForVolume.kind} along the section`, color: 'var(--c-accent)', points: profile.map((p) => ({ x: p.chainage, y: p.rl })) },
                  { label: 'Volume base', color: 'var(--c-ok)', points: profile.map((p) => ({ x: p.chainage, y: STOCKPILE.baseRl })), dashed: true },
                ]}
                xLabel="Chainage (m)"
                yLabel="RL (m)"
                height={280}
              />
            </div>
          </div>

          <div className="card">
            <h3>Volume — with its methodology, always</h3>
            <div className="grid grid-3">
              <Readout label="Volume" value={volume.volumeM3} unit="m³" />
              <Readout label="Analytic truth" value={truth.volumeM3} unit="m³" hint="known, because the site is synthetic" />
              <Readout label="Difference from truth" value={volumeErrorPct} unit="%" />
              <Readout label="Plan area" value={volume.planAreaM2 / 10000} unit="ha" />
              <Readout label="Mean height above base" value={volume.meanHeightM} unit="m" />
              <Readout label="Coverage gap" value={volume.missingAreaM2} unit="m²" />
            </div>

            <table className="data" style={{ marginTop: 'var(--sp-3)' }}>
              <tbody>
                <tr><td>Surface</td><td className="num">{volume.methodology.surfaceKind}</td></tr>
                <tr><td>Surface method</td><td className="small muted">{volume.methodology.surfaceMethod}</td></tr>
                <tr><td>Boundary</td><td className="num">{volume.methodology.boundaryVertices}-vertex polygon</td></tr>
                <tr><td>Base</td><td className="num">{volume.methodology.base}</td></tr>
                <tr><td>Method</td><td className="num">{volume.methodology.method}</td></tr>
                <tr><td>Cell size</td><td className="num">{volume.methodology.cellSizeM} m</td></tr>
                <tr><td>Units</td><td className="num">{volume.methodology.units}</td></tr>
              </tbody>
            </table>

            {volume.warnings.map((w) => (
              <Callout key={w} tone="warn">{w}</Callout>
            ))}

            <Callout tone="info" title="Change one input and the answer changes.">
              Switch the base surface, turn classification off, or coarsen the cell size, and the
              volume moves — while remaining, in every case, a perfectly plausible number. That is
              why golden principle 18 requires all four to be reported together.
            </Callout>
          </div>

          <div className="card">
            <h3>Reconciliation — volume is not tonnage</h3>
            <div className="row">
              <div style={{ flex: 1, minWidth: 220 }}>
                <SliderField label="Bulk density" value={densityTm3} onChange={setDensityTm3} min={1} max={2.6} step={0.01} format={(v) => `${v.toFixed(2)} t/m³`} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <SliderField label="Density uncertainty" value={densitySigma} onChange={setDensitySigma} min={0} max={0.3} step={0.01} format={(v) => `±${v.toFixed(2)} t/m³`} />
              </div>
            </div>
            <div className="grid grid-3">
              <Readout label="Tonnage" value={reconciliation.tonnes} unit="t" />
              <Readout label="Tonnage 1σ" value={reconciliation.tonnesSigma} unit="t" />
              <Readout label="Density share of uncertainty" value={reconciliation.densityContribution * 100} unit="%" />
            </div>
            {reconciliation.notes.map((note) => (
              <Callout key={note} tone="info">{note}</Callout>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
