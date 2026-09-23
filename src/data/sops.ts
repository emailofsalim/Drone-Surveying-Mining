/**
 * SOP TEMPLATE INDEX — from `03_SOP_TEMPLATE_INDEX.md` in the source pack.
 *
 * These are CONFIGURABLE EDUCATIONAL TEMPLATES ONLY. They are not site SOPs,
 * not legal compliance, and not a substitute for the manufacturer's
 * instructions or competent supervision (safety framework, §229, §230).
 */

export interface SopEntry {
  id: string;
  title: string;
  group: string;
}

export const SOP_SECTIONS = [
  'Purpose',
  'Scope',
  'Responsibilities',
  'Prerequisites',
  'Hazards',
  'Controls',
  'Equipment',
  'PPE',
  'Procedure',
  'Stop Conditions',
  'Emergency Actions',
  'Records',
  'QA/QC',
  'References',
  'Revision History',
] as const;

export const SOPS: SopEntry[] = [
  { id: 'SOP-001', title: 'Procurement & Acceptance', group: 'Acquire & prepare' },
  { id: 'SOP-002', title: 'Aircraft Inspection', group: 'Acquire & prepare' },
  { id: 'SOP-003', title: 'Battery Handling', group: 'Acquire & prepare' },
  { id: 'SOP-004', title: 'Transport/Mobilization', group: 'Acquire & prepare' },
  { id: 'SOP-005', title: 'Mine Site Entry', group: 'Acquire & prepare' },
  { id: 'SOP-006', title: 'UAV Risk Assessment', group: 'Plan' },
  { id: 'SOP-007', title: 'Mission Planning', group: 'Plan' },
  { id: 'SOP-008', title: 'Pre-Flight', group: 'Plan' },
  { id: 'SOP-009', title: 'Takeoff', group: 'Fly' },
  { id: 'SOP-010', title: 'Manual Flight', group: 'Fly' },
  { id: 'SOP-011', title: 'Autonomous Survey Flight', group: 'Fly' },
  { id: 'SOP-012', title: 'RTH', group: 'Fly' },
  { id: 'SOP-013', title: 'Lost-Link', group: 'Abnormal & emergency' },
  { id: 'SOP-014', title: 'GNSS Degradation', group: 'Abnormal & emergency' },
  { id: 'SOP-015', title: 'Compass Abnormality', group: 'Abnormal & emergency' },
  { id: 'SOP-016', title: 'Bad Weather', group: 'Abnormal & emergency' },
  { id: 'SOP-017', title: 'HEMM Conflict', group: 'Mine interface' },
  { id: 'SOP-018', title: 'Blasting Interface', group: 'Mine interface' },
  { id: 'SOP-019', title: 'Powerline Hazard', group: 'Mine interface' },
  { id: 'SOP-020', title: 'People/Exclusion Zone', group: 'Mine interface' },
  { id: 'SOP-021', title: 'Emergency Landing', group: 'Abnormal & emergency' },
  { id: 'SOP-022', title: 'Crash/Impact', group: 'Abnormal & emergency' },
  { id: 'SOP-023', title: 'Flyaway', group: 'Abnormal & emergency' },
  { id: 'SOP-024', title: 'Battery Incident', group: 'Abnormal & emergency' },
  { id: 'SOP-025', title: 'Post-Flight', group: 'Data' },
  { id: 'SOP-026', title: 'Data Backup', group: 'Data' },
  { id: 'SOP-027', title: 'Data Processing', group: 'Data' },
  { id: 'SOP-028', title: 'QA/QC', group: 'Data' },
  { id: 'SOP-029', title: 'Incident Reporting', group: 'Governance' },
  { id: 'SOP-030', title: 'Maintenance', group: 'Governance' },
  { id: 'SOP-031', title: 'Software/Firmware Change Control', group: 'Governance' },
  { id: 'SOP-032', title: 'Cyber/Data Security', group: 'Governance' },
  { id: 'SOP-033', title: 'Archive', group: 'Governance' },
  { id: 'SOP-034', title: 'Final Report', group: 'Governance' },
];

export const SAFETY_PRIORITIES = [
  'Protect people.',
  'Stop or redesign unsafe work.',
  'Follow applicable site controls and authorization.',
  'Protect the aircraft and equipment.',
  'Protect the integrity of survey data.',
  'Report incidents and near misses.',
  'Learn and improve the procedure.',
];

export const GOLDEN_PRINCIPLES = [
  'Understand the objective before choosing the equipment.',
  'Understand the reference before trusting the coordinate.',
  'Understand the height type before trusting the elevation.',
  'Calibrate sensors according to applicable manufacturer procedure.',
  'Calibration does not eliminate environmental disturbance.',
  'Magnetic north is not true north.',
  'Grid north is not automatically true north.',
  'CRS metadata belongs with the coordinate.',
  'GSD is a geometric relationship, not just a number in software.',
  'Overlap creates the observational redundancy needed for image matching.',
  'A keypoint is not automatically a tie point.',
  'A tie point is not a GCP.',
  'A GCP is not an independent checkpoint.',
  'More points do not automatically mean more accuracy.',
  'A visually beautiful model can still fail independent QC.',
  'A point cloud is not automatically terrain.',
  'A smooth DTM can be wrong.',
  'Volume requires explicit surfaces, boundaries, reference/base and methodology.',
  'Raw observations and metadata are evidence.',
  'Every engineering result requires traceability.',
  'Simulation is not certification.',
  'Software is a tool; engineering judgement remains essential.',
];

/** Spec §3 — the twelve application modes. `available` tracks the real build. */
export const APPLICATION_MODES = [
  { id: 1, name: 'Discover', description: 'Explore the mine and equipment freely.', available: true },
  { id: 2, name: 'Learn', description: 'Structured instructional pathway.', available: true },
  { id: 3, name: 'Guided practice', description: 'Hints and instructions.', available: true },
  { id: 4, name: 'Simulation', description: 'Realistic decision environment.', available: true },
  { id: 5, name: 'Failure lab', description: 'Intentionally break systems.', available: true },
  { id: 6, name: 'Expert lab', description: 'Raw measurements, parameters and equations.', available: true },
  { id: 7, name: 'Free flight', description: 'Manual flight practice.', available: false },
  { id: 8, name: 'Survey flight', description: 'Mission-focused automated survey.', available: true },
  { id: 9, name: 'Processing lab', description: 'Synthetic datasets and reconstruction.', available: true },
  { id: 10, name: 'Case study', description: 'Complete mining assignment.', available: false },
  { id: 11, name: 'Assessment', description: 'Competency evaluation.', available: true },
  { id: 12, name: 'Trainer', description: 'Instructor controls and scenario injection.', available: false },
];
