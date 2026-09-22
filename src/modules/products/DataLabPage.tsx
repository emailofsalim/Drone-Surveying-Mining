/**
 * DATA FORMAT, GIS, CAD AND EXPORT LAB — Spec §149–§151, §170–§172, Phases 33–34.
 */

import { useMemo, useState } from 'react';
import {
  assessConversion,
  describeLasHeader,
  exportCsv,
  exportDxf,
  exportGeoJson,
  FORMATS,
  validateLayerStack,
  type ExportMetadata,
  type ExportPoint,
  type GisLayer,
} from '../../engine/gis/formats';
import { featureRl, MINE_CRS, MINE_FEATURES } from '../../data/mine';
import { Callout, PageHeader, SelectField, SimulatedBanner } from '../../components/ui';

const METADATA: ExportMetadata = {
  projectName: 'Hillock Ridge Mine (SIMULATED)',
  crs: MINE_CRS.name,
  verticalReference: 'Mine RL datum, BM-07 = 500.000 m (simulated)',
  units: 'm',
  producedOn: '2026-09-22',
  source: 'Drone Surveying in Mining — interactive training simulator',
};

const LAYERS: GisLayer[] = [
  { id: 'crest', name: 'Pit crest', kind: 'vector-line', crs: MINE_CRS.name, source: 'Simulated survey', visible: true },
  { id: 'control', name: 'Survey control', kind: 'vector-point', crs: MINE_CRS.name, verticalReference: 'Mine RL', source: 'Simulated survey', visible: true },
  { id: 'ortho', name: 'Orthomosaic', kind: 'raster', crs: MINE_CRS.name, verticalReference: 'Mine RL', source: 'Simulated processing', visible: true },
  { id: 'dtm', name: 'DTM', kind: 'raster', crs: MINE_CRS.name, source: 'Simulated processing', visible: true },
  { id: 'regional', name: 'Regional tenement boundary', kind: 'vector-polygon', crs: 'EPSG:4326', source: 'External', visible: true },
  { id: 'cloud', name: 'Classified point cloud', kind: 'pointcloud', crs: MINE_CRS.name, verticalReference: 'Mine RL', source: 'Simulated processing', visible: false },
];

