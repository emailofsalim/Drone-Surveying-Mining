/**
 * PHOTOGRAMMETRY LAB — Spec §115–§127, Phases 24–27.
 */

import { useMemo, useState } from 'react';
import {
  analyseNetwork,
  backProject,
  bundleAdjust,
  detectorYield,
  matchKeypoints,
  project,
  reprojectionResiduals,
  rmsReprojectionPx,
  triangulate,
  type Keypoint,
} from '../../engine/photogrammetry/photogrammetry';
import { buildBlock, nadirPose, scoreBlock } from '../../engine/photogrammetry/block';
import { flyMission, type MissionPlan } from '../../engine/flight/mission';
import { cameraById } from '../../data/cameras';
import { featureRl, MINE_FEATURES, PIT } from '../../data/mine';
import { v3 } from '../../engine/sensors/imu';
import { formatNumber } from '../../engine/units/units';
import { LineChart, ScatterPlot } from '../../components/LineChart';
import {
  Callout,
  PageHeader,
  Readout,
  SimulatedBanner,
  SliderField,
} from '../../components/ui';

const PIPELINE = [
  'Images', 'Quality', 'Keypoints', 'Descriptors', 'Matches', 'Tie points',
  'Camera poses', 'Triangulation', 'Bundle adjustment', 'GCP', 'Optimisation',
  'Check points', 'Dense cloud', 'Classification', 'DSM', 'DTM',
  'Orthomosaic', 'Mesh', 'Contours', 'Export',
];

const camera = cameraById('cam-1inch-20mp');

