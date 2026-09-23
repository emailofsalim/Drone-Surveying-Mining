/**
 * Payload, format and reporting engine tests — Spec §93–§99, §149–§151,
 * §170–§173, §177, §193, §245. Phases 19, 31–34, 38, 39.
 */

import { describe, expect, it } from 'vitest';

import {
  apparentTemperature,
  boresightFromStripSeparation,
  boresightStripSeparation,
  LIDAR_PROFILES,
  lidarCoverage,
  ndvi,
  rangeFromTimeOfFlight,
  recommendPayload,
  timeOfFlightForRange,
  timingPrecisionForRange,
  trajectoryErrorBudget,
  TYPICAL_BANDS,
} from '../src/engine/payloads/payloads';
import {
  assessConversion,
  describeLasHeader,
  exportCsv,
  exportDxf,
  exportGeoJson,
  FORMATS,
  validateLayerStack,
  type ExportMetadata,
  type ExportPoint,
  type GisLayer,
} from '../src/engine/gis/formats';
import {
  ASSESSMENT,
  COMPETENCIES,
  generateReport,
  scoreAssessment,
  scoreSimulation,
  type ReportInputs,
} from '../src/engine/assessment/report';

/* ------------------------------- LiDAR ----------------------------- */

describe('LiDAR engine', () => {
  it('round-trips range and time of flight', () => {
    const t = timeOfFlightForRange(150);
    expect(rangeFromTimeOfFlight(t)).toBeCloseTo(150, 9);
    // 150 m is about 1 microsecond there and back.
    expect(t).toBeCloseTo(1.0007e-6, 9);
  });

  it('demands picosecond timing for centimetre ranging', () => {
    const sigma = timingPrecisionForRange(0.01);
    expect(sigma).toBeLessThan(1e-10);
    expect(sigma * 1e12).toBeCloseTo(66.7, 0);
  });

  it('widens the swath with height and field of view', () => {
    const lidar = LIDAR_PROFILES[0]!;
    const low = lidarCoverage(lidar, 50, 8, 60);
    const high = lidarCoverage(lidar, 100, 8, 60);
    expect(high.swathWidthM).toBeCloseTo(low.swathWidthM * 2, 6);
    expect(high.beamFootprintM).toBeCloseTo(low.beamFootprintM * 2, 9);
  });

  it('drops point density as speed and height rise', () => {
    const lidar = LIDAR_PROFILES[0]!;
    const slow = lidarCoverage(lidar, 80, 4, 60);
    const fast = lidarCoverage(lidar, 80, 12, 60);
    expect(fast.pointDensityPerM2).toBeCloseTo(slow.pointDensityPerM2 / 3, 6);
  });

  it('warns about gaps when line spacing exceeds the swath', () => {
    const result = lidarCoverage(LIDAR_PROFILES[0]!, 60, 8, 500);
    expect(result.swathOverlap).toBeLessThan(0);
    expect(result.warnings.join(' ')).toMatch(/gaps in coverage/i);
  });

  it('warns about thin swath overlap', () => {
    const lidar = LIDAR_PROFILES[0]!;
    const swath = lidarCoverage(lidar, 80, 8, 1).swathWidthM;
    const result = lidarCoverage(lidar, 80, 8, swath * 0.95);
    expect(result.warnings.join(' ')).toMatch(/redundancy|overlap/i);
  });

  it('multiplies an attitude error by the range', () => {
    const near = trajectoryErrorBudget(0.02, 0.01, 20, 0.02);
    const far = trajectoryErrorBudget(0.02, 0.01, 200, 0.02);
    expect(far.attitudeContributionM).toBeCloseTo(near.attitudeContributionM * 10, 6);
    expect(far.totalM).toBeGreaterThan(near.totalM);
  });

  it('names the dominant trajectory error term', () => {
    expect(trajectoryErrorBudget(0.5, 0.001, 50, 0.02).dominant).toBe('position');
    expect(trajectoryErrorBudget(0.01, 0.5, 200, 0.02).dominant).toBe('attitude');
    expect(trajectoryErrorBudget(0.005, 0.0005, 30, 0.2).dominant).toBe('range');
  });

  it('round-trips boresight error and strip separation', () => {
    const separation = boresightStripSeparation(0.05, 150);
    expect(boresightFromStripSeparation(separation, 150)).toBeCloseTo(0.05, 9);
    // A twentieth of a degree at 150 m is already a quarter of a metre apart.
    expect(separation).toBeGreaterThan(0.25);
  });

  it('gives zero strip separation for a perfect boresight', () => {
    expect(boresightStripSeparation(0, 200)).toBeCloseTo(0, 12);
  });
});