export function DataLabPage() {
  const [fromId, setFromId] = useState('gpkg');
  const [toId, setToId] = useState('dxf');
  const [exportFormat, setExportFormat] = useState<'csv' | 'dxf' | 'geojson' | 'las'>('csv');

  const points: ExportPoint[] = useMemo(
    () =>
      MINE_FEATURES.filter((f) => f.kind === 'gcp' || f.kind === 'checkpoint' || f.kind === 'monument').map((f) => ({
        id: f.id,
        e: f.e,
        n: f.n,
        rl: featureRl(f),
        code: f.kind.toUpperCase(),
        layer: f.kind === 'gcp' ? 'CONTROL' : f.kind === 'checkpoint' ? 'CHECK' : 'MONUMENT',
      })),
    [],
  );

  const conversion = useMemo(() => assessConversion(fromId, toId), [fromId, toId]);
  const issues = useMemo(() => validateLayerStack(LAYERS, MINE_CRS.name), []);

  const preview = useMemo(() => {
    switch (exportFormat) {
      case 'csv':
        return exportCsv(points, METADATA);
      case 'dxf':
        return exportDxf(points.slice(0, 3), METADATA);
      case 'geojson':
        return exportGeoJson(points.slice(0, 3), METADATA);
      case 'las':
        return describeLasHeader(1_842_000, METADATA)
          .map((row) => `${row.field.padEnd(30)} ${row.value}`)
          .join('\n');
    }
  }, [exportFormat, points]);

  const download = () => {
    const extension = exportFormat === 'las' ? 'txt' : exportFormat;
    const blob = new Blob([preview], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulated-control.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phases 33 & 34 — formats, GIS and CAD"
        title="Every export loses something, and it is usually the metadata"
        lede="Geometry survives almost any conversion. The reference system frequently does not. A DXF that opens perfectly in CAD has shed the one thing that made its numbers mean a place on the ground."
      />

      <SimulatedBanner />

      {/* -------------------- format catalogue -------------------- */}

      <div className="card">
        <h3>Format catalogue</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Format</th>
              <th>Stores</th>
              <th>Loses</th>
              <th>CRS handling</th>
            </tr>
          </thead>
          <tbody>
            {FORMATS.map((format) => (
              <tr key={format.id}>
                <td>
                  <strong className="small">{format.name}</strong>
                  <br />
                  <span className="xs faint">{format.extension}</span>
                </td>
                <td className="small muted">{format.stores.join(', ')}</td>
                <td className="small muted">{format.loses.join(', ')}</td>
                <td className="small">
                  {format.crsHandling.startsWith('NONE') ? (
                    <span className="badge danger">no CRS</span>
                  ) : (
                    <span className="badge ok">carries CRS</span>
                  )}
                  <br />
                  <span className="xs muted">{format.crsHandling}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------- conversion lab --------------------- */}

      <div className="split">
        <div className="panel">
          <p className="panel-title">Conversion</p>
          <SelectField
            label="From"
            value={fromId}
            options={FORMATS.map((f) => ({ value: f.id, label: f.name }))}
            onChange={setFromId}
          />
          <SelectField
            label="To"
            value={toId}
            options={FORMATS.map((f) => ({ value: f.id, label: f.name }))}
            onChange={setToId}
          />
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>
              {conversion.from.name} → {conversion.to.name}
            </h3>
            <span className={`badge ${conversion.severity === 'dangerous' ? 'danger' : conversion.severity === 'lossy' ? 'partial' : 'ok'}`}>
              {conversion.severity}
            </span>
          </div>

          <div className="grid grid-2" style={{ marginTop: 'var(--sp-3)' }}>
            <div className="panel">
              <p className="panel-title">Lost in this conversion</p>
              {conversion.lost.length === 0 ? (
                <p className="small faint" style={{ margin: 0 }}>Nothing the source holds is dropped.</p>
              ) : (
                <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
                  {conversion.lost.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel">
              <p className="panel-title">CRS survives?</p>
              <p className="small" style={{ margin: 0 }}>
                {conversion.crsSurvives ? (
                  <span className="badge ok">yes</span>
                ) : (
                  <span className="badge danger">no</span>
                )}
              </p>
            </div>
          </div>

          <Callout tone={conversion.severity === 'dangerous' ? 'danger' : conversion.severity === 'lossy' ? 'warn' : 'ok'}>
            {conversion.advice}
          </Callout>
        </div>
      </div>

      {/* ------------------------ layer stack --------------------- */}

      <div className="card">
        <h3>GIS layer stack</h3>
        <p className="small muted">
          Project CRS: <span className="num">{MINE_CRS.name}</span>. Layers draw together whether or
          not they belong together — the map will not object.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Kind</th>
              <th>Stored CRS</th>
              <th>Vertical reference</th>
            </tr>
          </thead>
          <tbody>
            {LAYERS.map((layer) => {
              const layerIssues = issues.filter((i) => i.layerId === layer.id);
              return (
                <tr key={layer.id}>
                  <td>
                    <strong className="small">{layer.name}</strong>
                    {layerIssues.map((i) => (
                      <div key={i.message} className="xs" style={{ color: i.severity === 'error' ? 'var(--c-danger)' : 'var(--c-warn)' }}>
                        {i.message}
                      </div>
                    ))}
                  </td>
                  <td className="small muted">{layer.kind}</td>
                  <td className="num small">
                    {layer.crs === MINE_CRS.name ? (
                      <span className="badge ok">project</span>
                    ) : (
                      <span className="badge danger">{layer.crs}</span>
                    )}
                  </td>
                  <td className="small muted">{layer.verticalReference ?? <span className="badge partial">not declared</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Callout tone="danger" title="A layer in the wrong frame still draws.">
          Nothing in a GIS prevents a layer stored in one reference system from being displayed over
          another. It will render, it will look plausible, and every measurement taken across the
          two will be wrong. Reproject explicitly and record the transformation — never let the
          display do it silently (§149, §237).
        </Callout>
      </div>

      {/* ------------------------- exporters ---------------------- */}

      <div className="card">
        <h3>Export — see exactly what survives</h3>
        <div className="row">
          <div className="segmented" role="group" aria-label="Export format">
            {(['csv', 'dxf', 'geojson', 'las'] as const).map((format) => (
              <button key={format} aria-pressed={exportFormat === format} onClick={() => setExportFormat(format)}>
                {format.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="primary" onClick={download}>
            Download
          </button>
          <span className="xs faint">{points.length} control and check points from the virtual mine</span>
        </div>

        <pre
          className="formula"
          style={{ marginTop: 'var(--sp-3)', maxHeight: 340, overflow: 'auto', whiteSpace: 'pre-wrap' }}
        >
          {preview.length > 4000 ? `${preview.slice(0, 4000)}\n… truncated for display` : preview}
        </pre>

        {exportFormat === 'dxf' ? (
          <Callout tone="danger" title="Look for the CRS in that file.">
            It is not there. The only way a DXF can carry it is as a piece of visible text, which
            any recipient can move, edit or delete without noticing. When you hand survey geometry
            to a CAD or mine-planning package, the reference system travels in the covering
            document — or it does not travel at all.
          </Callout>
        ) : exportFormat === 'csv' ? (
          <Callout tone="warn" title="Comments are for humans.">
            The header block records the CRS and vertical reference, and almost every piece of
            software that reads this file will ignore it. That is why a CSV of control is only as
            defensible as the register it is issued with.
          </Callout>
        ) : exportFormat === 'geojson' ? (
          <Callout tone="warn" title="Conformant GeoJSON is WGS 84 only.">
            These are local grid coordinates, so this file deliberately warns that it does not
            conform. Writing projected coordinates into a GeoJSON and saying nothing produces a
            file that validates, opens, and places the mine in the Gulf of Guinea.
          </Callout>
        ) : (
          <Callout tone="ok" title="LAS carries its reference system.">
            A variable-length record holds the CRS inside the file, which is why LAS/LAZ is the
            right container for a point cloud. Note that it still carries no surfaces, no linework
            and no imagery — it is one part of a deliverable set, not the whole of it.
          </Callout>
        )}
      </div>
    </div>
  );
}
