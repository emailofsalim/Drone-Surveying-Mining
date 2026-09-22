/**
 * REPORT GENERATOR, DECISION GATE AND ASSESSMENT — Spec §173, §174, §177,
 * §192–§193, §245, §246, §247. Phases 38, 39, 41.
 *
 * A survey report is not a summary of what was done. It is the EVIDENCE that
 * the result can support the decision it was commissioned for. Anything that
 * cannot be evidenced becomes a stated limitation — never a silent omission
 * (§228, golden principle 20).
 */

export interface ReportInputs {
  projectName: string;
  objective: string;
  date: string;
  operator: string;

  aircraft: string;
  payload: string;
  positioningMode: string;

  crs: string;
  verticalReference: string;
  geoidModel: string | null;

  plannedGsdCm: number;
  achievedGsdMinCm: number;
  achievedGsdMaxCm: number;
  forwardOverlap: number;
  sideOverlap: number;
  imageCount: number;

  gcpCount: number;
  checkpointCount: number;
  checkRmseHorizontalM: number;
  checkRmseVerticalM: number;
  meanVerticalResidualM: number;

  surfaceKind: 'DSM' | 'DTM';
  classified: boolean;
  volumeM3: number | null;
  volumeMethod: string | null;
  volumeBase: string | null;
  coverageGapM2: number;

  /** Tolerance the deliverable must meet, from the project specification. */
  requiredHorizontalM: number;
  requiredVerticalM: number;
}

export type Verdict = 'issue' | 'issue-with-limitations' | 'reprocess' | 'resurvey' | 'reject';

export interface ReportFinding {
  severity: 'blocker' | 'limitation' | 'note';
  topic: string;
  statement: string;
  /** The specification rule or golden principle behind the finding. */
  basis: string;
}

