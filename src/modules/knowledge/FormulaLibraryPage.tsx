/**
 * FORMULA LIBRARY — Spec §162, §232, §233, §234.
 * Searchable, and every entry shows the questions to answer before the number
 * is used, not after.
 */

import { useMemo, useState } from 'react';
import { registry } from '../../data/formulas';
import type { Formula } from '../../engine/formula';
import { qty, UNITS, UnitMismatchError, convert } from '../../engine/units/units';
import { Callout, FormulaWorking, PageHeader } from '../../components/ui';

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'camera', label: 'Camera' },
  { value: 'survey', label: 'Survey design' },
  { value: 'geodesy', label: 'Geodesy' },
  { value: 'height', label: 'Height' },
  { value: 'qaqc', label: 'QA/QC' },
];

export function FormulaLibraryPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [openId, setOpenId] = useState<string | null>('gsd.sensor');

  const results = useMemo(() => {
    const found = registry.search(query);
    return category === 'all' ? found : found.filter((f) => f.category === category);
  }, [query, category]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phase 01 — formula engine"
        title="No formula returns a bare number"
        lede="Every entry carries its variables, its units, its substitution, its dimensional analysis, its assumptions, its limitations — and the questions that must be answered before the result means anything."
      />

      <div className="row">
        <input
          type="text"
          value={query}
          placeholder="Search formulas, variables or definitions…"
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 420 }}
          aria-label="Search formulas"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ maxWidth: 200 }} aria-label="Category">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="small faint">
          {results.length} of {registry.all().length}
        </span>
      </div>

      <div className="stack">
        {results.map((formula) => (
          <FormulaCard
            key={formula.id}
            formula={formula}
            open={openId === formula.id}
            onToggle={() => setOpenId(openId === formula.id ? null : formula.id)}
          />
        ))}
        {results.length === 0 ? (
          <p className="muted">No formula matches that search.</p>
        ) : null}
      </div>

      <UnitEngineDemo />
    </div>
  );
}

function FormulaCard({
  formula,
  open,
  onToggle,
}: {
  formula: Formula;
  open: boolean;
  onToggle: () => void;
}) {
  // A representative evaluation so the card is never an abstract statement.
  const sample = useMemo(() => {
    const inputs: Record<string, ReturnType<typeof qty>> = {};
    for (const v of formula.variables) {
      inputs[v.symbol] = qty(SAMPLE_VALUES[`${formula.id}:${v.symbol}`] ?? 1, v.unit);
    }
    try {
      return registry.evaluate(formula.id, inputs);
    } catch {
      return null;
    }
  }, [formula]);

  return (
    <div className="card">
      <button
        className="ghost"
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: '100%', textAlign: 'left', padding: 0, border: 0, background: 'none' }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>{formula.title}</h3>
          <span className="badge">{formula.category}</span>
        </div>
        <code style={{ color: 'var(--c-accent)' }}>{formula.expression}</code>
      </button>

      <p className="small muted" style={{ marginTop: 'var(--sp-2)' }}>
        {formula.definition}
      </p>

      {open ? (
        <div className="stack">
          <table className="data">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Variable</th>
                <th>Unit</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {formula.variables.map((v) => (
                <tr key={v.symbol}>
                  <td className="num">{v.symbol}</td>
                  <td>{v.name}</td>
                  <td className="num">{v.unit}</td>
                  <td className="small muted">{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {sample ? (
            <>
              <p className="panel-title" style={{ marginBottom: 0 }}>
                Worked example
              </p>
              <FormulaWorking evaluation={sample} />
            </>
          ) : null}

          <div className="grid grid-3">
            <div className="panel">
              <p className="panel-title">Ask before calculating (§232)</p>
              <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
                {formula.preconditions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="panel">
              <p className="panel-title">Assumptions</p>
              <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
                {formula.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div className="panel">
              <p className="panel-title">Limitations</p>
              <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
                {formula.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Representative inputs so each worked example is realistic rather than 1.0. */
const SAMPLE_VALUES: Record<string, number> = {
  'gsd.sensor:H': 110,
  'gsd.sensor:Sw': 13.2,
  'gsd.sensor:f': 8.8,
  'gsd.sensor:Wpx': 5472,
  'gsd.pixelPitch:H': 110,
  'gsd.pixelPitch:p': 0.0024,
  'gsd.pixelPitch:f': 8.8,
  'overlap.forward:d': 16,
  'overlap.forward:L': 80,
  'mission.imageSpacing:v': 7,
  'mission.imageSpacing:t': 2.3,
  'camera.motionBlur:v': 7,
  'camera.motionBlur:te': 0.001,
  'camera.motionBlur:GSD': 0.0275,
  'height.hHN:H': 515.11,
  'height.hHN:N': 46.31,
  'height.trigonometric:S': 148.372,
  'height.trigonometric:Z': 87.4215,
  'height.trigonometric:HI': 1.512,
  'height.trigonometric:HT': 1.7,
  'north.gridFromMagnetic:Am': 47.5,
  'north.gridFromMagnetic:D': -1.35,
  'north.gridFromMagnetic:y': 0.5726,
  'north.lateralError:L': 600,
  'north.lateralError:da': 1.92,
  'qaqc.rmse:Sr2': 0.0086,
  'qaqc.rmse:n': 4,
  'volume.prism:A': 28353,
  'volume.prism:dhm': 9.7,
};

/** Live demonstration that a dimension mismatch is refused, not scaled (§163). */
function UnitEngineDemo() {
  const [value, setValue] = useState(100);
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('ft');

  let output = '';
  let error = '';
  try {
    const result = convert(qty(value, from), to);
    output = `${result.value.toPrecision(8)} ${to}`;
  } catch (e) {
    error = e instanceof UnitMismatchError ? e.message : String(e);
  }

  const options = Object.keys(UNITS);

  return (
    <div className="card">
      <h3>Unit engine</h3>
      <p className="small muted">
        Conversions across dimensions are refused rather than performed. Try metres to degrees.
      </p>
      <div className="row">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(Number.parseFloat(e.target.value) || 0)}
          style={{ maxWidth: 140 }}
          aria-label="Value"
        />
        <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 120 }} aria-label="From unit">
          {options.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <span className="faint">→</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 120 }} aria-label="To unit">
          {options.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <Callout tone="danger" title="Refused.">
          <span className="mono small">{error}</span>
        </Callout>
      ) : (
        <p className="formula" style={{ marginTop: 'var(--sp-3)' }}>
          {value} {from} = <span className="result">{output}</span>
        </p>
      )}
    </div>
  );
}
