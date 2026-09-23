/**
 * CRS / PROJECTION LAB — Spec §60–§70, §237 ("Why does the mine move?"), Phase 13.
 *
 * The lab has two halves:
 *  1. Projection mathematics: lat/lon → UTM with convergence and scale factor.
 *  2. The metadata trap: what a wrong zone, wrong axis order or undeclared CRS
 *     does to a coordinate that still looks entirely reasonable.
 */

import { useMemo, useState } from 'react';
import {
  centralMeridian,
  combinedScaleFactor,
  geodeticToUtm,
  meridianConvergence,
  utmToGeodetic,
  utmZoneFromLongitude,
  WGS84,
  GRS80,
  type Ellipsoid,
} from '../../engine/geodesy/utm';
import {
  apparentShift,
  coordinateMetadata,
  planeDistance,
  ReferenceMismatchError,
  swapAxes,
  type Coordinate,
  type CrsDescriptor,
} from '../../engine/geodesy/coordinate';
import { formatNumber } from '../../engine/units/units';
import { MINE_NOMINAL_POSITION } from '../../data/mine';
import {
  Callout,
  MetadataList,
  NumberField,
  PageHeader,
  Readout,
  SelectField,
  SimulatedBanner,
} from '../../components/ui';

const ELLIPSOIDS: Record<string, Ellipsoid> = { WGS84, GRS80 };