export interface SurveyReport {
  inputs: ReportInputs;
  findings: ReportFinding[];
  verdict: Verdict;
  verdictReason: string;
  /** Sections a complete report must contain (§173). */
  sections: Array<{ heading: string; rows: Array<{ label: string; value: string }> }>;
  limitations: string[];
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const m = (v: number) => `${v.toFixed(3)} m`;

/**
 * ENGINEERING DECISION GATE — Spec §245.
 * The application indicates; the engineer decides. Every finding names the
 * rule it comes from so the reasoning can be checked rather than trusted.
 */
export function generateReport(inputs: ReportInputs): SurveyReport {
  const findings: ReportFinding[] = [];

  /* ---- control and validation ---- */

  if (inputs.checkpointCount === 0) {
    findings.push({
      severity: 'blocker',
      topic: 'Validation',
      statement:
        'No independent checkpoints were observed. GCP residuals describe how well the adjustment ' +
        'fitted the points it was given; they are not evidence of accuracy. Without checkpoints ' +
        'this deliverable has no accuracy statement at all.',
      basis: '§112, §152, golden principle 13',
    });
  } else if (inputs.checkpointCount < 3) {
    findings.push({
      severity: 'limitation',
      topic: 'Validation',
      statement:
        `Only ${inputs.checkpointCount} independent checkpoint(s). The RMSE computed from them is ` +
        'itself poorly determined, and says little about parts of the site they do not cover.',
      basis: '§152, §153',
    });
  }

  if (inputs.gcpCount > 0 && inputs.gcpCount < 4) {
    findings.push({
      severity: 'limitation',
      topic: 'Control',
      statement:
        `${inputs.gcpCount} ground control point(s) is a weak constraint on a block. The solution ` +
        'may be free to tilt or bend between them, particularly in the vertical.',
      basis: '§113, §114',
    });
  }

  if (Number.isFinite(inputs.checkRmseHorizontalM) && inputs.checkpointCount > 0) {
    if (inputs.checkRmseHorizontalM > inputs.requiredHorizontalM) {
      findings.push({
        severity: 'blocker',
        topic: 'Horizontal accuracy',
        statement:
          `Checkpoint horizontal RMSE ${m(inputs.checkRmseHorizontalM)} exceeds the required ` +
          `${m(inputs.requiredHorizontalM)}.`,
        basis: '§152, §153',
      });
    }
    if (inputs.checkRmseVerticalM > inputs.requiredVerticalM) {
      findings.push({
        severity: 'blocker',
        topic: 'Vertical accuracy',
        statement:
          `Checkpoint vertical RMSE ${m(inputs.checkRmseVerticalM)} exceeds the required ` +
          `${m(inputs.requiredVerticalM)}. The vertical is the component a mine volume depends on.`,
        basis: '§152, §153, §240',
      });
    }
  }

  if (
    inputs.checkpointCount > 0 &&
    Math.abs(inputs.meanVerticalResidualM) > inputs.checkRmseVerticalM / 2
  ) {
    findings.push({
      severity: 'blocker',
      topic: 'Systematic vertical shift',
      statement:
        `Mean vertical residual ${m(inputs.meanVerticalResidualM)} is large relative to the scatter. ` +
        'This is a bias, not noise: suspect the height type (h used as H), the geoid model, the ' +
        'base coordinate or an antenna height. A bias must be found and removed, not averaged.',
      basis: '§65, §155, §238',
    });
  }

  /* ---- reference metadata ---- */

  if (!inputs.geoidModel && inputs.verticalReference.toLowerCase().includes('orthometric')) {
    findings.push({
      severity: 'blocker',
      topic: 'Vertical reference',
      statement:
        'Orthometric heights are claimed but no geoid model is recorded. Without a stated geoid ' +
        'the relationship h = H + N cannot be reproduced, and the heights are not defensible.',
      basis: '§64, §65, golden principle 3',
    });
  }

  /* ---- imaging ---- */

  const gsdSpread =
    inputs.achievedGsdMinCm > 0 ? inputs.achievedGsdMaxCm / inputs.achievedGsdMinCm : NaN;
  if (Number.isFinite(gsdSpread) && gsdSpread > 1.3) {
    findings.push({
      severity: 'limitation',
      topic: 'Ground sampling distance',
      statement:
        `Achieved GSD ranges ${inputs.achievedGsdMinCm.toFixed(1)}–${inputs.achievedGsdMaxCm.toFixed(1)} cm/px ` +
        `(${gsdSpread.toFixed(2)}×) across the block. Detail and matching strength are not uniform, ` +
        'so the accuracy statement does not apply equally everywhere.',
      basis: '§88, §79',
    });
  }
  if (inputs.achievedGsdMaxCm > inputs.plannedGsdCm * 1.2) {
    findings.push({
      severity: 'limitation',
      topic: 'Ground sampling distance',
      statement:
        `The coarsest achieved GSD (${inputs.achievedGsdMaxCm.toFixed(1)} cm/px) is materially worse ` +
        `than the planned ${inputs.plannedGsdCm.toFixed(1)} cm/px.`,
      basis: '§86, §88',
    });
  }
  if (inputs.forwardOverlap < 0.7 || inputs.sideOverlap < 0.6) {
    findings.push({
      severity: 'limitation',
      topic: 'Overlap',
      statement:
        `Overlap of ${pct(inputs.forwardOverlap)} forward / ${pct(inputs.sideOverlap)} side is low for ` +
        'mine terrain. Overlap is the observational redundancy the whole reconstruction depends on.',
      basis: '§90, golden principle 10',
    });
  }

  /* ---- surface and volume ---- */

  if (inputs.volumeM3 !== null) {
    if (inputs.surfaceKind === 'DSM' || !inputs.classified) {
      findings.push({
        severity: 'blocker',
        topic: 'Volume surface',
        statement:
          'The volume was computed from an unclassified surface. Anything standing on the ground ' +
          '— vegetation, equipment, a parked truck — is being measured as material.',
        basis: '§137, §240, golden principle 16',
      });
    }
    if (!inputs.volumeBase || !inputs.volumeMethod) {
      findings.push({
        severity: 'blocker',
        topic: 'Volume methodology',
        statement:
          'A volume without an explicit base surface and a stated method is not a result. Report ' +
          'the surface, the boundary, the base and the method, or report no volume.',
        basis: '§145, golden principle 18',
      });
    }
    if (inputs.coverageGapM2 > 0) {
      findings.push({
        severity: 'limitation',
        topic: 'Coverage',
        statement:
          `${inputs.coverageGapM2.toFixed(0)} m² inside the volume boundary had no supporting data. ` +
          'A gap understates the volume; it does not average out.',
        basis: '§240',
      });
    }
  }

  /* ---- verdict ---- */

  const blockers = findings.filter((f) => f.severity === 'blocker');
  const limitations = findings.filter((f) => f.severity === 'limitation');

  let verdict: Verdict;
  let verdictReason: string;

  if (inputs.checkpointCount === 0) {
    verdict = 'resurvey';
    verdictReason =
      'There is no independent evidence of accuracy. Nothing can be issued from this dataset until ' +
      'checkpoints are observed — and observing them requires returning to site.';
  } else if (blockers.some((b) => b.topic === 'Systematic vertical shift')) {
    verdict = 'reprocess';
    verdictReason =
      'A systematic vertical shift is present. It has a cause, and the cause is almost always ' +
      'recoverable in processing — the height type, the geoid, the base coordinate or an antenna ' +
      'height. Find it and reprocess rather than re-flying.';
  } else if (blockers.some((b) => b.topic.includes('Volume'))) {
    verdict = 'reprocess';
    verdictReason =
      'The imagery and control are sound; the products were derived incorrectly. Reclassify, ' +
      'rebuild the surface and recompute the volume with a stated base and method.';
  } else if (blockers.length > 0) {
    verdict = 'reject';
    verdictReason =
      'The deliverable does not meet the stated tolerance and the cause is in the acquisition, not ' +
      'the processing. Re-plan and re-fly before anything is issued.';
  } else if (limitations.length > 0) {
    verdict = 'issue-with-limitations';
    verdictReason =
      'The result meets the stated tolerance, but the limitations below constrain how it may be ' +
      'used. Issue with them stated in full — an unstated limitation is a defect.';
  } else {
    verdict = 'issue';
    verdictReason =
      'The result meets the stated tolerance and is supported by independent checkpoint evidence.';
  }

  /* ---- sections (§173) ---- */

  const sections: SurveyReport['sections'] = [
    {
      heading: 'Survey summary',
      rows: [
        { label: 'Project', value: inputs.projectName },
        { label: 'Objective', value: inputs.objective },
        { label: 'Date', value: inputs.date },
        { label: 'Operator', value: inputs.operator },
        { label: 'Status', value: 'SIMULATED TRAINING DATA' },
      ],
    },
    {
      heading: 'Equipment',
      rows: [
        { label: 'Aircraft', value: inputs.aircraft },
        { label: 'Payload', value: inputs.payload },
        { label: 'Positioning mode', value: inputs.positioningMode },
      ],
    },
    {
      heading: 'Reference system',
      rows: [
        { label: 'Horizontal CRS', value: inputs.crs },
        { label: 'Vertical reference', value: inputs.verticalReference },
        { label: 'Geoid model', value: inputs.geoidModel ?? 'NOT RECORDED' },
      ],
    },
    {
      heading: 'Acquisition',
      rows: [
        { label: 'Planned GSD', value: `${inputs.plannedGsdCm.toFixed(2)} cm/px` },
        {
          label: 'Achieved GSD',
          value: `${inputs.achievedGsdMinCm.toFixed(2)} – ${inputs.achievedGsdMaxCm.toFixed(2)} cm/px`,
        },
        { label: 'Forward overlap', value: pct(inputs.forwardOverlap) },
        { label: 'Side overlap', value: pct(inputs.sideOverlap) },
        { label: 'Images', value: String(inputs.imageCount) },
      ],
    },
    {
      heading: 'Control and validation',
      rows: [
        { label: 'Ground control points', value: String(inputs.gcpCount) },
        { label: 'Independent checkpoints', value: String(inputs.checkpointCount) },
        {
          label: 'Checkpoint RMSE horizontal',
          value: inputs.checkpointCount > 0 ? m(inputs.checkRmseHorizontalM) : 'NOT DETERMINED',
        },
        {
          label: 'Checkpoint RMSE vertical',
          value: inputs.checkpointCount > 0 ? m(inputs.checkRmseVerticalM) : 'NOT DETERMINED',
        },
        {
          label: 'Mean vertical residual',
          value: inputs.checkpointCount > 0 ? m(inputs.meanVerticalResidualM) : 'NOT DETERMINED',
        },
        { label: 'Required horizontal', value: m(inputs.requiredHorizontalM) },
        { label: 'Required vertical', value: m(inputs.requiredVerticalM) },
      ],
    },
    {
      heading: 'Products',
      rows: [
        { label: 'Surface type', value: inputs.surfaceKind },
        { label: 'Classified', value: inputs.classified ? 'yes' : 'NO' },
        {
          label: 'Volume',
          value: inputs.volumeM3 !== null ? `${inputs.volumeM3.toFixed(0)} m³` : 'not computed',
        },
        { label: 'Volume base', value: inputs.volumeBase ?? 'NOT STATED' },
        { label: 'Volume method', value: inputs.volumeMethod ?? 'NOT STATED' },
        { label: 'Coverage gap in boundary', value: `${inputs.coverageGapM2.toFixed(0)} m²` },
      ],
    },
  ];

  return {
    inputs,
    findings,
    verdict,
    verdictReason,
    sections,
    limitations: [
      'All data in this report is simulated. It is not a real mine observation.',
      'This application is an educational simulator. Simulation is not certification.',
      ...limitations.map((l) => `${l.topic}: ${l.statement}`),
    ],
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  issue: 'Issue',
  'issue-with-limitations': 'Issue with limitations',
  reprocess: 'Reprocess',
  resurvey: 'Resurvey',
  reject: 'Reject',
};

export const VERDICT_TONE: Record<Verdict, 'ok' | 'warn' | 'danger'> = {
  issue: 'ok',
  'issue-with-limitations': 'warn',
  reprocess: 'warn',
  resurvey: 'danger',
  reject: 'danger',
};

/* --------------------------- competency ---------------------------- */

/**
 * COMPETENCY PROFILE — Spec §176, §177, §178.
 * Competencies are tracked INDEPENDENTLY: a learner strong on flight and weak
 * on reference systems is a specific, actionable profile, and averaging it
 * into one score destroys exactly the information a trainer needs.
 */
export const COMPETENCIES = [
  'Safety and site interface',
  'Reference systems and CRS',
  'Height and vertical datums',
  'North references and orientation',
  'Sensors and calibration',
  'GNSS and positioning',
  'Imaging geometry and GSD',
  'Mission design',
  'Flight execution',
  'Control and validation',
  'Photogrammetric processing',
  'Surfaces and volumes',
  'Quality assurance',
  'Engineering judgement',
] as const;

export type Competency = (typeof COMPETENCIES)[number];

export interface AssessmentQuestion {
  id: string;
  competency: Competency;
  prompt: string;
  options: Array<{ label: string; correct: boolean; reasoning: string }>;
}

/**
 * Assessment items. Every option carries reasoning, including the correct one:
 * the specification requires the learner to understand WHY, not to be told
 * that they were right (§177).
 */
export const ASSESSMENT: AssessmentQuestion[] = [
  {
    id: 'q-crs-1',
    competency: 'Reference systems and CRS',
    prompt:
      'A contractor delivers a point file of the pit crest. The easting and northing values look ' +
      'entirely normal. What must you establish before using any of them?',
    options: [
      {
        label: 'The CRS, datum, units and axis order the coordinates are expressed in',
        correct: true,
        reasoning:
          'A coordinate without its reference is three numbers. A wrong zone moves the site by ' +
          'hundreds of kilometres and a wrong datum by metres — and neither looks wrong.',
      },
      {
        label: 'The number of decimal places recorded',
        correct: false,
        reasoning:
          'Precision is not accuracy and it is not a reference. Millimetre decimals on the wrong ' +
          'datum are millimetre-precise and metres wrong.',
      },
      {
        label: 'Whether the points were observed with RTK',
        correct: false,
        reasoning:
          'The positioning mode matters, but it tells you the quality of the observation, not the ' +
          'frame the numbers are expressed in.',
      },
    ],
  },
  {
    id: 'q-height-1',
    competency: 'Height and vertical datums',
    prompt:
      'A drone survey reports elevations that are consistently 46 m higher than the mine RLs. The ' +
      'horizontal fits perfectly. What is the most likely cause?',
    options: [
      {
        label: 'Ellipsoidal heights were used where orthometric RLs were required',
        correct: true,
        reasoning:
          'h = H + N. A constant offset of tens of metres with correct horizontal is the signature ' +
          'of the geoid separation being ignored.',
      },
      {
        label: 'The GNSS was in float rather than fixed',
        correct: false,
        reasoning:
          'A float solution degrades and scatters; it does not produce a clean constant offset with ' +
          'a perfect horizontal fit.',
      },
      {
        label: 'Insufficient image overlap',
        correct: false,
        reasoning:
          'Weak overlap produces local distortion and alignment failure, not a uniform vertical shift.',
      },
    ],
  },
  {
    id: 'q-qaqc-1',
    competency: 'Quality assurance',
    prompt:
      'A processing report shows 1.8 cm RMSE on all eight ground control points. What does this ' +
      'establish about the accuracy of the survey?',
    options: [
      {
        label: 'Nothing on its own — those points constrained the solution',
        correct: true,
        reasoning:
          'GCP residuals describe the fit to points the adjustment was given. Accuracy is measured ' +
          'on points it never saw.',
      },
      {
        label: 'That the survey is accurate to about 1.8 cm',
        correct: false,
        reasoning:
          'This is the single most common misreading in UAV survey reporting. A block can fit its ' +
          'own control at 1.8 cm and fail independent checkpoints by a decimetre.',
      },
      {
        label: 'That the survey is accurate to 1.8 cm horizontally but not vertically',
        correct: false,
        reasoning:
          'The vertical is indeed weaker, but the deeper problem is that neither component is ' +
          'evidenced by residuals on the constraining points.',
      },
    ],
  },
  {
    id: 'q-volume-1',
    competency: 'Surfaces and volumes',
    prompt: 'What is the minimum that must accompany a stockpile volume for it to be usable?',
    options: [
      {
        label: 'The surface, the boundary, the base/reference, the method and the units',
        correct: true,
        reasoning:
          'Change any one of these and the number changes. A volume reported without them cannot be ' +
          'reproduced, checked or defended.',
      },
      {
        label: 'The date and the surveyor’s name',
        correct: false,
        reasoning:
          'Necessary for the record, but they do not let anyone reproduce or challenge the figure.',
      },
      {
        label: 'The point-cloud density used',
        correct: false,
        reasoning:
          'Density affects what can be resolved. It does not define what was measured, against what.',
      },
    ],
  },
  {
    id: 'q-compass-1',
    competency: 'Sensors and calibration',
    prompt:
      'A compass calibration completes successfully next to the workshop. On the pit floor the ' +
      'aircraft reports a heading 7° from a known line. What does the successful calibration prove?',
    options: [
      {
        label: 'That the calibration fitted the data collected where it was performed',
        correct: true,
        reasoning:
          'Calibration estimates biases fixed in the aircraft. It cannot remove a field that changes ' +
          'with the environment — and the environment changed.',
      },
      {
        label: 'That the magnetometer hardware is serviceable',
        correct: false,
        reasoning:
          'It suggests the sensor responded, but a successful fit in a disturbed location can also ' +
          'bake that disturbance into the correction.',
      },
      {
        label: 'That declination has been applied correctly',
        correct: false,
        reasoning:
          'Calibration and declination are different things entirely. Calibration handles the ' +
          'aircraft; declination relates magnetic north to true north.',
      },
    ],
  },
  {
    id: 'q-mission-1',
    competency: 'Mission design',
    prompt:
      'A block is planned at a constant 120 m above the take-off point, which sits on the pit crest. ' +
      'The pit floor is 120 m below the crest. What happens to the GSD over the floor?',
    options: [
      {
        label: 'It roughly doubles, because the height above that surface doubles',
        correct: true,
        reasoning:
          'GSD scales linearly with height above the imaged surface. 120 m above the crest is 240 m ' +
          'above the floor, so the pixel covers twice as much ground there.',
      },
      {
        label: 'It stays the same, because the aircraft height is constant',
        correct: false,
        reasoning:
          'The aircraft height above the TAKE-OFF POINT is constant. Its height above the GROUND is ' +
          'not, and GSD depends on the latter.',
      },
      {
        label: 'It roughly halves, because the aircraft is further from the terrain',
        correct: false,
        reasoning: 'The direction is inverted — more distance means a coarser, larger GSD.',
      },
    ],
  },
  {
    id: 'q-gnss-1',
    competency: 'GNSS and positioning',
    prompt:
      'The base station coordinate was entered 0.4 m too high. Every internal RTK quality indicator ' +
      'is nominal throughout the flight. What is the effect on the survey?',
    options: [
      {
        label: 'Every rover position, and the entire survey, is shifted 0.4 m in height',
        correct: true,
        reasoning:
          'A base error transfers one-for-one into every differential position. It is systematic and ' +
          'invisible internally — only independent control reveals it.',
      },
      {
        label: 'The error averages out over a long flight',
        correct: false,
        reasoning:
          'Averaging removes random error. A constant bias is unaffected by any amount of averaging.',
      },
      {
        label: 'RTK would report float or a quality warning',
        correct: false,
        reasoning:
          'The solution is internally consistent; it is simply consistent about the wrong place. ' +
          'Nothing in the quality indicators can detect it.',
      },
    ],
  },
  {
    id: 'q-safety-1',
    competency: 'Safety and site interface',
    prompt:
      'Two flight lines remain. The battery reserve needed to return and land is now roughly equal ' +
      'to the usable capacity remaining. What is the correct action?',
    options: [
      {
        label: 'Return now, change the battery, and resume from the last completed line',
        correct: true,
        reasoning:
          'The reserve exists so that it is not spent. A survey in two sorties costs an overlap ' +
          'strip; a forced landing costs far more.',
      },
      {
        label: 'Finish the two lines — the reserve has margin built in',
        correct: false,
        reasoning:
          'Spending the reserve because it exists is precisely the reasoning it is designed to ' +
          'prevent. A climb out of a pit into a headwind costs more than the level-flight figure.',
      },
      {
        label: 'Land on the pit floor to conserve energy',
        correct: false,
        reasoning:
          'That places the aircraft and any recovery party inside the active hazard area, and site ' +
          'entry controls still apply.',
      },
    ],
  },
];

export interface AssessmentResult {
  answered: number;
  correct: number;
  byCompetency: Array<{ competency: Competency; asked: number; correct: number; ratio: number }>;
  weakest: Competency | null;
}

export function scoreAssessment(answers: Record<string, number>): AssessmentResult {
  const perCompetency = new Map<Competency, { asked: number; correct: number }>();
  let answered = 0;
  let correct = 0;

  for (const question of ASSESSMENT) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;
    answered++;
    const isCorrect = question.options[chosen]?.correct === true;
    if (isCorrect) correct++;

    const entry = perCompetency.get(question.competency) ?? { asked: 0, correct: 0 };
    entry.asked++;
    if (isCorrect) entry.correct++;
    perCompetency.set(question.competency, entry);
  }

  const byCompetency = [...perCompetency.entries()].map(([competency, e]) => ({
    competency,
    asked: e.asked,
    correct: e.correct,
    ratio: e.asked > 0 ? e.correct / e.asked : NaN,
  }));

  const weakest =
    byCompetency.length > 0
      ? byCompetency.reduce((min, c) => (c.ratio < min.ratio ? c : min)).competency
      : null;

  return { answered, correct, byCompetency, weakest };
}

/**
 * SUPER-SIMULATION SCORING — Spec §193.
 * "Do not reward speed over engineering correctness." Time is not scored at
 * all; unsafe decisions and reference errors are weighted heaviest.
 */
export interface SimulationEvent {
  id: string;
  category: 'unsafe' | 'reference' | 'data-loss' | 'mission-design' | 'control' | 'processing' | 'qc';
  description: string;
}

const PENALTY: Record<SimulationEvent['category'], number> = {
  unsafe: 40,
  reference: 30,
  'data-loss': 25,
  control: 20,
  qc: 20,
  'mission-design': 12,
  processing: 12,
};

export function scoreSimulation(events: SimulationEvent[]): {
  score: number;
  deductions: Array<{ event: SimulationEvent; penalty: number }>;
  outcome: string;
} {
  const deductions = events.map((event) => ({ event, penalty: PENALTY[event.category] }));
  const score = Math.max(0, 100 - deductions.reduce((sum, d) => sum + d.penalty, 0));

  const unsafe = events.filter((e) => e.category === 'unsafe').length;
  const outcome =
    unsafe > 0
      ? 'Not competent for independent work: an unsafe decision was taken. Safety outcomes are not ' +
        'traded against survey outcomes at any score.'
      : score >= 80
        ? 'Competent: the chain was followed and the result was defended with evidence.'
        : score >= 50
          ? 'Developing: the workflow was completed but with errors that would reach the deliverable.'
          : 'Not yet competent: errors in reference handling, control or QC undermine the result.';

  return { score, deductions, outcome };
}
