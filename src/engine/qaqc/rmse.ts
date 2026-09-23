/**
 * QA/QC ENGINE — Spec §152–§156, §242.
 *
 * The distinction this engine exists to teach:
 *   GCP residuals    — how well the adjustment fitted the points it was GIVEN.
 *   CHECKPOINT RMSE  — how well the result predicts points it never saw.
 * Only the second is evidence of accuracy. A model can show 2 cm GCP residuals
 * and still fail a checkpoint test badly (§242, golden principle 15).
 */

export interface ControlPoint {
  id: string;
  /** 'gcp' points constrain the adjustment; 'check' points validate it. */
  role: 'gcp' | 'check';
  surveyed: { e: number; n: number; z: number };
  modelled: { e: number; n: number; z: number };
}

export interface Residual {
  id: string;
  role: ControlPoint['role'];
  dE: number;
  dN: number;
  dZ: number;
  horizontal: number;
  total: number;
}

export function residuals(points: ControlPoint[]): Residual[] {
  return points.map((p) => {
    const dE = p.modelled.e - p.surveyed.e;
    const dN = p.modelled.n - p.surveyed.n;
    const dZ = p.modelled.z - p.surveyed.z;
    return {
      id: p.id,
      role: p.role,
      dE,
      dN,
      dZ,
      horizontal: Math.hypot(dE, dN),
      total: Math.hypot(dE, dN, dZ),
    };
  });
}

export interface RmseSummary {
  count: number;
  rmseE: number;
  rmseN: number;
  rmseHorizontal: number;
  rmseVertical: number;
  meanE: number;
  meanN: number;
  meanZ: number;
  maxTotal: number;
  /** A non-zero mean is a systematic shift, not random noise (§155). */
  systematicShiftM: number;
}

export function rmse(values: number[]): number {
  if (values.length === 0) return NaN;
  const sumSq = values.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(sumSq / values.length);
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarise(res: Residual[]): RmseSummary {
  const dE = res.map((r) => r.dE);
  const dN = res.map((r) => r.dN);
  const dZ = res.map((r) => r.dZ);
  const meanE = mean(dE);
  const meanN = mean(dN);
  const meanZ = mean(dZ);
  return {
    count: res.length,
    rmseE: rmse(dE),
    rmseN: rmse(dN),
    rmseHorizontal: rmse(res.map((r) => r.horizontal)),
    rmseVertical: rmse(dZ),
    meanE,
    meanN,
    meanZ,
    maxTotal: res.reduce((m, r) => Math.max(m, r.total), 0),
    systematicShiftM: Math.hypot(meanE, meanN, meanZ),
  };
}

export interface QcVerdict {
  gcp: RmseSummary;
  check: RmseSummary;
  /** check RMSE ÷ GCP RMSE. A large ratio means the fit did not generalise. */
  generalisationRatio: number;
  findings: string[];
}

export function assessControl(points: ControlPoint[]): QcVerdict {
  const all = residuals(points);
  const gcp = summarise(all.filter((r) => r.role === 'gcp'));
  const check = summarise(all.filter((r) => r.role === 'check'));
  const findings: string[] = [];

  if (check.count === 0) {
    findings.push(
      'No independent checkpoints. GCP residuals alone are not evidence of accuracy — ' +
        'they describe the fit, not the prediction (§112, §152).',
    );
  }
  const ratio = gcp.rmseHorizontal > 0 ? check.rmseHorizontal / gcp.rmseHorizontal : NaN;
  if (Number.isFinite(ratio) && ratio > 2) {
    findings.push(
      `Checkpoint RMSE is ${ratio.toFixed(1)}× the GCP RMSE. The adjustment fitted its own ` +
        'control but does not predict independent points. Suspect weak geometry, a control ' +
        'blunder, or over-constrained control (§126, §241).',
    );
  }
  if (Number.isFinite(check.systematicShiftM) && check.systematicShiftM > check.rmseHorizontal / 2) {
    findings.push(
      `Mean residual ${check.systematicShiftM.toFixed(3)} m is large relative to the scatter: ` +
        'this is a systematic shift (datum, CRS, geoid or antenna height), not random error (§155, §238).',
    );
  }
  if (Math.abs(check.meanZ) > Math.abs(check.rmseVertical) / 2 && check.count > 0) {
    findings.push(
      `Vertical mean of ${check.meanZ.toFixed(3)} m suggests a height-reference problem. ` +
        'Check h vs H, the geoid model and the antenna/target heights before reprocessing (§65, §238).',
    );
  }
  return { gcp, check, generalisationRatio: ratio, findings };
}

/**
 * ERROR PROPAGATION — Spec §154.
 * Independent random errors combine in quadrature:
 *   σ_total = √(Σ σᵢ²)
 * Systematic errors do not — they add directly. Mixing the two is a common
 * way to understate an error budget.
 */
export function combineRandom(sigmas: number[]): number {
  return Math.sqrt(sigmas.reduce((acc, s) => acc + s * s, 0));
}

export function combineSystematic(biases: number[]): number {
  return biases.reduce((acc, b) => acc + b, 0);
}

export interface ErrorBudgetItem {
  source: string;
  sigmaM: number;
  kind: 'random' | 'systematic';
}

export function errorBudget(items: ErrorBudgetItem[]): {
  randomM: number;
  systematicM: number;
  totalM: number;
  dominant: string;
} {
  const random = combineRandom(items.filter((i) => i.kind === 'random').map((i) => i.sigmaM));
  const systematic = combineSystematic(
    items.filter((i) => i.kind === 'systematic').map((i) => i.sigmaM),
  );
  const dominant =
    items.reduce<ErrorBudgetItem | null>(
      (max, i) => (max === null || Math.abs(i.sigmaM) > Math.abs(max.sigmaM) ? i : max),
      null,
    )?.source ?? '—';
  return {
    randomM: random,
    systematicM: systematic,
    totalM: Math.abs(systematic) + random,
    dominant,
  };
}
