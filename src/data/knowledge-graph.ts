/**
 * KNOWLEDGE GRAPH — Spec Phase 03, §157 ("why?" engine), §206 (data-driven
 * content), §256 (final learning arc).
 *
 * The specification's chain (§0) is not a list of chapters — it is a directed
 * graph of dependencies. A learner who cannot answer "why does this topic
 * exist?" is told by the graph: because the topic downstream of it fails
 * without it.
 *
 * Every node declares its five required answers (§1). `status` records what is
 * actually implemented so the roadmap never overstates the build.
 */

export type TopicStatus = 'built' | 'partial' | 'planned';

export interface TopicFiveAnswers {
  what: string;
  how: string;
  operate: string;
  affectsSurvey: string;
  proveTrust: string;
}

export interface Topic {
  id: string;
  title: string;
  stage: string;
  phase: number;
  status: TopicStatus;
  summary: string;
  /** Topics this one depends on. Edges point upstream. */
  requires: string[];
  /** Route in the app, when something is implemented. */
  route?: string;
  five?: TopicFiveAnswers;
  goldenPrinciples?: number[];
}

export const STAGES = [
  'Foundations',
  'Aircraft',
  'Sensing & orientation',
  'Geodesy',
  'Imaging',
  'Mission & flight',
  'Data & processing',
  'Products',
  'Assurance',
] as const;

export type Stage = (typeof STAGES)[number];