export function PhotogrammetryLabPage() {
  const [texture, setTexture] = useState(0.85);
  const [blurPx, setBlurPx] = useState(0.4);
  const [glare, setGlare] = useState(0);
  const [baselineM, setBaselineM] = useState(40);
  const [imageNoise, setImageNoise] = useState(0.4);
  const [controlWeight, setControlWeight] = useState(40);

  /* ------------------ detector and matching ------------------ */

  const quality = { texture, blurPx, glare };
  const yieldFraction = detectorYield(quality);

  const keypoints = useMemo<Keypoint[]>(() => {
    const out: Keypoint[] = [];
    const featureCount = Math.max(0, Math.round(120 * yieldFraction));
    for (let p = 0; p < featureCount; p++) {
      for (const poseId of ['A', 'B', 'C']) {
        out.push({ poseId, x: p, y: p, strength: yieldFraction, truePointId: `P${p}` });
      }
    }
    return out;
  }, [yieldFraction]);

  const matches = useMemo(() => matchKeypoints(keypoints, quality, 7), [keypoints, quality]);

  /* ---------------------- triangulation ---------------------- */

  const triangulation = useMemo(() => {
    const truth = v3(0, 0, 500);
    const half = baselineM / 2;
    const poses = [
      nadirPose('L', v3(-half, 0, 620), 0),
      nadirPose('R', v3(half, 0, 620), 0),
    ];
    const intrinsicsLocal = {
      focalPx: (camera.focalLengthMm * camera.imageWidthPx) / camera.sensorWidthMm,
      cx: camera.imageWidthPx / 2,
      cy: camera.imageHeightPx / 2,
      widthPx: camera.imageWidthPx,
      heightPx: camera.imageHeightPx,
    };

    const rays = poses.map((pose, i) => {
      const img = project(truth, pose, intrinsicsLocal);
      if (!img) return null;
      // A one-pixel measurement error on each ray.
      const sign = i === 0 ? 1 : -1;
      return backProject(img.x + sign * imageNoise, img.y, pose, intrinsicsLocal);
    });

    if (rays.some((r) => r === null)) return null;
    const result = triangulate(rays as NonNullable<(typeof rays)[number]>[]);
    if (!result) return null;

    return {
      result,
      truth,
      errorM: Math.hypot(
        result.position.x - truth.x,
        result.position.y - truth.y,
        result.position.z - truth.z,
      ),
      baseHeightRatio: baselineM / 120,
    };
  }, [baselineM, imageNoise]);

  /* ------------------- block and adjustment ------------------ */

  const block = useMemo(() => {
    const plan: MissionPlan = {
      aoi: { eMin: PIT.centreE - 130, eMax: PIT.centreE + 130, nMin: PIT.centreN - 130, nMax: PIT.centreN + 130 },
      camera,
      heightAboveTakeoffM: 160,
      takeoffRl: 513,
      forwardOverlap: 0.8,
      sideOverlap: 0.7,
      airspeedMs: 7,
      lineAzimuthDeg: 0,
      terrainFollowing: true,
      windFromDeg: 0,
      windSpeedMs: 0,
      turnAllowanceS: 8,
    };
    const flight = flyMission(plan);
    return buildBlock(flight.images.slice(0, 14), {
      camera,
      pointCount: 45,
      imageNoisePx: imageNoise,
      poseNoiseM: 0.8,
      pointNoiseM: 1.8,
      controlPoints: MINE_FEATURES.filter((f) => f.kind === 'gcp').map((f) => ({ id: f.id, e: f.e, n: f.n, rl: featureRl(f) })),
      checkPoints: MINE_FEATURES.filter((f) => f.kind === 'checkpoint').map((f) => ({ id: f.id, e: f.e, n: f.n, rl: featureRl(f) })),
      seed: 21,
    });
  }, [imageNoise]);

  const adjustment = useMemo(
    () =>
      bundleAdjust(block.initialPoses, block.initialPoints, block.observations, block.controlTruth, {
        intrinsics: block.intrinsics,
        controlWeight,
        iterations: 14,
        damping: 1e-6,
        fixPoses: true,
      }),
    [block, controlWeight],
  );

  const before = useMemo(() => scoreBlock(block.initialPoints, block.truthPoints), [block]);
  const after = useMemo(() => scoreBlock(adjustment.points, block.truthPoints), [adjustment, block]);

  const residuals = useMemo(
    () => reprojectionResiduals(block.observations, adjustment.poses, adjustment.points, block.intrinsics),
    [block, adjustment],
  );

  const network = useMemo(() => analyseNetwork(block.observations, 8), [block]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 24–27 — photogrammetry"
        title="A keypoint is not a tie point, and a tie point is not a GCP"
        lede="Photogrammetry reconstructs geometry from correspondences. Every stage can succeed while the next one fails, which is why the pipeline has to be inspected stage by stage rather than judged by whether it produced an output."
      />

      <SimulatedBanner kind="model" />

      <div className="card">
        <p className="panel-title">Pipeline (§115)</p>
        <div className="row">
          {PIPELINE.map((stage, i) => (
            <span key={stage} className="row" style={{ gap: 4 }}>
              <span className={`badge ${i < 12 ? 'info' : ''}`}>{stage}</span>
              {i < PIPELINE.length - 1 ? <span className="faint xs">→</span> : null}
            </span>
          ))}
        </div>
        <p className="xs faint" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
          Highlighted stages are implemented numerically in this build. The remainder are covered
          in the products lab and the knowledge graph.
        </p>
      </div>

      {/* ------------------- detector and matching ------------------ */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">Image quality</p>
          <SliderField label="Texture" value={texture} onChange={setTexture} min={0} max={1} step={0.01} format={(v) => `${(v * 100).toFixed(0)}%`} />
          <SliderField label="Motion blur" value={blurPx} onChange={setBlurPx} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)} px`} />
          <SliderField label="Glare" value={glare} onChange={setGlare} min={0} max={1} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} />
          <p className="xs faint" style={{ marginBottom: 0 }}>
            Low texture is a pit floor freshly graded, open water, or a uniform muck pile. Glare is
            a wet surface or a low sun. Blur comes from speed, exposure and vibration.
          </p>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Keypoints, matches and tie points</h3>
            <div className="grid grid-3">
              <Readout label="Detector yield" value={yieldFraction * 100} unit="%" />
              <Readout label="Keypoints detected" value={matches.keypointCount} unit="points" />
              <Readout label="Tie points formed" value={matches.tiePointCount} unit="points" />
              <Readout label="Matches" value={matches.matchCount} unit="matches" />
              <Readout label="Wrong matches" value={matches.wrongMatchCount} unit="matches" />
              <Readout label="Blunder rate" value={matches.outlierRate * 100} unit="%" />
            </div>
            <Callout tone={yieldFraction < 0.3 ? 'danger' : matches.outlierRate > 0.1 ? 'warn' : 'ok'}>
              {yieldFraction < 0.3
                ? 'Detector yield has collapsed. There are not enough distinctive features to match, so the reconstruction will fail outright or — worse — succeed locally and invent geometry where it had nothing to work from (§241).'
                : matches.outlierRate > 0.1
                  ? `${formatNumber(matches.outlierRate * 100, 0)}% of matches are wrong. Each wrong match is a false constraint pulling the solution toward a point that does not exist (§120).`
                  : 'Good texture and sharp images give distinctive descriptors, so matches are reliable and tie points are trustworthy.'}
            </Callout>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              A keypoint is a feature DETECTED in one image. A tie point is a correspondence MATCHED
              across two or more. The counts differ because most detections never find a partner
              (§116, §119, golden principle 11).
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------ triangulation --------------------- */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">Stereo geometry</p>
          <SliderField label="Baseline between stations" value={baselineM} onChange={setBaselineM} min={2} max={90} step={1} format={(v) => `${v} m`} />
          <SliderField label="Image measurement error" value={imageNoise} onChange={setImageNoise} min={0} max={4} step={0.1} format={(v) => `${v.toFixed(1)} px`} />
          <p className="xs faint" style={{ marginBottom: 0 }}>
            Flying height is held at 120 m above the point. The base-to-height ratio is what decides
            how sharply two rays intersect.
          </p>
        </div>

        <div className="card">
          <h3>Triangulation — two rays that never quite meet</h3>
          {triangulation ? (
            <>
              <div className="grid grid-3">
                <Readout label="Base-to-height ratio" value={triangulation.baseHeightRatio} unit="—" />
                <Readout label="Ray miss distance" value={triangulation.result.rmsResidualM} unit="m" />
                <Readout label="Error in the 3D point" value={triangulation.errorM} unit="m" />
              </div>
              <LineChart
                series={[
                  {
                    label: 'Point error against baseline (1 px measurement error)',
                    color: 'var(--c-accent)',
                    points: Array.from({ length: 45 }, (_, i) => {
                      const b = 2 + i * 2;
                      const half = b / 2;
                      const intrinsicsLocal = {
                        focalPx: (camera.focalLengthMm * camera.imageWidthPx) / camera.sensorWidthMm,
                        cx: camera.imageWidthPx / 2,
                        cy: camera.imageHeightPx / 2,
                        widthPx: camera.imageWidthPx,
                        heightPx: camera.imageHeightPx,
                      };
                      const truth = v3(0, 0, 500);
                      const poses = [nadirPose('L', v3(-half, 0, 620), 0), nadirPose('R', v3(half, 0, 620), 0)];
                      const rays = poses.map((pose, k) => {
                        const img = project(truth, pose, intrinsicsLocal);
                        if (!img) return null;
                        return backProject(img.x + (k === 0 ? 1 : -1), img.y, pose, intrinsicsLocal);
                      });
                      if (rays.some((r) => r === null)) return { x: b, y: NaN };
                      const res = triangulate(rays as NonNullable<(typeof rays)[number]>[]);
                      if (!res) return { x: b, y: NaN };
                      return {
                        x: b,
                        y: Math.hypot(res.position.x - truth.x, res.position.y - truth.y, res.position.z - truth.z),
                      };
                    }),
                  },
                ]}
                xLabel="Baseline between camera stations (m)"
                yLabel="Resulting 3D point error (m)"
                height={220}
                logY
              />
              <Callout tone={triangulation.result.wellConditioned ? 'info' : 'danger'}>
                {triangulation.result.wellConditioned
                  ? 'A wide baseline makes the rays cross at a sharp angle, so the same image-measurement error produces a small depth error. This is why overlap alone is not enough — the geometry has to be strong too.'
                  : 'The stations are nearly on top of each other. The rays are almost parallel, the intersection is ill-conditioned, and a one-pixel measurement error becomes a large depth error. High overlap with a tiny baseline is weak geometry, not strong redundancy.'}
              </Callout>
            </>
          ) : (
            <p className="muted">The point falls outside the frame at this baseline.</p>
          )}
        </div>
      </div>

      {/* ------------------- bundle adjustment ---------------------- */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">Adjustment</p>
          <SliderField label="Control weight" value={controlWeight} onChange={setControlWeight} min={1} max={200} step={1} format={(v) => `${v} px/m`} />
          <dl className="kv small">
            <dt>Images</dt>
            <dd>{block.truthPoses.size}</dd>
            <dt>Observations</dt>
            <dd>{block.observations.length}</dd>
            <dt>Mean rays per point</dt>
            <dd>{formatNumber(block.meanRaysPerPoint, 2)}</dd>
            <dt>Single-ray points</dt>
            <dd>{block.orphanPoints}</dd>
          </dl>
          <p className="xs faint" style={{ marginBottom: 0 }}>
            Control weight sets how firmly the surveyed GCP coordinates constrain the block against
            the image observations. Too loose and the block floats; too tight and the control
            distorts the geometry to absorb its own errors.
          </p>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Bundle adjustment</h3>
            <LineChart
              series={[
                {
                  label: 'RMS reprojection error per iteration',
                  color: 'var(--c-accent)',
                  points: adjustment.history.map((rms, i) => ({ x: i, y: rms })),
                },
              ]}
              xLabel="Iteration"
              yLabel="RMS reprojection error (px)"
              height={220}
              logY
            />
            <div className="grid grid-3">
              <Readout label="Initial RMS" value={adjustment.initialRmsPx} unit="px" />
              <Readout label="Final RMS" value={adjustment.finalRmsPx} unit="px" />
              <Readout label="Iterations" value={adjustment.iterations} unit="—" />
            </div>
          </div>

          <div className="card">
            <h3>Reprojection residuals (§126)</h3>
            <div className="grid grid-2">
              <ScatterPlot
                xLabel="Δx (px)"
                yLabel="Δy (px)"
                size={280}
                groups={[
                  {
                    label: 'Residual per observation',
                    color: 'var(--c-accent)',
                    points: residuals.map((r) => ({ x: r.dx, y: r.dy })),
                  },
                ]}
              />
              <div className="stack">
                <Readout label="RMS reprojection" value={rmsReprojectionPx(residuals)} unit="px" />
                <Readout label="Worst residual" value={Math.max(...residuals.map((r) => r.magnitudePx))} unit="px" />
                <Readout label="Observations" value={residuals.length} unit="—" />
              </div>
            </div>
            <Callout tone="warn" title="A small reprojection error is not accuracy.">
              Reprojection residuals measure how well the solution reproduces the image
              measurements it was fitted to. A block can reproduce its own observations to a
              fraction of a pixel and still sit in the wrong place, or at the wrong scale, or
              tilted. That is what the checkpoints below are for (§152, golden principle 15).
            </Callout>
          </div>

          <div className="card">
            <h3>Object-space error — measured against known truth</h3>
            <table className="data">
              <thead>
                <tr>
                  <th>Point role</th>
                  <th className="num">Before adjustment</th>
                  <th className="num">After adjustment</th>
                  <th>What it tells you</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Tie points</td>
                  <td className="num">{formatNumber(before.tieRmseM, 3)} m</td>
                  <td className="num">{formatNumber(after.tieRmseM, 3)} m</td>
                  <td className="small muted">The adjustment is doing its job on the points it can see.</td>
                </tr>
                <tr>
                  <td>Ground control</td>
                  <td className="num">{formatNumber(before.controlRmseM, 3)} m</td>
                  <td className="num">{formatNumber(after.controlRmseM, 3)} m</td>
                  <td className="small muted">The fit to the points that constrained the solution — not accuracy.</td>
                </tr>
                <tr>
                  <td><strong>Independent checkpoints</strong></td>
                  <td className="num">{formatNumber(before.checkRmseM, 3)} m</td>
                  <td className="num">{formatNumber(after.checkRmseM, 3)} m</td>
                  <td className="small muted"><strong>The only row that is evidence of accuracy.</strong></td>
                </tr>
              </tbody>
            </table>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Checkpoints are excluded from the adjustment entirely — the engine refuses to let them
              influence the solution, and a test asserts they come out exactly as they went in.
            </p>
          </div>

          <div className="card">
            <h3>Image network (§121)</h3>
            <div className="grid grid-3">
              <Readout label="Images" value={network.nodes.length} unit="nodes" />
              <Readout label="Connections" value={network.edges.length} unit="edges" />
              <Readout label="Components" value={network.components} unit="—" />
            </div>
            <Callout tone={network.connected ? 'ok' : 'danger'}>
              {network.connected
                ? 'Every image is connected to the block through shared tie points. A connected network is what lets the adjustment transfer control from where it was observed to where it was not.'
                : `The network splits into ${network.components} components. Each part may align beautifully within itself while sitting at a relative offset from the other — and nothing in the per-image statistics will say so.`}
            </Callout>
            {network.weakNodes.length > 0 ? (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Weakly connected images: <span className="num">{network.weakNodes.join(', ')}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
