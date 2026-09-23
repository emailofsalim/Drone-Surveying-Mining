/**
 * COORDINATE ENGINE — Spec §60–§70, §165, §236 (metadata-first UX).
 *
 * Rule: a coordinate without its reference metadata is not a coordinate, it is
 * three numbers. Every value carried by the application therefore travels with
 * its CRS, vertical reference, units, epoch, source and quality. The engine
 * refuses to compare or difference coordinates whose references disagree —
 * that refusal is the lesson (§237 "Why does the mine move?").
 */

import type { Provenance } from '../provenance/provenance';

export type AxisOrder = 'easting-northing' | 'northing-easting' | 'lat-lon' | 'lon-lat';

export interface CrsDescriptor {
  /** EPSG code where one applies, e.g. 'EPSG:32644'. Local grids have none. */
  epsg?: string;
  name: string;
  kind: 'projected' | 'geographic' | 'local-engineering';
  datum: string;
  ellipsoid: string;
  /** Reference frame epoch, e.g. '2005.0' — matters for plate motion (§62). */
  epoch?: string;
  axisOrder: AxisOrder;
  units: string;
  /** UTM zone number and hemisphere when kind === 'projected' and UTM-based. */
  utmZone?: number;
  hemisphere?: 'N' | 'S';
}

export type HeightType =
  | 'ellipsoidal'
  | 'orthometric'
  | 'above-ground-level'
  | 'above-takeoff'
  | 'local-RL'
  | 'unknown';

export interface HeightDescriptor {
  type: HeightType;
  /** e.g. 'EGM2008 geoid', 'Mine benchmark BM-07', 'WGS84 ellipsoid'. */
  reference: string;
  units: string;
}

export interface Coordinate {
  /** Easting / longitude, in crs.units. */
  x: number;
  /** Northing / latitude, in crs.units. */
  y: number;
  /** Height value, in height.units. May be undefined for 2D data. */
  z?: number;
  crs: CrsDescriptor;
  height?: HeightDescriptor;
  source: string;
  quality: string;
  provenance?: Provenance;
}

export class ReferenceMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceMismatchError';
  }
}

/** Two CRS descriptors describe the same frame only if all of this matches. */
export function sameCrs(a: CrsDescriptor, b: CrsDescriptor): boolean {
  return (
    a.name === b.name &&
    a.datum === b.datum &&
    a.ellipsoid === b.ellipsoid &&
    a.units === b.units &&
    a.axisOrder === b.axisOrder &&
    (a.epsg ?? '') === (b.epsg ?? '') &&
    (a.epoch ?? '') === (b.epoch ?? '') &&
    (a.utmZone ?? 0) === (b.utmZone ?? 0) &&
    (a.hemisphere ?? '') === (b.hemisphere ?? '')
  );
}

export function describeMismatch(a: CrsDescriptor, b: CrsDescriptor): string[] {
  const diffs: string[] = [];
  const push = (field: string, av: unknown, bv: unknown) => {
    if ((av ?? '') !== (bv ?? '')) diffs.push(`${field}: "${av ?? '—'}" vs "${bv ?? '—'}"`);
  };
  push('CRS name', a.name, b.name);
  push('EPSG', a.epsg, b.epsg);
  push('datum', a.datum, b.datum);
  push('ellipsoid', a.ellipsoid, b.ellipsoid);
  push('epoch', a.epoch, b.epoch);
  push('axis order', a.axisOrder, b.axisOrder);
  push('units', a.units, b.units);
  push('UTM zone', a.utmZone, b.utmZone);
  push('hemisphere', a.hemisphere, b.hemisphere);
  return diffs;
}

/**
 * Plane distance between two coordinates.
 * Throws unless both sit in the same declared frame — the engine will not
 * silently assume a project CRS (§209).
 */
export function planeDistance(a: Coordinate, b: Coordinate): number {
  if (!sameCrs(a.crs, b.crs)) {
    throw new ReferenceMismatchError(
      'Refusing to compute a distance across different reference systems.\n' +
        describeMismatch(a.crs, b.crs)
          .map((d) => `  • ${d}`)
          .join('\n'),
    );
  }
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Height difference. Requires identical height type AND reference:
 * subtracting an ellipsoidal height from an orthometric one is meaningless
 * even though both are "metres" (§65, §238).
 */
export function heightDifference(a: Coordinate, b: Coordinate): number {
  if (a.z === undefined || b.z === undefined) {
    throw new ReferenceMismatchError('One of the coordinates has no height component.');
  }
  if (!a.height || !b.height) {
    throw new ReferenceMismatchError(
      'A height without a declared type and reference cannot be differenced. Declare it first.',
    );
  }
  if (a.height.type !== b.height.type || a.height.reference !== b.height.reference) {
    throw new ReferenceMismatchError(
      `Height reference mismatch: "${a.height.type} / ${a.height.reference}" vs ` +
        `"${b.height.type} / ${b.height.reference}". These are different vertical quantities.`,
    );
  }
  if (a.height.units !== b.height.units) {
    throw new ReferenceMismatchError(
      `Height unit mismatch: ${a.height.units} vs ${b.height.units}.`,
    );
  }
  return b.z - a.z;
}

/** Metadata-first rendering payload (§236) — shown before the numbers. */
export function coordinateMetadata(c: Coordinate): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'CRS', value: c.crs.epsg ? `${c.crs.name} (${c.crs.epsg})` : c.crs.name },
    { label: 'CRS kind', value: c.crs.kind },
    { label: 'Datum', value: c.crs.datum },
    { label: 'Ellipsoid', value: c.crs.ellipsoid },
    { label: 'Axis order', value: c.crs.axisOrder },
    { label: 'Horizontal units', value: c.crs.units },
  ];
  if (c.crs.epoch) rows.push({ label: 'Epoch', value: c.crs.epoch });
  if (c.crs.utmZone) {
    rows.push({ label: 'UTM zone', value: `${c.crs.utmZone}${c.crs.hemisphere ?? ''}` });
  }
  rows.push(
    {
      label: 'Height type',
      value: c.height ? `${c.height.type} (${c.height.reference})` : 'NOT DECLARED',
    },
    { label: 'Height units', value: c.height?.units ?? '—' },
    { label: 'Source', value: c.source },
    { label: 'Quality', value: c.quality },
  );
  return rows;
}

/**
 * AXIS-ORDER TRAP — Spec §68, §237.
 * Reading (E,N) data as (N,E) reflects the site about the 45° line. The
 * displacement is usually enormous, which is why this failure is normally
 * obvious — unlike a wrong datum, which is small enough to be believed.
 */
export function swapAxes(c: Coordinate): Coordinate {
  return { ...c, x: c.y, y: c.x, source: `${c.source} [AXES SWAPPED]` };
}

/** Distance the site appears to move when a coordinate is misread (§237). */
export function apparentShift(original: Coordinate, altered: Coordinate): number {
  return Math.hypot(altered.x - original.x, altered.y - original.y);
}
