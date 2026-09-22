/**
 * DATA FORMAT, GIS, CAD AND EXPORT ENGINE — Spec §149–§151, §170–§172, Phases 33–34.
 *
 * The teaching point of the import/export lab (§171) is LOSS. Every export
 * between formats drops something, and what it drops is usually the metadata
 * that made the coordinate defensible in the first place. A DXF carries
 * geometry beautifully and carries no CRS at all — so a drawing that looks
 * perfect in CAD has silently shed the reference that gives its numbers
 * meaning (golden principle 8).
 *
 * Exports here are real, producible text (CSV, DXF, GeoJSON, a LAS header
 * description) so the learner can see exactly what survives.
 */

export interface FormatSpec {
  id: string;
  name: string;
  extension: string;
  stores: string[];
  commonUse: string;
  /** What this format does NOT preserve. */
  loses: string[];
  /** How, or whether, CRS metadata travels with the file. */
  crsHandling: string;
  binary: boolean;
}

export const FORMATS: FormatSpec[] = [
  {
    id: 'csv',
    name: 'CSV',
    extension: '.csv',
    stores: ['point coordinates', 'attributes', 'arbitrary columns'],
    commonUse: 'Control lists, checkpoint reports, exchange with almost anything.',
    loses: ['CRS', 'geometry type', 'topology', 'units', 'precision beyond what was written'],
    crsHandling:
      'NONE. A CSV is numbers and column headers. The CRS must travel in a separate document, ' +
      'and in practice this is where it gets lost.',
    binary: false,
  },
  {
    id: 'dxf',
    name: 'DXF',
    extension: '.dxf',
    stores: ['points', 'lines', 'polylines', 'text', 'layers', '3D elevations'],
    commonUse: 'Handing survey geometry to a CAD or mine-planning package.',
    loses: ['CRS', 'attributes beyond layer and text', 'raster data', 'point-cloud classification'],
    crsHandling:
      'NONE in the base specification. Coordinates are plain model-space numbers. Two correct DXFs ' +
      'on different grids look identical and overlay wrongly.',
    binary: false,
  },
  {
    id: 'geojson',
    name: 'GeoJSON',
    extension: '.geojson',
    stores: ['points', 'lines', 'polygons', 'attributes'],
    commonUse: 'Web mapping, lightweight vector exchange.',
    loses: ['non-WGS84 native storage', 'raster', 'complex CAD styling', 'z beyond a third ordinate'],
    crsHandling:
      'The current specification fixes GeoJSON to WGS 84 longitude/latitude. Writing projected ' +
      'grid coordinates into a GeoJSON produces a file that validates and is wrong.',
    binary: false,
  },
  {
    id: 'geotiff',
    name: 'GeoTIFF',
    extension: '.tif',
    stores: ['raster grids', 'orthomosaics', 'DSM/DTM', 'CRS tags', 'pixel scale', 'tie points'],
    commonUse: 'Orthomosaics and elevation rasters.',
    loses: ['vector geometry', 'point-level attributes', 'anything between pixel centres'],
    crsHandling: 'Carried in the file as GeoTIFF keys. One of the few formats that does this properly.',
    binary: true,
  },
  {
    id: 'las',
    name: 'LAS / LAZ',
    extension: '.las / .laz',
    stores: ['point cloud', 'classification', 'intensity', 'returns', 'GPS time', 'CRS (VLR)'],
    commonUse: 'Point-cloud exchange between processing and analysis software.',
    loses: ['surfaces', 'vector linework', 'imagery'],
    crsHandling: 'Carried in a variable-length record. LAZ is the losslessly compressed form.',
    binary: true,
  },
  {
    id: 'shp',
    name: 'Shapefile',
    extension: '.shp (+ .dbf, .shx, .prj)',
    stores: ['vector geometry', 'tabular attributes'],
    commonUse: 'Long-standing GIS interchange.',
    loses: ['field names beyond 10 characters', 'mixed geometry types', 'null vs zero distinction'],
    crsHandling:
      'In a sidecar .prj file — which is trivially separated from the .shp when a file is copied or ' +
      'emailed on its own.',
    binary: true,
  },
  {
    id: 'gpkg',
    name: 'GeoPackage',
    extension: '.gpkg',
    stores: ['vector', 'raster', 'attributes', 'CRS', 'multiple layers in one file'],
    commonUse: 'Modern single-file GIS container.',
    loses: ['CAD styling', 'point-cloud structure'],
    crsHandling: 'Stored in the container per layer. Nothing to separate from the data.',
    binary: true,
  },
  {
    id: 'kml',
    name: 'KML / KMZ',
    extension: '.kml / .kmz',
    stores: ['points', 'lines', 'polygons', 'styling', 'imagery overlays'],
    commonUse: 'Visualisation and briefing.',
    loses: ['projected coordinates', 'survey precision', 'attributes'],
    crsHandling:
      'Fixed to WGS 84 geographic with heights relative to a defined mode. It is a visualisation ' +
      'format; it is not a survey deliverable.',
    binary: false,
  },
];

