/**
 * PROVENANCE + SIMULATED-DATA TAGGING — Spec §111, §159, §161, §167, §168.
 *
 * Every number the application shows must be able to answer:
 * where did it come from, how was it produced, and is it real or simulated?
 * Nothing in this project is a real mine observation.
 */

export type DataOrigin =
  | 'SIMULATED_TRAINING_DATA'
  | 'SIMULATED_WORKFLOW'
  | 'DERIVED_CALCULATION'
  | 'USER_INPUT'
  | 'REFERENCE_CONSTANT';

export type Quality = 'indicative' | 'training-grade' | 'unvalidated' | 'not-applicable';

export interface Provenance {
  origin: DataOrigin;
  /** What produced the value: engine name, formula id, or user action. */
  producedBy: string;
  /** Free-text statement of the model's limits — always required (§228). */
  limitations: string;
  quality: Quality;
  /** ISO date the value/assumption was generated or last reviewed. */
  asOf?: string;
  /** Reference title/URL when the value follows a published model (§168). */
  reference?: string;
}

export interface Tagged<T> {
  value: T;
  provenance: Provenance;
}

export function tag<T>(value: T, provenance: Provenance): Tagged<T> {
  return { value, provenance };
}

/** Standard banner text. The UI must never render simulated output unlabelled. */
export const SIMULATED_BANNER = 'SIMULATED TRAINING DATA — NOT A REAL MINE OBSERVATION';
export const WORKFLOW_BANNER = 'SIMULATED WORKFLOW — NOT OFFICIAL SOFTWARE UI';
export const MODEL_BANNER = 'SIMPLIFIED TRAINING MODEL';

export const simulated = (producedBy: string, limitations: string): Provenance => ({
  origin: 'SIMULATED_TRAINING_DATA',
  producedBy,
  limitations,
  quality: 'training-grade',
});

export const derived = (producedBy: string, limitations: string): Provenance => ({
  origin: 'DERIVED_CALCULATION',
  producedBy,
  limitations,
  quality: 'indicative',
});

/**
 * Data lineage node — Spec §111, §172.
 * A deliverable is only defensible if each step back to the raw observation
 * is recorded.
 */
export interface LineageNode {
  id: string;
  stage: string;
  description: string;
  inputs: string[];
  provenance: Provenance;
}

export function traceLineage(nodes: LineageNode[], id: string): LineageNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: LineageNode[] = [];
  const seen = new Set<string>();
  const walk = (nodeId: string) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) return;
    out.push(node);
    node.inputs.forEach(walk);
  };
  walk(id);
  return out;
}
