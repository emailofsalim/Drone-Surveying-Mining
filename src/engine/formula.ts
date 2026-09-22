/**
 * FORMULA ENGINE — Spec §162, §232 ("ask before calculating"), §233 ("show your
 * work"), §234 (dimensional analysis).
 *
 * A formula is never a bare number. Evaluating one returns the substituted
 * expression, the dimensional check and the stated assumptions, so the learner
 * can audit the result rather than trust it.
 */

import { convert, dimensionOf, formatNumber, qty, type Dimension, type Quantity } from './units/units';

export interface FormulaVariable {
  symbol: string;
  name: string;
  /** Unit the evaluator expects. Inputs in other units are converted first. */
  unit: string;
  description: string;
}

export interface Formula {
  id: string;
  title: string;
  /** Human-readable expression, rendered as-is in the UI. */
  expression: string;
  /** Markdown/LaTeX-free plain statement of what the formula means. */
  definition: string;
  variables: FormulaVariable[];
  result: { symbol: string; name: string; unit: string };
  assumptions: string[];
  limitations: string[];
  /** Questions that must be answered before the number means anything (§232). */
  preconditions: string[];
  compute: (inputs: Record<string, number>) => number;
  category: 'camera' | 'geodesy' | 'height' | 'flight' | 'survey' | 'qaqc';
}

export interface EvaluationStep {
  label: string;
  detail: string;
}

export interface Evaluation {
  formula: Formula;
  inputs: Record<string, Quantity>;
  result: Quantity;
  /** Expression with values substituted — the "show your work" line (§233). */
  substitution: string;
  /** Dimensional analysis line (§234). */
  dimensionalAnalysis: string;
  steps: EvaluationStep[];
  warnings: string[];
}

export class FormulaRegistry {
  private readonly formulas = new Map<string, Formula>();

  register(...formulas: Formula[]): this {
    for (const f of formulas) {
      if (this.formulas.has(f.id)) throw new Error(`Duplicate formula id "${f.id}"`);
      this.formulas.set(f.id, f);
    }
    return this;
  }

  get(id: string): Formula {
    const f = this.formulas.get(id);
    if (!f) throw new Error(`Unknown formula "${id}"`);
    return f;
  }

  all(): Formula[] {
    return [...this.formulas.values()];
  }

  byCategory(category: Formula['category']): Formula[] {
    return this.all().filter((f) => f.category === category);
  }

  /** Free-text search across title, expression, definition and variables (§162). */
  search(query: string): Formula[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.all();
    return this.all().filter((f) =>
      [f.title, f.expression, f.definition, ...f.variables.map((v) => `${v.symbol} ${v.name}`)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }

  evaluate(id: string, inputs: Record<string, Quantity>): Evaluation {
    const formula = this.get(id);
    const warnings: string[] = [];
    const normalised: Record<string, number> = {};
    const shown: Record<string, Quantity> = {};

    for (const variable of formula.variables) {
      const given = inputs[variable.symbol];
      if (given === undefined) {
        throw new Error(`Missing input "${variable.symbol}" (${variable.name}) for ${formula.id}`);
      }
      // convert() throws on a dimension mismatch — the unit engine makes the
      // error visible instead of silently scaling (§163).
      const converted = convert(given, variable.unit);
      normalised[variable.symbol] = converted.value;
      shown[variable.symbol] = given;
      if (!Number.isFinite(converted.value)) {
        warnings.push(`${variable.symbol} is not a finite number.`);
      }
    }

    const value = formula.compute(normalised);
    if (!Number.isFinite(value)) {
      warnings.push('Result is not finite — check for a zero denominator or an out-of-range input.');
    }

    const substitution = substitute(formula, normalised);
    const dimensionalAnalysis = dimensionLine(formula);

    const steps: EvaluationStep[] = [
      { label: 'Formula', detail: formula.expression },
      { label: 'Substitution', detail: substitution },
      { label: 'Dimensional analysis', detail: dimensionalAnalysis },
      {
        label: 'Result',
        detail: `${formula.result.symbol} = ${formatNumber(value, 6)} ${formula.result.unit}`,
      },
    ];

    return {
      formula,
      inputs: shown,
      result: qty(value, formula.result.unit),
      substitution,
      dimensionalAnalysis,
      steps,
      warnings,
    };
  }
}

function substitute(formula: Formula, values: Record<string, number>): string {
  let out = formula.expression;
  // Longest symbols first so "H_agl" is not partially replaced by "H".
  const symbols = formula.variables.map((v) => v.symbol).sort((a, b) => b.length - a.length);
  for (const symbol of symbols) {
    const raw = values[symbol];
    if (raw === undefined) continue;
    const variable = formula.variables.find((v) => v.symbol === symbol)!;
    const replacement = `(${formatNumber(raw, 6)} ${variable.unit})`;
    out = out.split(symbol).join(replacement);
  }
  return out;
}

function dimensionLine(formula: Formula): string {
  const parts = formula.variables.map((v) => `[${dimensionOf(v.unit) as Dimension}]`);
  return `${parts.join(' , ')}  ⇒  [${dimensionOf(formula.result.unit)}] in ${formula.result.unit}`;
}

export const registry = new FormulaRegistry();
