/**
 * UNIT ENGINE — Spec §163, §234 (dimensional analysis), §69 (units).
 *
 * Design rule from the specification: "Make unit mismatch visible."
 * Conversions therefore never happen silently. A `Quantity` always carries its
 * unit, and `convert()` throws when two units belong to different dimensions
 * instead of guessing.
 */

export type Dimension =
  | 'length'
  | 'angle'
  | 'speed'
  | 'area'
  | 'volume'
  | 'mass'
  | 'force'
  | 'pressure'
  | 'time'
  | 'dimensionless';

export interface UnitDef {
  /** Canonical symbol as shown in the UI. */
  symbol: string;
  dimension: Dimension;
  /** Multiply a value in this unit by `toBase` to obtain the SI base value. */
  toBase: number;
  label: string;
}

/** SI base unit per dimension. */
export const BASE_UNIT: Record<Dimension, string> = {
  length: 'm',
  angle: 'rad',
  speed: 'm/s',
  area: 'm²',
  volume: 'm³',
  mass: 'kg',
  force: 'N',
  pressure: 'Pa',
  time: 's',
  dimensionless: '-',
};

export const UNITS: Record<string, UnitDef> = {
  // length
  mm: { symbol: 'mm', dimension: 'length', toBase: 1e-3, label: 'millimetre' },
  cm: { symbol: 'cm', dimension: 'length', toBase: 1e-2, label: 'centimetre' },
  m: { symbol: 'm', dimension: 'length', toBase: 1, label: 'metre' },
  km: { symbol: 'km', dimension: 'length', toBase: 1e3, label: 'kilometre' },
  ft: { symbol: 'ft', dimension: 'length', toBase: 0.3048, label: 'international foot' },
  in: { symbol: 'in', dimension: 'length', toBase: 0.0254, label: 'inch' },
  µm: { symbol: 'µm', dimension: 'length', toBase: 1e-6, label: 'micrometre' },

  // angle
  rad: { symbol: 'rad', dimension: 'angle', toBase: 1, label: 'radian' },
  deg: { symbol: 'deg', dimension: 'angle', toBase: Math.PI / 180, label: 'degree' },
  gon: { symbol: 'gon', dimension: 'angle', toBase: Math.PI / 200, label: 'gon / grad' },
  mil: { symbol: 'mil', dimension: 'angle', toBase: Math.PI / 3200, label: 'NATO mil' },

  // speed
  'm/s': { symbol: 'm/s', dimension: 'speed', toBase: 1, label: 'metre per second' },
  'km/h': { symbol: 'km/h', dimension: 'speed', toBase: 1 / 3.6, label: 'kilometre per hour' },
  kt: { symbol: 'kt', dimension: 'speed', toBase: 0.514444, label: 'knot' },

  // area
  'm²': { symbol: 'm²', dimension: 'area', toBase: 1, label: 'square metre' },
  ha: { symbol: 'ha', dimension: 'area', toBase: 1e4, label: 'hectare' },
  'km²': { symbol: 'km²', dimension: 'area', toBase: 1e6, label: 'square kilometre' },

  // volume
  'm³': { symbol: 'm³', dimension: 'volume', toBase: 1, label: 'cubic metre' },

  // mass / force / pressure / time
  kg: { symbol: 'kg', dimension: 'mass', toBase: 1, label: 'kilogram' },
  g: { symbol: 'g', dimension: 'mass', toBase: 1e-3, label: 'gram' },
  N: { symbol: 'N', dimension: 'force', toBase: 1, label: 'newton' },
  Pa: { symbol: 'Pa', dimension: 'pressure', toBase: 1, label: 'pascal' },
  s: { symbol: 's', dimension: 'time', toBase: 1, label: 'second' },
  min: { symbol: 'min', dimension: 'time', toBase: 60, label: 'minute' },
  h: { symbol: 'h', dimension: 'time', toBase: 3600, label: 'hour' },

  '-': { symbol: '-', dimension: 'dimensionless', toBase: 1, label: 'dimensionless' },
  px: { symbol: 'px', dimension: 'dimensionless', toBase: 1, label: 'pixel' },
  '%': { symbol: '%', dimension: 'dimensionless', toBase: 1e-2, label: 'percent' },
};

export interface Quantity {
  value: number;
  unit: string;
}

export class UnitMismatchError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(
      `Unit mismatch: cannot convert "${from}" (${dimensionOf(from)}) to "${to}" (${dimensionOf(to)}). ` +
        'This is a dimensional error, not a scaling error.',
    );
    this.name = 'UnitMismatchError';
  }
}

export function unitDef(symbol: string): UnitDef {
  const def = UNITS[symbol];
  if (!def) throw new Error(`Unknown unit "${symbol}". Register it in the unit engine first.`);
  return def;
}

export function dimensionOf(symbol: string): Dimension {
  return unitDef(symbol).dimension;
}

export function qty(value: number, unit: string): Quantity {
  unitDef(unit); // validates
  return { value, unit };
}

/** Convert between two units of the same dimension. Throws on mismatch (§163). */
export function convert(q: Quantity, to: string): Quantity {
  const from = unitDef(q.unit);
  const target = unitDef(to);
  if (from.dimension !== target.dimension) throw new UnitMismatchError(q.unit, to);
  return { value: (q.value * from.toBase) / target.toBase, unit: to };
}

/** Value expressed in the SI base unit of its dimension. */
export function toBase(q: Quantity): number {
  return q.value * unitDef(q.unit).toBase;
}

export function formatQuantity(q: Quantity, decimals = 3): string {
  return `${formatNumber(q.value, decimals)} ${q.unit}`;
}

export function formatNumber(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e7)) return value.toExponential(Math.min(decimals, 6));
  const fixed = value.toFixed(decimals);
  if (!fixed.includes('.')) return fixed;
  // Trim trailing zeros, then a trailing decimal point: 49.5000 → 49.5, 110.0000 → 110.
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;