/* ------------------------------ thermal ---------------------------- */

describe('thermal engine', () => {
  it('reads the true temperature for a perfect blackbody through a clear path', () => {
    const result = apparentTemperature({
      surfaceTempC: 40, emissivity: 1, backgroundTempC: 20, transmission: 1, pathTempC: 20,
    });
    expect(result.apparentTempC).toBeCloseTo(40, 6);
    expect(result.errorC).toBeCloseTo(0, 6);
  });

  it('pulls a low-emissivity surface toward the background', () => {
    const hotBackground = apparentTemperature({
      surfaceTempC: 40, emissivity: 0.5, backgroundTempC: 80, transmission: 1, pathTempC: 20,
    });
    const coldBackground = apparentTemperature({
      surfaceTempC: 40, emissivity: 0.5, backgroundTempC: 0, transmission: 1, pathTempC: 20,
    });
    expect(hotBackground.apparentTempC).toBeGreaterThan(40);
    expect(coldBackground.apparentTempC).toBeLessThan(40);
  });

  it('warns when emissivity or transmission is low', () => {
    const result = apparentTemperature({
      surfaceTempC: 40, emissivity: 0.6, backgroundTempC: 20, transmission: 0.7, pathTempC: 20,
    });
    expect(result.notes.join(' ')).toMatch(/reflected/i);
    expect(result.notes.join(' ')).toMatch(/attenuation/i);
  });

  it('always states that radiance is not temperature', () => {
    const result = apparentTemperature({
      surfaceTempC: 25, emissivity: 1, backgroundTempC: 25, transmission: 1, pathTempC: 25,
    });
    expect(result.notes[0]).toMatch(/measures radiance/i);
  });
});

/* --------------------------- multispectral ------------------------- */

describe('multispectral engine', () => {
  const bands = { nirBand: TYPICAL_BANDS.nir!, redBand: TYPICAL_BANDS.red! };

  it('computes NDVI in the range −1 to +1', () => {
    expect(ndvi({ nir: 0.5, red: 0.1, ...bands }).ndvi).toBeCloseTo(0.6667, 3);
    expect(ndvi({ nir: 0.1, red: 0.5, ...bands }).ndvi).toBeCloseTo(-0.6667, 3);
    expect(ndvi({ nir: 0.3, red: 0.3, ...bands }).ndvi).toBeCloseTo(0, 9);
  });

  it('interprets water, bare ground and dense vegetation differently', () => {
    expect(ndvi({ nir: 0.05, red: 0.3, ...bands }).interpretation).toMatch(/water/i);
    expect(ndvi({ nir: 0.31, red: 0.29, ...bands }).interpretation).toMatch(/bare rock|soil/i);
    expect(ndvi({ nir: 0.8, red: 0.08, ...bands }).interpretation).toMatch(/dense/i);
  });

  it('is undefined when both bands read zero', () => {
    expect(Number.isNaN(ndvi({ nir: 0, red: 0, ...bands }).ndvi)).toBe(true);
  });

  it('records the band definitions used', () => {
    const result = ndvi({ nir: 0.5, red: 0.1, ...bands });
    expect(result.bands).toContain('842');
    expect(result.bands).toContain('668');
    expect(result.caveat).toMatch(/index, not a measurement/i);
  });
});

/* -------------------------- payload choice ------------------------- */