export const TOPICS: Topic[] = [
  {
    id: 'virtual-mine',
    title: 'The virtual mine',
    stage: 'Foundations',
    phase: 2,
    status: 'built',
    route: '/mine',
    summary:
      'One simulated open-pit dataset that every later view and product is derived from. ' +
      'Plan, 3D and profile views read the same elevation model.',
    requires: [],
    five: {
      what: 'A fictitious benched open pit with a ramp, stockpile, waste dump, control and hazards.',
      how: 'A parametric elevation function plus a feature list, evaluated identically by every view.',
      operate: 'Switch views, move the section line, inspect any feature and its metadata.',
      affectsSurvey: 'It is the ground truth every later measurement is compared against.',
      proveTrust: 'Every view is generated from the same function — no hand-drawn illustrations.',
    },
    goldenPrinciples: [19, 20],
  },
  {
    id: 'safety',
    title: 'Safety framework and SOPs',
    stage: 'Foundations',
    phase: 2,
    status: 'built',
    route: '/safety',
    summary:
      'Safety priorities, stop conditions and the SOP template library. Educational templates, ' +
      'never a substitute for site SOPs or applicable law.',
    requires: [],
    goldenPrinciples: [21, 22],
  },
  {
    id: 'units',
    title: 'Units and dimensional analysis',
    stage: 'Foundations',
    phase: 1,
    status: 'built',
    route: '/formulas',
    summary: 'Every quantity carries its unit; mismatches raise an error instead of scaling silently.',
    requires: [],
    five: {
      what: 'A unit system covering length, angle, speed, area, volume, mass, force and pressure.',
      how: 'Values convert through an SI base; cross-dimension conversion is refused.',
      operate: 'Enter any quantity in any supported unit in the labs.',
      affectsSurvey: 'A unit error is a survey blunder that looks like a valid number.',
      proveTrust: 'Every calculation prints its dimensional analysis line.',
    },
  },
  {
    id: 'formula-engine',
    title: 'Formula engine',
    stage: 'Foundations',
    phase: 1,
    status: 'built',
    route: '/formulas',
    summary:
      'Searchable formula library. Each formula shows variables, substitution, dimensional ' +
      'analysis, assumptions, limitations and the questions to answer first.',
    requires: ['units'],
    goldenPrinciples: [9, 22],
  },
  {
    id: 'provenance',
    title: 'Provenance and simulated-data tagging',
    stage: 'Foundations',
    phase: 1,
    status: 'built',
    summary:
      'Every value records its origin, producer, quality and limitations. Nothing in this app ' +
      'is a real mine observation.',
    requires: [],
    goldenPrinciples: [19, 20, 21],
  },

  {
    id: 'drone-anatomy',
    title: 'Drone anatomy and exploded view',
    stage: 'Aircraft',
    phase: 6,
    status: 'built',
    route: '/aircraft',
    summary: 'Airframe, propulsion, sensors and payload as an inspectable 3D assembly.',
    requires: ['virtual-mine'],
    five: {
      what: 'The physical aircraft: airframe, propulsion, avionics, sensors and payload.',
      how: 'Each component has an input, an output, an operating principle and a set of failure modes.',
      operate: 'Select a component and read what it does and what it does to the survey when it fails.',
      affectsSurvey: 'Every defect reaches the imagery eventually — vibration as blur, a loose mount as attitude error.',
      proveTrust: 'Inspection against a checklist, with serial numbers recorded in the asset register.',
    },
  },
  {
    id: 'aerodynamics',
    title: 'Aerodynamics and thrust',
    stage: 'Aircraft',
    phase: 7,
    status: 'built',
    route: '/aircraft',
    summary: 'Thrust/weight, force vectors, moments, centre of gravity and wind response.',
    requires: ['drone-anatomy'],
    five: {
      what: 'The force balance that keeps the aircraft up and moves it around.',
      how: 'Hover thrust equals weight; tilting splits the thrust vector; drag rises with the square of the wind.',
      operate: 'Change mass, thrust, wind and altitude, and read the resulting margin and energy cost.',
      affectsSurvey: 'Thrust margin sets endurance, and endurance sets how much of the mine one sortie can cover.',
      proveTrust: 'Compare against the manufacturer\'s stated limits — these are simplified teaching models.',
    },
  },
  {
    id: 'flight-control',
    title: 'Flight control and PID',
    stage: 'Aircraft',
    phase: 9,
    status: 'built',
    route: '/aircraft',
    summary: 'Motor mixing, attitude control loops and what a badly tuned loop does to imagery.',
    requires: ['aerodynamics', 'imu'],
    five: {
      what: 'The loop that turns an attitude demand into motor outputs.',
      how: 'State estimate, error, PID response, motor mixing, actuator saturation.',
      operate: 'Tune the gains against a standing disturbance and watch overshoot and settling change.',
      affectsSurvey: 'A badly tuned loop oscillates; the airframe vibrates and the imagery blurs or shears.',
      proveTrust: 'Not from a simulator. Control tuning is the manufacturer\'s domain (§33).',
    },
  },

  {
    id: 'imu',
    title: 'IMU and sensor fusion',
    stage: 'Sensing & orientation',
    phase: 10,
    status: 'built',
    route: '/sensors',
    summary: 'Gyroscope, accelerometer, drift and the fusion that keeps attitude bounded.',
    requires: ['virtual-mine'],
    five: {
      what: 'A gyroscope measuring angular rate and an accelerometer measuring specific force.',
      how: 'Rates and forces are integrated to attitude and position, so a bias becomes an unbounded error.',
      operate: 'Change sensor grade and the fusion time constant, and read the drift and the fused error.',
      affectsSurvey: 'Attitude error rotates the camera; for LiDAR it is multiplied by the range to the ground.',
      proveTrust: 'Against an absolute reference — GNSS position, and a gravity vector at rest.',
    },
  },
  {
    id: 'compass',
    title: 'Magnetometer, compass and calibration',
    stage: 'Sensing & orientation',
    phase: 11,
    status: 'built',
    route: '/sensors',
    summary:
      'Hard-iron and soft-iron error, calibration, and why a successful calibration next to an ' +
      'excavator still leaves a heading error.',
    requires: ['imu'],
    goldenPrinciples: [5, 6],
    five: {
      what: 'A three-axis magnetometer used to derive a heading from the local field.',
      how: 'm = A·m_true + b: a hard-iron offset translates the sphere, soft iron distorts it to an ellipsoid.',
      operate: 'Inject distortion, run the calibration, and inspect the heading error that remains.',
      affectsSurvey: 'Heading error rotates every footprint and weakens the initial image alignment.',
      proveTrust: 'Against an independent line of known grid azimuth between two control monuments.',
    },
  },
  {
    id: 'north-references',
    title: 'True, magnetic and grid north',
    stage: 'Sensing & orientation',
    phase: 12,
    status: 'built',
    route: '/north',
    summary:
      'Three norths, three bearings for one line. Declination, meridian convergence and the ' +
      'setting-out error that follows from confusing them.',
    requires: ['units', 'formula-engine'],
    five: {
      what: 'Three distinct reference directions used for azimuths in mine surveying.',
      how: 'True is the meridian, magnetic is the local field, grid is the projection northing axis.',
      operate: 'Convert an azimuth between references and inspect the resulting displacement.',
      affectsSurvey: 'An unapplied declination or convergence rotates every set-out line on the site.',
      proveTrust: 'Compare an observed bearing against a known line between two control monuments.',
    },
    goldenPrinciples: [6, 7],
  },
  {
    id: 'crs',
    title: 'CRS, datum, ellipsoid and UTM',
    stage: 'Geodesy',
    phase: 13,
    status: 'built',
    route: '/crs',
    summary:
      'Coordinates that refuse to be compared across different frames, UTM projection with real ' +
      'convergence and scale factor, and the axis-order trap.',
    requires: ['north-references'],
    five: {
      what: 'The reference frame that gives a coordinate its meaning.',
      how: 'Datum + ellipsoid + projection + units + axis order + epoch.',
      operate: 'Project a position, change the zone or the axis order, and watch the site move.',
      affectsSurvey: 'A wrong CRS displaces the entire dataset while every number still looks plausible.',
      proveTrust: 'Metadata travels with the coordinate and mismatches raise an error.',
    },
    goldenPrinciples: [2, 8],
  },
  {
    id: 'height',
    title: 'Height, geoid and RL',
    stage: 'Geodesy',
    phase: 14,
    status: 'built',
    route: '/height',
    summary:
      'h = H + N, levelling reduction with its arithmetic checks, trigonometric heights, and the ' +
      'five different meanings of "flying at 100 m".',
    requires: ['crs'],
    five: {
      what: 'The vertical component, which has more reference types than the horizontal.',
      how: 'Ellipsoidal height from GNSS, orthometric height from the geoid, AGL/ATO from the flight.',
      operate: 'Reduce a levelling run, convert h ↔ H, resolve an altitude over the pit.',
      affectsSurvey: 'Using h as RL shifts every surface by N and corrupts every volume.',
      proveTrust: 'Arithmetic checks on the levelling run; independent checkpoints on the surface.',
    },
    goldenPrinciples: [3, 17, 18],
  },
  {
    id: 'gnss',
    title: 'GNSS, RTK, PPK, CORS and NTRIP',
    stage: 'Geodesy',
    phase: 15,
    status: 'built',
    route: '/gnss',
    summary: 'Positioning modes, correction transport, and what each mode actually delivers.',
    requires: ['crs', 'height'],
    five: {
      what: 'Absolute positioning from satellite ranging, with differential techniques for survey accuracy.',
      how: 'Position error is DOP times range error; differencing against a base cancels the common part.',
      operate: 'Change mode, baseline, correction age and the pit depth, and read the resulting sigma.',
      affectsSurvey: 'It sets the camera positions, and a base-coordinate error shifts the entire survey.',
      proveTrust: 'Independent checkpoints on known control — no internal indicator can detect a base error.',
    },
  },

  {
    id: 'camera',
    title: 'Camera, exposure and shutter',
    stage: 'Imaging',
    phase: 17,
    status: 'built',
    route: '/gsd',
    summary: 'Sensor geometry, focal length, shutter type, motion blur and rolling-shutter shear.',
    requires: ['units'],
    goldenPrinciples: [9],
    five: {
      what: 'The instrument that makes the observation every photogrammetric product is derived from.',
      how: 'Sensor size, focal length and pixel count fix the geometry; shutter and exposure fix the quality.',
      operate: 'Change camera, height and speed, and read GSD, footprint and motion smear.',
      affectsSurvey: 'Nothing downstream can be better than the images; blur destroys matching before it is visible.',
      proveTrust: 'Check the achieved GSD against the height actually flown over each surface.',
    },
  },
  {
    id: 'gsd',
    title: 'GSD, footprint and overlap',
    stage: 'Imaging',
    phase: 18,
    status: 'built',
    route: '/gsd',
    summary:
      'Ground sampling distance as a geometric relationship, image footprint, overlap, spacing, ' +
      'and what happens to GSD when the ground falls away into a pit.',
    requires: ['camera'],
    five: {
      what: 'The ground size of one pixel under a stated imaging geometry.',
      how: 'GSD = H·p/f, from similar triangles between sensor and ground.',
      operate: 'Change height, camera and overlap; read the resulting mission geometry.',
      affectsSurvey: 'GSD drives feature detectability, image count, flight time and data volume.',
      proveTrust: 'Recompute it from the achieved height over each surface, not from the plan.',
    },
    goldenPrinciples: [9, 10, 14],
  },
  {
    id: 'payloads',
    title: 'LiDAR, thermal and multispectral',
    stage: 'Imaging',
    phase: 19,
    status: 'built',
    route: '/payloads',
    summary: 'When photogrammetry is the wrong tool and what each alternative payload measures.',
    requires: ['gsd'],
    five: {
      what: 'LiDAR, thermal and multispectral sensors, measuring things a camera cannot.',
      how: 'LiDAR ranges actively; thermal measures radiance; multispectral measures band reflectance.',
      operate: 'Select an objective and see which payload suits it, and what that choice costs.',
      affectsSurvey: 'The wrong payload produces a confident answer to the wrong question.',
      proveTrust: 'For LiDAR, overlapping strips and a boresight check; for thermal, stated emissivity.',
    },
  },

  {
    id: 'mission-planning',
    title: 'Mission planner',
    stage: 'Mission & flight',
    phase: 20,
    status: 'built',
    route: '/mission',
    summary:
      'Objective first, then area, accuracy, GSD, control, payload, flight and deliverables. ' +
      'Currently the geometry layer only: lines, spacing, image count and flight time.',
    requires: ['gsd', 'height'],
    five: {
      what: 'The design that turns a survey objective into a flight the aircraft can execute.',
      how: 'Objective, area, accuracy, GSD, control, payload, altitude, overlap, speed, direction, validation.',
      operate: 'Change any parameter and watch lines, images, time and achieved GSD move together.',
      affectsSurvey: 'It determines coverage, redundancy and whether the block is solvable at all.',
      proveTrust: 'Compare the planned geometry against what the flight actually achieved over the terrain.',
    },
  },
  {
    id: 'preflight',
    title: 'Pre-flight and failure injection',
    stage: 'Mission & flight',
    phase: 21,
    status: 'built',
    route: '/mission',
    summary: 'Checks that pass, checks that fail, and the stop conditions that follow.',
    requires: ['mission-planning', 'safety'],
    five: {
      what: 'The last point at which a survey can be stopped cheaply.',
      how: 'A checklist of items, each with an explicit stop condition.',
      operate: 'Inject faults and see which are stops, which are cautions, and what each costs downstream.',
      affectsSurvey: 'Most data failures were visible on the ground before take-off.',
      proveTrust: 'The completed checklist is part of the evidence that the flight was conducted properly.',
    },
  },
  {
    id: 'flight-sim',
    title: 'Flight simulator',
    stage: 'Mission & flight',
    phase: 22,
    status: 'partial',
    route: '/mission',
    summary: 'Free flight and automated survey flight over the virtual mine, with incidents.',
    requires: ['flight-control', 'preflight'],
  },

  {
    id: 'control-network',
    title: 'GCPs and independent checkpoints',
    stage: 'Data & processing',
    phase: 24,
    status: 'built',
    route: '/photogrammetry',
    summary:
      'Points that constrain the adjustment versus points that test it. Only the second kind is ' +
      'evidence of accuracy.',
    requires: ['crs', 'height'],
    goldenPrinciples: [12, 13],
    five: {
      what: 'The surveyed points that constrain a block, and the independent points that test it.',
      how: 'GCPs enter the adjustment as weighted constraints; checkpoints are withheld entirely.',
      operate: 'Change the control weight and watch residuals and checkpoint error move in opposite directions.',
      affectsSurvey: 'Control places the block in the world; checkpoints are the only evidence that it worked.',
      proveTrust: 'That is precisely what the checkpoints are for (golden principle 13).',
    },
  },
  {
    id: 'photogrammetry',
    title: 'Photogrammetry: keypoints to bundle adjustment',
    stage: 'Data & processing',
    phase: 25,
    status: 'built',
    route: '/photogrammetry',
    summary: 'Keypoints, descriptors, matches, tie points, poses, triangulation and residuals.',
    requires: ['gsd', 'control-network'],
    goldenPrinciples: [11, 12],
    five: {
      what: 'Reconstruction of geometry from correspondences between overlapping images.',
      how: 'Keypoints, descriptors, matches, tie points, triangulation, bundle adjustment, residuals.',
      operate: 'Degrade image quality, change the baseline, and adjust the block; watch each stage respond.',
      affectsSurvey: 'It produces the camera poses and the sparse geometry everything later is built on.',
      proveTrust: 'Reprojection error measures the fit; only independent checkpoints measure the accuracy.',
    },
  },
  {
    id: 'point-cloud',
    title: 'Point cloud and classification',
    stage: 'Data & processing',
    phase: 28,
    status: 'built',
    route: '/products',
    summary: 'Density, noise, cleaning and the classification step that separates ground from cover.',
    requires: ['photogrammetry'],
    goldenPrinciples: [16],
    five: {
      what: 'The measured points representing the surface the sensor could see.',
      how: 'Generated, cleaned of outliers, then classified into ground and everything else.',
      operate: 'Change density, vegetation and the classification threshold; score the result against truth.',
      affectsSurvey: 'An unclassified cloud produces a surface of the canopy, not the terrain.',
      proveTrust: 'Classification precision and recall, and a checkpoint on bare ground.',
    },
  },

  {
    id: 'surfaces',
    title: 'TIN, DSM, DTM and contours',
    stage: 'Products',
    phase: 29,
    status: 'built',
    route: '/products',
    summary: 'Surface construction, interpolation choices and why a smooth DTM can still be wrong.',
    requires: ['point-cloud'],
    goldenPrinciples: [16, 17],
    five: {
      what: 'DSM, DTM and the interpolation that fills between observations.',
      how: 'Points are gridded per cell, gaps are filled or left as no-data, and contours follow.',
      operate: 'Switch classification on and off and compare the DSM against the DTM over the same ground.',
      affectsSurvey: 'The surface is what a volume is measured from; its type decides what is being measured.',
      proveTrust: 'Per-cell support counts, explicit no-data, and a stated interpolation method.',
    },
  },
  {
    id: 'orthomosaic',
    title: 'Orthomosaic and mesh',
    stage: 'Products',
    phase: 30,
    status: 'partial',
    route: '/products',
    summary: 'Orthorectification, seamlines, and why a beautiful ortho is not a validated survey.',
    requires: ['surfaces'],
    goldenPrinciples: [15],
  },
  {
    id: 'volume',
    title: 'Volume, stockpile and change detection',
    stage: 'Products',
    phase: 35,
    status: 'built',
    route: '/products',
    summary:
      'Volume needs surfaces, a boundary, a base and a stated method. The stockpile in the ' +
      'virtual mine carries an analytic truth value to compare against.',
    requires: ['surfaces'],
    goldenPrinciples: [18],
    five: {
      what: 'The quantity between a measured surface and a stated reference, inside a stated boundary.',
      how: 'Cell prisms summed over the boundary, against a base plane or a previous surface.',
      operate: 'Change surface, boundary, base and cell size, and watch a plausible number move.',
      affectsSurvey: 'It is usually the deliverable the whole survey exists to produce.',
      proveTrust: 'Report the surface, boundary, base, method and units — and an independent checkpoint.',
    },
  },

  {
    id: 'qaqc',
    title: 'QA/QC, RMSE and the error budget',
    stage: 'Assurance',
    phase: 36,
    status: 'built',
    route: '/qaqc',
    summary:
      'GCP residuals versus checkpoint RMSE, systematic versus random error, and the error ' +
      'budget that decides whether a result can support a decision.',
    requires: ['control-network', 'height'],
    five: {
      what: 'The evidence that a deliverable is fit for the decision it will support.',
      how: 'Independent checkpoints, residual statistics and a propagated error budget.',
      operate: 'Load a control set, read the residuals, identify systematic shifts.',
      affectsSurvey: 'It is the difference between a number and a defensible number.',
      proveTrust: 'That is exactly what this topic is for.',
    },
    goldenPrinciples: [13, 14, 15, 19, 20],
  },
  {
    id: 'decision-gate',
    title: 'Engineering decision gate',
    stage: 'Assurance',
    phase: 38,
    status: 'built',
    route: '/report',
    summary:
      'Issue, issue with limitations, reprocess, resurvey or reject — with evidence-based reasoning.',
    requires: ['qaqc', 'volume'],
    goldenPrinciples: [20, 21, 22],
    five: {
      what: 'The judgement on whether a result can support the decision it was commissioned for.',
      how: 'Findings against the project tolerance resolve to issue, reprocess, resurvey or reject.',
      operate: 'Inject failures and watch the verdict and its reasoning change.',
      affectsSurvey: 'It is the point at which a survey becomes an engineering product or does not.',
      proveTrust: 'Every finding cites the rule behind it, so the reasoning can be checked rather than trusted.',
    },
  },
];

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

export function topicsByStage(): Array<{ stage: Stage; topics: Topic[] }> {
  return STAGES.map((stage) => ({
    stage,
    topics: TOPICS.filter((t) => t.stage === stage),
  }));
}

/** Topics that depend on the given topic — "what breaks without this?" (§157). */
export function dependents(id: string): Topic[] {
  return TOPICS.filter((t) => t.requires.includes(id));
}

/** Full upstream chain, nearest dependency first. */
export function prerequisiteChain(id: string): Topic[] {
  const out: Topic[] = [];
  const seen = new Set<string>();
  const walk = (current: string) => {
    const topic = topicById(current);
    if (!topic) return;
    for (const req of topic.requires) {
      if (seen.has(req)) continue;
      seen.add(req);
      const t = topicById(req);
      if (t) out.push(t);
      walk(req);
    }
  };
  walk(id);
  return out;
}

export function buildProgress(): { built: number; partial: number; planned: number; total: number } {
  const count = (s: TopicStatus) => TOPICS.filter((t) => t.status === s).length;
  return {
    built: count('built'),
    partial: count('partial'),
    planned: count('planned'),
    total: TOPICS.length,
  };
}
