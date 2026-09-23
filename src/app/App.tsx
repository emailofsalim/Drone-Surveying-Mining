import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import '../styles/global.css';
import { HomePage } from '../modules/home/HomePage';
import { KnowledgeGraphPage } from '../modules/knowledge/KnowledgeGraphPage';
import { NorthLabPage } from '../modules/geodesy/NorthLabPage';
import { CrsLabPage } from '../modules/geodesy/CrsLabPage';
import { HeightLabPage } from '../modules/geodesy/HeightLabPage';
import { GsdLabPage } from '../modules/camera/GsdLabPage';
import { QaQcLabPage } from '../modules/qaqc/QaQcLabPage';
import { FormulaLibraryPage } from '../modules/knowledge/FormulaLibraryPage';
import { SafetyPage } from '../modules/safety/SafetyPage';
import { AboutPage } from '../modules/home/AboutPage';
import { ThemeControls } from './ThemeControls';

// §204 — lazily load the heavier modules so the initial payload stays small.
const VirtualMinePage = lazy(() =>
  import('../modules/mine/VirtualMinePage').then((m) => ({ default: m.VirtualMinePage })),
);
const ProcurementLabPage = lazy(() =>
  import('../modules/procurement/ProcurementLabPage').then((m) => ({ default: m.ProcurementLabPage })),
);
const AircraftLabPage = lazy(() =>
  import('../modules/aircraft/AircraftLabPage').then((m) => ({ default: m.AircraftLabPage })),
);
const SensorLabPage = lazy(() =>
  import('../modules/sensors/SensorLabPage').then((m) => ({ default: m.SensorLabPage })),
);
const GnssLabPage = lazy(() =>
  import('../modules/gnss/GnssLabPage').then((m) => ({ default: m.GnssLabPage })),
);
const MissionLabPage = lazy(() =>
  import('../modules/flight/MissionLabPage').then((m) => ({ default: m.MissionLabPage })),
);
const PhotogrammetryLabPage = lazy(() =>
  import('../modules/photogrammetry/PhotogrammetryLabPage').then((m) => ({ default: m.PhotogrammetryLabPage })),
);
const ProductsLabPage = lazy(() =>
  import('../modules/products/ProductsLabPage').then((m) => ({ default: m.ProductsLabPage })),
);
const PayloadLabPage = lazy(() =>
  import('../modules/products/PayloadLabPage').then((m) => ({ default: m.PayloadLabPage })),
);
const DataLabPage = lazy(() =>
  import('../modules/products/DataLabPage').then((m) => ({ default: m.DataLabPage })),
);
const ReportPage = lazy(() =>
  import('../modules/report/ReportPage').then((m) => ({ default: m.ReportPage })),
);

/**
 * Navigation follows the specification's own chain (§0): buy → inspect → fly →
 * capture → process → measure → verify → decide.
 */
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/mine', label: 'Virtual mine' },
  { to: '/knowledge', label: 'Knowledge graph' },
  { to: '/procurement', label: 'Procurement' },
  { to: '/aircraft', label: 'Aircraft' },
  { to: '/sensors', label: 'IMU & compass' },
  { to: '/north', label: 'North' },
  { to: '/crs', label: 'CRS' },
  { to: '/height', label: 'Height' },
  { to: '/gnss', label: 'GNSS' },
  { to: '/gsd', label: 'GSD' },
  { to: '/mission', label: 'Mission & flight' },
  { to: '/photogrammetry', label: 'Photogrammetry' },
  { to: '/products', label: 'Cloud & volume' },
  { to: '/payloads', label: 'Payloads' },
  { to: '/data', label: 'Formats & GIS' },
  { to: '/qaqc', label: 'QA/QC' },
  { to: '/report', label: 'Report & decision' },
  { to: '/formulas', label: 'Formulas' },
  { to: '/safety', label: 'Safety & SOPs' },
];

export function App() {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="container inner">
          <NavLink to="/" className="brand">
            <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M4 26h24L22 8h-4l-3 9-3-5H8z" fill="var(--c-accent)" />
              <circle cx="16" cy="5" r="2.4" fill="var(--c-text)" />
              <path d="M11 5h10" stroke="var(--c-text)" strokeWidth="1.2" />
            </svg>
            <span>
              Drone Surveying in Mining
              <small>Interactive training simulator</small>
            </span>
          </NavLink>

          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <ThemeControls />
        </div>
      </header>

      <main id="main" className="page">
        <div className="container">
          <Suspense fallback={<p className="muted">Loading module…</p>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/mine" element={<VirtualMinePage />} />
              <Route path="/knowledge" element={<KnowledgeGraphPage />} />
              <Route path="/procurement" element={<ProcurementLabPage />} />
              <Route path="/aircraft" element={<AircraftLabPage />} />
              <Route path="/sensors" element={<SensorLabPage />} />
              <Route path="/north" element={<NorthLabPage />} />
              <Route path="/crs" element={<CrsLabPage />} />
              <Route path="/height" element={<HeightLabPage />} />
              <Route path="/gnss" element={<GnssLabPage />} />
              <Route path="/gsd" element={<GsdLabPage />} />
              <Route path="/mission" element={<MissionLabPage />} />
              <Route path="/photogrammetry" element={<PhotogrammetryLabPage />} />
              <Route path="/products" element={<ProductsLabPage />} />
              <Route path="/payloads" element={<PayloadLabPage />} />
              <Route path="/data" element={<DataLabPage />} />
              <Route path="/qaqc" element={<QaQcLabPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="/formulas" element={<FormulaLibraryPage />} />
              <Route path="/safety" element={<SafetyPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route
                path="*"
                element={
                  <div className="card">
                    <h2>Module not found</h2>
                    <p className="muted">
                      This route is not part of the current build. See the{' '}
                      <NavLink to="/knowledge">knowledge graph</NavLink> for what is implemented and
                      what is still planned.
                    </p>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            <strong>Drone Surveying in Mining — Interactive Training Simulator.</strong> An
            open-source educational project, created / initiated by <strong>MD Salim Ansari</strong>.
            MIT licensed.
          </p>
          <p className="xs faint">
            Educational simulation only. Not an aircraft certification system, not a legal
            compliance guarantee, and not a substitute for applicable law, manufacturer
            instructions, mine SOPs or competent professional supervision. All site data in this
            application is simulated.
          </p>
        </div>
      </footer>
    </div>
  );
}