describe('payload selection', () => {
  it('chooses RGB for textured, lit, bare ground', () => {
    const r = recommendPayload({
      id: 'pit', label: 'Pit progress', hasTexture: true, vegetated: false,
      lowLight: false, nonGeometric: false,
    });
    expect(r.payload).toBe('RGB photogrammetry');
    expect(r.caveat.length).toBeGreaterThan(30);
  });

  it('chooses LiDAR under vegetation, in darkness and on untextured ground', () => {
    const base = { id: 'x', label: 'x', hasTexture: true, vegetated: false, lowLight: false, nonGeometric: false };
    expect(recommendPayload({ ...base, vegetated: true }).payload).toBe('LiDAR');
    expect(recommendPayload({ ...base, lowLight: true }).payload).toBe('LiDAR');
    expect(recommendPayload({ ...base, hasTexture: false }).payload).toBe('LiDAR');
  });

  it('chooses thermal for a non-geometric objective', () => {
    const r = recommendPayload({
      id: 'sh', label: 'Spontaneous heating', hasTexture: true, vegetated: false,
      lowLight: false, nonGeometric: true,
    });
    expect(r.payload).toBe('Thermal');
  });

  it('always states a caveat — never claims universal superiority', () => {
    const base = { id: 'x', label: 'x', hasTexture: true, vegetated: false, lowLight: false, nonGeometric: false };
    for (const variant of [
      base,
      { ...base, vegetated: true },
      { ...base, hasTexture: false },
      { ...base, nonGeometric: true },
    ]) {
      expect(recommendPayload(variant).caveat.length).toBeGreaterThan(30);
    }
  });
});

/* ------------------------------ formats ---------------------------- */

describe('data formats and export', () => {
  const metadata: ExportMetadata = {
    projectName: 'Hillock Ridge (SIMULATED)',
    crs: 'Hillock Ridge Mine Local Grid',
    verticalReference: 'Mine RL, BM-07 = 500.000 m',
    units: 'm',
    producedOn: '2026-09-22',
    source: 'Drone Surveying in Mining — training simulator',
  };
  const points: ExportPoint[] = [
    { id: 'GCP-01', e: 700, n: 1180, rl: 519.2, code: 'GCP', layer: 'CONTROL' },
    { id: 'CP-01', e: 1180, n: 380, rl: 505.1, code: 'CHECK', layer: 'CHECK' },
  ];

  it('flags a DXF export as dangerous because the CRS cannot travel', () => {
    const loss = assessConversion('gpkg', 'dxf');
    expect(loss.severity).toBe('dangerous');
    expect(loss.crsSurvives).toBe(false);
    expect(loss.advice).toMatch(/does not.*record the CRS|Record the CRS/i);
  });

  it('treats a CRS-less source into a CRS-less target as merely lossy', () => {
    const loss = assessConversion('csv', 'dxf');
    expect(loss.severity).not.toBe('dangerous');
  });

  it('reports what a target format cannot hold', () => {
    const loss = assessConversion('las', 'csv');
    expect(loss.lost.length).toBeGreaterThan(0);
    expect(loss.from.id).toBe('las');
    expect(loss.to.id).toBe('csv');
  });

  it('gives every format a CRS handling statement and a loss list', () => {
    for (const format of FORMATS) {
      expect(format.crsHandling.length, format.id).toBeGreaterThan(20);
      expect(format.loses.length, format.id).toBeGreaterThan(0);
      expect(format.stores.length, format.id).toBeGreaterThan(0);
    }
  });

  it('writes a CSV that states the CRS is not machine-readable', () => {
    const csv = exportCsv(points, metadata);
    expect(csv).toMatch(/# CRS: Hillock Ridge Mine Local Grid/);
    expect(csv).toMatch(/cannot carry a coordinate reference system/i);
    expect(csv).toMatch(/SIMULATED/);
    expect(csv).toContain('GCP-01,700.000,1180.000,519.200,GCP');
  });

  it('writes a structurally valid DXF with layers and an EOF', () => {
    const dxf = exportDxf(points, metadata);
    expect(dxf).toMatch(/^0\nSECTION\n2\nHEADER/);
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    expect(dxf).toContain('CONTROL');
    expect(dxf).toContain('CHECK');
    expect((dxf.match(/\nPOINT\n/g) ?? []).length).toBe(points.length);
    // DXF carries the CRS only as a visible note — there is nowhere else.
    expect(dxf).toMatch(/CRS Hillock Ridge Mine Local Grid/);
  });

  it('writes GeoJSON that admits it is not conformant', () => {
    const parsed = JSON.parse(exportGeoJson(points, metadata));
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features).toHaveLength(2);
    expect(parsed._warning).toMatch(/NOT WGS 84/);
    expect(parsed.features[0].geometry.coordinates).toEqual([700, 1180, 519.2]);
  });

  it('describes a LAS header including the CRS record', () => {
    const rows = describeLasHeader(12345, metadata);
    expect(rows.find((r) => r.field.includes('CRS'))?.value).toBe(metadata.crs);
    expect(rows.find((r) => r.field.includes('Number'))?.value).toBe('12345');
  });

  it('catches a layer stored in a different CRS from the project', () => {
    const layers: GisLayer[] = [
      { id: 'a', name: 'Pit crest', kind: 'vector-line', crs: 'Local Grid', source: 'sim', visible: true },
      { id: 'b', name: 'Regional roads', kind: 'vector-line', crs: 'EPSG:4326', source: 'sim', visible: true },
    ];
    const issues = validateLayerStack(layers, 'Local Grid');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(1);
    expect(issues[0]!.layerId).toBe('b');
  });

  it('warns about an elevation layer with no vertical reference', () => {
    const layers: GisLayer[] = [
      { id: 'dtm', name: 'DTM', kind: 'raster', crs: 'Local Grid', source: 'sim', visible: true },
    ];
    const issues = validateLayerStack(layers, 'Local Grid');
    expect(issues.some((i) => i.severity === 'warning' && /vertical reference/i.test(i.message))).toBe(true);
  });
});