export function CrsLabPage() {
  const [lat, setLat] = useState(MINE_NOMINAL_POSITION.latDeg);
  const [lon, setLon] = useState(MINE_NOMINAL_POSITION.lonDeg);
  const [ellipsoidKey, setEllipsoidKey] = useState<'WGS84' | 'GRS80'>('WGS84');
  const [heightM, setHeightM] = useState(515);
  const [wrongZone, setWrongZone] = useState(0);

  const ellipsoid = ELLIPSOIDS[ellipsoidKey]!;
  const correctZone = utmZoneFromLongitude(lon);
  const usedZone = wrongZone === 0 ? correctZone : wrongZone;

  const projected = useMemo(
    () => geodeticToUtm(lat, lon, ellipsoid, correctZone),
    [lat, lon, ellipsoid, correctZone],
  );

  const projectedWrongZone = useMemo(
    () => geodeticToUtm(lat, lon, ellipsoid, usedZone),
    [lat, lon, ellipsoid, usedZone],
  );

  const roundTrip = useMemo(
    () =>
      utmToGeodetic(projected.easting, projected.northing, correctZone, projected.hemisphere, ellipsoid),
    [projected, correctZone, ellipsoid],
  );

  const roundTripErrorM = useMemo(() => {
    // Round-trip residual, expressed as a ground distance — the engine's own
    // accuracy check (§221 formula audit).
    const dLat = (roundTrip.latDeg - lat) * 111320;
    const dLon = (roundTrip.lonDeg - lon) * 111320 * Math.cos((lat * Math.PI) / 180);
    return Math.hypot(dLat, dLon);
  }, [roundTrip, lat, lon]);

  const csf = combinedScaleFactor(projected.scaleFactor, heightM);

  const correctCrs: CrsDescriptor = {
    epsg: `EPSG:${(projected.hemisphere === 'N' ? 32600 : 32700) + correctZone}`,
    name: `WGS 84 / UTM zone ${correctZone}${projected.hemisphere}`,
    kind: 'projected',
    datum: 'WGS 84',
    ellipsoid: ellipsoid.name,
    epoch: 'Ensemble — state the realisation for precise work',
    axisOrder: 'easting-northing',
    units: 'm',
    utmZone: correctZone,
    hemisphere: projected.hemisphere,
  };

  const baseCoordinate: Coordinate = {
    x: projected.easting,
    y: projected.northing,
    z: heightM,
    crs: correctCrs,
    height: {
      type: 'ellipsoidal',
      reference: `${ellipsoid.name} ellipsoid`,
      units: 'm',
    },
    source: 'Projected in this lab from a simulated geographic position',
    quality: 'SIMULATED — demonstration value',
  };

  const swapped = swapAxes(baseCoordinate);
  const axisShift = apparentShift(baseCoordinate, swapped);
  const zoneShift = Math.hypot(
    projectedWrongZone.easting - projected.easting,
    projectedWrongZone.northing - projected.northing,
  );

  // The engine refuses to measure across frames (§209).
  let mismatchMessage = '';
  try {
    planeDistance(baseCoordinate, {
      ...baseCoordinate,
      crs: { ...correctCrs, datum: 'A different local datum', epsg: undefined, name: 'Site grid' },
    });
  } catch (e) {
    if (e instanceof ReferenceMismatchError) mismatchMessage = e.message;
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phase 13 — CRS, datum, projection"
        title="A coordinate without its reference is three numbers"
        lede="Project a position, then break it on purpose. A wrong zone, a swapped axis order or an undeclared datum all produce coordinates that look entirely normal — and put the mine somewhere else."
      />

      <SimulatedBanner kind="model" />

      <div className="split">
        <div className="stack">
          <div className="panel">
            <p className="panel-title">Geographic position (simulated)</p>
            <NumberField label="Latitude" unit="degrees, north positive" value={lat} onChange={setLat} step={0.0001} />
            <NumberField label="Longitude" unit="degrees, east positive" value={lon} onChange={setLon} step={0.0001} />
            <NumberField label="Ellipsoidal height h" unit="metres" value={heightM} onChange={setHeightM} step={1} />
            <SelectField
              label="Ellipsoid"
              value={ellipsoidKey}
              options={[
                { value: 'WGS84', label: 'WGS 84' },
                { value: 'GRS80', label: 'GRS 1980' },
              ]}
              onChange={(v) => setEllipsoidKey(v)}
              hint="differ by ~0.1 mm in a"
            />
          </div>

          <div className="panel">
            <p className="panel-title">Break it on purpose (§237)</p>
            <SelectField
              label="Force a UTM zone"
              value={String(wrongZone)}
              options={[
                { value: '0', label: `Correct zone (${correctZone})` },
                { value: String(correctZone - 1), label: `Zone ${correctZone - 1} — one west` },
                { value: String(correctZone + 1), label: `Zone ${correctZone + 1} — one east` },
              ]}
              onChange={(v) => setWrongZone(Number(v))}
            />
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Zone width is 6°; the central meridian of zone {usedZone} is{' '}
              {centralMeridian(usedZone)}°E.
            </p>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <p className="panel-title">Metadata first (§236)</p>
            <MetadataList rows={coordinateMetadata(baseCoordinate)} />
          </div>

          <div className="card">
            <h3>Projected coordinate</h3>
            <div className="grid grid-3">
              <Readout label="Easting" value={projected.easting} unit="m" />
              <Readout label="Northing" value={projected.northing} unit="m" />
              <Readout label="Zone" value={`${correctZone}${projected.hemisphere}`} />
              <Readout
                label="Meridian convergence γ"
                value={meridianConvergence(lat, lon, correctZone, ellipsoid)}
                unit="deg"
                hint="grid north vs true north"
              />
              <Readout label="Point scale factor k" value={projected.scaleFactor} unit="—" />
              <Readout
                label="Combined factor"
                value={csf}
                unit="—"
                hint={`includes h = ${formatNumber(heightM, 0)} m`}
              />
            </div>
            <Callout tone="info" title="What the scale factor means.">
              A 1000.000 m distance measured on the ground at this point becomes{' '}
              <strong>{formatNumber(1000 * csf, 3)} m</strong> on the grid — a difference of{' '}
              {formatNumber(Math.abs(1000 * csf - 1000) * 1000, 0)} mm per kilometre. This is why
              mines keep a local engineering grid (§70) rather than setting out directly on UTM.
            </Callout>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Engine self-check: forward then inverse projection returns the input position to
              within {formatNumber(roundTripErrorM * 1000, 3)} mm on the ground.
            </p>
          </div>

          <div className="card">
            <h3>Why does the mine move?</h3>
            <table className="data">
              <thead>
                <tr>
                  <th>Fault</th>
                  <th className="num">Apparent shift</th>
                  <th>What the numbers look like</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Wrong UTM zone ({usedZone} instead of {correctZone})</td>
                  <td className="num">
                    {wrongZone === 0 ? '—' : `${formatNumber(zoneShift / 1000, 1)} km`}
                  </td>
                  <td className="small muted">
                    Still a six-digit easting and a seven-digit northing. Entirely plausible.
                  </td>
                </tr>
                <tr>
                  <td>Axis order read as northing-easting</td>
                  <td className="num">{formatNumber(axisShift / 1000, 1)} km</td>
                  <td className="small muted">
                    Reflects the site about the 45° line. Usually obvious — unlike a datum error.
                  </td>
                </tr>
                <tr>
                  <td>Undeclared datum difference</td>
                  <td className="num">metres to hundreds of metres</td>
                  <td className="small muted">
                    Small enough to be believed, large enough to fail every checkpoint (§155).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>The engine refuses to guess</h3>
            <p className="small muted">
              Asking for a distance between coordinates in two different declared frames does not
              return a number. It returns this:
            </p>
            <pre className="formula" style={{ whiteSpace: 'pre-wrap' }}>
              {mismatchMessage || 'No mismatch detected.'}
            </pre>
            <p className="xs faint" style={{ marginBottom: 0 }}>
              Refusing is the lesson. Silently assuming a project CRS is how a dataset becomes
              undefendable (§209, golden principle 8).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
