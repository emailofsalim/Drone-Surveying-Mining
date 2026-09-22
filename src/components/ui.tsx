/**
 * Shared presentation components for the design system (Phase 01).
 * These enforce specification rules at the UI layer:
 *  - simulated output is always labelled (§167)
 *  - a coordinate/height shows its metadata before its value (§236)
 *  - a calculated number always shows its working (§233, §234)
 */

import type { ReactNode } from 'react';
import { MODEL_BANNER, SIMULATED_BANNER, WORKFLOW_BANNER } from '../engine/provenance/provenance';
import type { Evaluation } from '../engine/formula';
import { formatNumber } from '../engine/units/units';

export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {lede ? <p className="lede">{lede}</p> : null}
      {children}
    </header>
  );
}

export function SimulatedBanner({ kind = 'data' }: { kind?: 'data' | 'workflow' | 'model' }) {
  const text =
    kind === 'workflow' ? WORKFLOW_BANNER : kind === 'model' ? MODEL_BANNER : SIMULATED_BANNER;
  return (
    <p className="sim-banner" role="note">
      <span aria-hidden="true">▲</span>
      {text}
    </p>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`callout ${tone}`}>
      {title ? <strong>{title}</strong> : null}
      {title ? ' ' : null}
      {children}
    </div>
  );
}

export function Readout({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: number | string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="readout">
      <span className="rl">{label}</span>
      <span className="rv">{typeof value === 'number' ? formatNumber(value, 4) : value}</span>
      {unit ? <span className="ru">{unit}</span> : null}
      {hint ? <span className="ru faint">{hint}</span> : null}
    </div>
  );
}

export function MetadataList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <dl className="kv">
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'contents' }}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "Show your work" block — Spec §233, §234.
 * Never renders a bare result: formula, substitution, dimensions, then value.
 */
export function FormulaWorking({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="formula">
      {evaluation.steps.map((step) => (
        <span key={step.label} className="step">
          <span className="step-label">{step.label}</span>
          <span className={step.label === 'Result' ? 'result' : undefined}>{step.detail}</span>
        </span>
      ))}
      {evaluation.warnings.length > 0 ? (
        <span className="step">
          <span className="step-label">Warnings</span>
          {evaluation.warnings.map((w) => (
            <span key={w} style={{ display: 'block', color: 'var(--c-warn)' }}>
              {w}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** The five questions every topic must answer — Spec §1. */
export function FiveAnswers({
  five,
}: {
  five: { what: string; how: string; operate: string; affectsSurvey: string; proveTrust: string };
}) {
  const rows: Array<[string, string]> = [
    ['What is it?', five.what],
    ['How does it work?', five.how],
    ['How do I operate it?', five.operate],
    ['How does it affect the survey?', five.affectsSurvey],
    ['How do I prove the result is trustworthy?', five.proveTrust],
  ];
  return (
    <div className="panel">
      <p className="panel-title">The five required answers (spec §1)</p>
      <dl className="kv">
        {rows.map(([q, a]) => (
          <div key={q} style={{ display: 'contents' }}>
            <dt>{q}</dt>
            <dd style={{ fontFamily: 'var(--font-sans)' }}>{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  unit,
  min,
  max,
  step = 'any',
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number | 'any';
}) {
  return (
    <label className="field">
      <span className="label-row">
        <span className="name">{label}</span>
        <span className="hint">{unit ?? hint}</span>
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number.parseFloat(e.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
      />
      {unit && hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="field">
      <span className="label-row">
        <span className="name">{label}</span>
        <span className="hint num">{format ? format(value) : formatNumber(value, 2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="label-row">
        <span className="name">{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