export function formatById(id: string): FormatSpec {
  const found = FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown format "${id}"`);
  return found;
}

export interface ConversionLoss {
  from: FormatSpec;
  to: FormatSpec;
  /** Things the source held that the target cannot. */
  lost: string[];
  crsSurvives: boolean;
  severity: 'safe' | 'lossy' | 'dangerous';
  advice: string;
}

/** What a conversion costs (§171). */
export function assessConversion(fromId: string, toId: string): ConversionLoss {
  const from = formatById(fromId);
  const to = formatById(toId);

  const targetStores = new Set(to.stores.map((s) => s.toLowerCase()));
  const lost = from.stores.filter((s) => !targetStores.has(s.toLowerCase()));

  const sourceHasCrs = !from.crsHandling.startsWith('NONE');
  const targetHasCrs = !to.crsHandling.startsWith('NONE');
  const crsSurvives = !sourceHasCrs || targetHasCrs;

  let severity: ConversionLoss['severity'] = 'safe';
  if (lost.length > 0) severity = 'lossy';
  if (sourceHasCrs && !targetHasCrs) severity = 'dangerous';

  return {
    from,
    to,
    lost,
    crsSurvives,
    severity,
    advice:
      severity === 'dangerous'
        ? `${from.name} carries its reference system; ${to.name} does not. After this export the ` +
          'coordinates are numbers without a frame. Record the CRS in the deliverable register and ' +
          'in the report, because the file will not carry it (golden principle 8).'
        : severity === 'lossy'
          ? `${to.name} cannot hold everything ${from.name} does. Keep the source as the record of ` +
            'the observation; the export is a derived product, not a replacement.'
          : `${to.name} can carry what ${from.name} holds. Still keep the source: an export is a ` +
            'copy, and the raw observation is the evidence (§111).',
  };
}

/* ----------------------------- GIS layers -------------------------- */

export type LayerKind = 'vector-point' | 'vector-line' | 'vector-polygon' | 'raster' | 'pointcloud';

export interface GisLayer {
  id: string;
  name: string;
  kind: LayerKind;
  /** The CRS the layer's own data is stored in. */
  crs: string;
  /** The vertical reference, where the layer carries z. */
  verticalReference?: string;
  source: string;
  visible: boolean;
}

export interface LayerStackIssue {
  layerId: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Check a layer stack for the classic GIS failure: layers drawn together that
 * are not actually in the same frame. They will render, they will overlay, and
 * they will be wrong (§149, §237).
 */
export function validateLayerStack(layers: GisLayer[], projectCrs: string): LayerStackIssue[] {
  const issues: LayerStackIssue[] = [];
  for (const layer of layers) {
    if (layer.crs !== projectCrs) {
      issues.push({
        layerId: layer.id,
        severity: 'error',
        message:
          `"${layer.name}" is stored in ${layer.crs} but the project is ${projectCrs}. It will draw ` +
          'on the map regardless. Reproject it explicitly, or state the transformation used — never ' +
          'let the display do it silently.',
      });
    }
    if ((layer.kind === 'raster' || layer.kind === 'pointcloud') && !layer.verticalReference) {
      issues.push({
        layerId: layer.id,
        severity: 'warning',
        message:
          `"${layer.name}" carries elevation with no declared vertical reference. Any height read ` +
          'from it, or any volume computed against it, is undefined (§65).',
      });
    }
  }
  return issues;
}

/* ------------------------------ exporters -------------------------- */

export interface ExportPoint {
  id: string;
  e: number;
  n: number;
  rl: number;
  code?: string;
  layer?: string;
}

export interface ExportMetadata {
  projectName: string;
  crs: string;
  verticalReference: string;
  units: string;
  producedOn: string;
  source: string;
}

/**
 * CSV export. Note the header block: since CSV itself cannot carry a CRS, the
 * only honest thing to do is write it into the file as comments AND state that
 * it is not machine-readable.
 */
export function exportCsv(points: ExportPoint[], metadata: ExportMetadata): string {
  const header = [
    `# ${metadata.projectName}`,
    `# SIMULATED TRAINING DATA — not a real mine observation`,
    `# CRS: ${metadata.crs}`,
    `# Vertical reference: ${metadata.verticalReference}`,
    `# Units: ${metadata.units}`,
    `# Produced: ${metadata.producedOn}`,
    `# Source: ${metadata.source}`,
    `# NOTE: CSV cannot carry a coordinate reference system. The lines above are`,
    `# comments for a human reader and will be ignored by most software.`,
    'id,easting,northing,rl,code',
  ].join('\n');

  const rows = points.map(
    (p) => `${p.id},${p.e.toFixed(3)},${p.n.toFixed(3)},${p.rl.toFixed(3)},${p.code ?? ''}`,
  );
  return `${header}\n${rows.join('\n')}\n`;
}