/* ------------------------------ reporting -------------------------- */

describe('report generator and decision gate', () => {
  const good: ReportInputs = {
    projectName: 'Monthly pit progress (SIMULATED)',
    objective: 'Pit progress and stockpile volume',
    date: '2026-09-22',
    operator: 'Trainee',
    aircraft: 'Generic quadrotor',
    payload: 'Generic 1" 20 MP',
    positioningMode: 'RTK-fixed',
    crs: 'Local grid',
    verticalReference: 'Mine RL (orthometric)',
    geoidModel: 'Applicable geoid model',
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
    volumeMethod: 'grid-prism',
    volumeBase: 'plane at RL 505.0',
    coverageGapM2: 0,
    requiredHorizontalM: 0.05,
    requiredVerticalM: 0.08,
  };

  it('issues a clean survey with no findings', () => {
    const report = generateReport(good);
    expect(report.verdict).toBe('issue');
    expect(report.findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
  });

  it('demands a resurvey when there are no checkpoints', () => {
    const report = generateReport({ ...good, checkpointCount: 0 });
    expect(report.verdict).toBe('resurvey');
    expect(report.findings.some((f) => f.topic === 'Validation' && f.severity === 'blocker')).toBe(true);
  });

  it('calls for reprocessing on a systematic vertical shift', () => {
    const report = generateReport({ ...good, meanVerticalResidualM: 0.19, checkRmseVerticalM: 0.2 });
    expect(report.verdict).toBe('reprocess');
    expect(report.verdictReason).toMatch(/systematic vertical shift/i);
  });

  it('rejects a survey that misses its tolerance through acquisition', () => {
    const report = generateReport({ ...good, checkRmseHorizontalM: 0.35, requiredHorizontalM: 0.05 });
    expect(report.verdict).toBe('reject');
  });

  it('blocks a volume computed from an unclassified surface', () => {
    const report = generateReport({ ...good, surfaceKind: 'DSM', classified: false });
    expect(report.findings.some((f) => f.topic === 'Volume surface' && f.severity === 'blocker')).toBe(true);
    expect(report.verdict).toBe('reprocess');
  });

  it('blocks a volume with no stated base or method', () => {
    const report = generateReport({ ...good, volumeBase: null, volumeMethod: null });
    expect(report.findings.some((f) => f.topic === 'Volume methodology')).toBe(true);
  });

  it('blocks orthometric heights with no geoid model recorded', () => {
    const report = generateReport({ ...good, geoidModel: null });
    expect(report.findings.some((f) => f.topic === 'Vertical reference' && f.severity === 'blocker')).toBe(true);
  });

  it('issues with limitations when GSD varies widely but tolerance is met', () => {
    const report = generateReport({ ...good, achievedGsdMinCm: 2.9, achievedGsdMaxCm: 5.8 });
    expect(report.verdict).toBe('issue-with-limitations');
    expect(report.findings.some((f) => f.topic === 'Ground sampling distance')).toBe(true);
  });

  it('flags a coverage gap inside the volume boundary', () => {
    const report = generateReport({ ...good, coverageGapM2: 420 });
    expect(report.findings.some((f) => f.topic === 'Coverage')).toBe(true);
  });

  it('always states the simulation limitation', () => {
    const report = generateReport(good);
    expect(report.limitations[0]).toMatch(/simulated/i);
    expect(report.limitations.join(' ')).toMatch(/Simulation is not certification/i);
  });

  it('produces every required report section', () => {
    const report = generateReport(good);
    const headings = report.sections.map((s) => s.heading);
    expect(headings).toContain('Reference system');
    expect(headings).toContain('Control and validation');
    expect(headings).toContain('Products');
    for (const section of report.sections) {
      expect(section.rows.length).toBeGreaterThan(0);
    }
  });

  it('gives every finding a specification basis', () => {
    const report = generateReport({ ...good, checkpointCount: 0, geoidModel: null, coverageGapM2: 10 });
    for (const finding of report.findings) {
      expect(finding.basis.length, finding.topic).toBeGreaterThan(3);
    }
  });
});

/* ----------------------------- assessment -------------------------- */

describe('assessment and simulation scoring', () => {
  it('gives every question exactly one correct option with reasoning on all', () => {
    for (const question of ASSESSMENT) {
      expect(question.options.filter((o) => o.correct), question.id).toHaveLength(1);
      for (const option of question.options) {
        expect(option.reasoning.length, `${question.id}/${option.label}`).toBeGreaterThan(40);
      }
    }
  });

  it('maps every question to a declared competency', () => {
    const known = new Set<string>(COMPETENCIES);
    for (const question of ASSESSMENT) {
      expect(known.has(question.competency), question.id).toBe(true);
    }
  });

  it('scores per competency rather than as a single number', () => {
    const answers: Record<string, number> = {};
    for (const question of ASSESSMENT) {
      answers[question.id] = question.options.findIndex((o) => o.correct);
    }
    const result = scoreAssessment(answers);
    expect(result.answered).toBe(ASSESSMENT.length);
    expect(result.correct).toBe(ASSESSMENT.length);
    expect(result.byCompetency.length).toBeGreaterThan(1);
    expect(result.byCompetency.every((c) => c.ratio === 1)).toBe(true);
  });

  it('identifies the weakest competency', () => {
    const answers: Record<string, number> = {};
    for (const question of ASSESSMENT) {
      const correctIndex = question.options.findIndex((o) => o.correct);
      answers[question.id] =
        question.competency === 'Quality assurance' ? (correctIndex + 1) % question.options.length : correctIndex;
    }
    expect(scoreAssessment(answers).weakest).toBe('Quality assurance');
  });

  it('ignores unanswered questions', () => {
    const result = scoreAssessment({ [ASSESSMENT[0]!.id]: 0 });
    expect(result.answered).toBe(1);
  });

  it('never lets an unsafe decision pass, whatever the score', () => {
    const result = scoreSimulation([
      { id: 'e1', category: 'unsafe', description: 'Flew inside an active blast exclusion zone' },
    ]);
    expect(result.outcome).toMatch(/not competent/i);
    expect(result.score).toBeLessThan(100);
  });

  it('weights reference and safety errors above processing slips', () => {
    const reference = scoreSimulation([
      { id: 'a', category: 'reference', description: 'Used ellipsoidal height as RL' },
    ]);
    const processing = scoreSimulation([
      { id: 'b', category: 'processing', description: 'Suboptimal dense-cloud setting' },
    ]);
    expect(reference.score).toBeLessThan(processing.score);
  });

  it('scores a clean run at 100', () => {
    const result = scoreSimulation([]);
    expect(result.score).toBe(100);
    expect(result.outcome).toMatch(/competent/i);
  });

  it('never returns a negative score', () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`, category: 'unsafe' as const, description: 'x',
    }));
    expect(scoreSimulation(events).score).toBe(0);
  });
});