/**
 * Minimal but valid DXF R12 with POINT and TEXT entities on named layers.
 * Deliberately shows that no CRS travels with it.
 */
export function exportDxf(points: ExportPoint[], metadata: ExportMetadata): string {
  const layers = [...new Set(points.map((p) => p.layer ?? 'SURVEY'))];

  const out: string[] = [];
  const pair = (code: number, value: string | number) => out.push(String(code), String(value));

  // HEADER
  pair(0, 'SECTION');
  pair(2, 'HEADER');
  pair(9, '$INSUNITS');
  pair(70, 6); // metres
  pair(0, 'ENDSEC');

  // TABLES — layer definitions
  pair(0, 'SECTION');
  pair(2, 'TABLES');
  pair(0, 'TABLE');
  pair(2, 'LAYER');
  pair(70, layers.length);
  layers.forEach((layer, i) => {
    pair(0, 'LAYER');
    pair(2, layer);
    pair(70, 0);
    pair(62, (i % 7) + 1);
    pair(6, 'CONTINUOUS');
  });
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  // ENTITIES
  pair(0, 'SECTION');
  pair(2, 'ENTITIES');

  // The metadata can only be carried as a visible note — DXF has nowhere else.
  pair(0, 'TEXT');
  pair(8, 'NOTES');
  pair(10, points[0]?.e ?? 0);
  pair(20, (points[0]?.n ?? 0) + 20);
  pair(30, 0);
  pair(40, 2.5);
  pair(
    1,
    `SIMULATED - ${metadata.projectName} - CRS ${metadata.crs} - VERT ${metadata.verticalReference}`,
  );

  for (const point of points) {
    pair(0, 'POINT');
    pair(8, point.layer ?? 'SURVEY');
    pair(10, point.e.toFixed(3));
    pair(20, point.n.toFixed(3));
    pair(30, point.rl.toFixed(3));

    pair(0, 'TEXT');
    pair(8, point.layer ?? 'SURVEY');
    pair(10, (point.e + 1).toFixed(3));
    pair(20, (point.n + 1).toFixed(3));
    pair(30, point.rl.toFixed(3));
    pair(40, 1.5);
    pair(1, `${point.id} ${point.rl.toFixed(2)}`);
  }

  pair(0, 'ENDSEC');
  pair(0, 'EOF');

  return out.join('\n') + '\n';
}

/** GeoJSON export, with the CRS caveat made explicit in a property. */
export function exportGeoJson(points: ExportPoint[], metadata: ExportMetadata): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      // Non-standard but honest: the spec fixes GeoJSON to WGS 84, and these
      // coordinates are a local grid. Saying so beats pretending.
      _warning:
        'SIMULATED TRAINING DATA. Coordinates are in a local engineering grid, NOT WGS 84 ' +
        'longitude/latitude. This file therefore does not conform to the GeoJSON specification ' +
        'and must not be handed to software that assumes it does.',
      _crs: metadata.crs,
      _verticalReference: metadata.verticalReference,
      features: points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.e, p.n, p.rl] },
        properties: { id: p.id, code: p.code ?? null, layer: p.layer ?? 'SURVEY' },
      })),
    },
    null,
    2,
  );
}

/** What a LAS header would carry — described rather than written as binary. */
export function describeLasHeader(pointCount: number, metadata: ExportMetadata): Array<{ field: string; value: string }> {
  return [
    { field: 'File signature', value: 'LASF' },
    { field: 'Version', value: '1.4' },
    { field: 'Point data record format', value: '6 (with GPS time, classification, intensity)' },
    { field: 'Number of point records', value: String(pointCount) },
    { field: 'CRS (VLR)', value: metadata.crs },
    { field: 'Vertical reference', value: metadata.verticalReference },
    { field: 'Scale factors', value: '0.001 (millimetre storage resolution)' },
    { field: 'Generating software', value: metadata.source },
    { field: 'Note', value: 'SIMULATED TRAINING DATA — synthetic cloud, not a real survey.' },
  ];
}
