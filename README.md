# Drone Surveying in Mining — Interactive Training Simulator

**An open-source interactive educational platform for Drone Surveying in Mining, created / initiated by MD Salim Ansari.**

> *From a drone on the mine to a defensible engineering decision.*
> See it. Fly it. Measure it. Process it. Verify it.

A browser-based digital laboratory in which the learner is the operator, pilot, survey engineer and analyst — not an audience. Every concept is built to answer five questions at once: what is it, how does it work, how do I operate it, how does it affect the survey, and how do I prove the result is trustworthy.

---

## Important

This is an **educational simulator**. It is **not**:

- an aircraft certification system,
- a legal compliance guarantee,
- a manufacturer-certified simulator,
- a substitute for applicable law, manufacturer instructions, mine SOPs or competent professional supervision.

**All site data in this application is simulated.** The mine is fictitious. No real mine coordinates, operational flight logs, private imagery, credentials or restricted datasets appear anywhere in this repository, and none may be committed to it.

---

## Quick start

```bash
npm install
npm run dev        # development server
npm run build      # typecheck + production bundle → dist/
npm run preview    # serve the production bundle
npm test           # engine test suite (245 tests)
```

Requires Node 20 or newer. No backend is needed — the simulator is a static web application.

### Deploying to GitHub Pages

```bash
BASE_PATH=/Drone-Surveying-Mining/ npm run build
```

The app uses hash routing, so deep links work on static hosts with no SPA rewrite rule. The included workflow (`.github/workflows/deploy.yml`) builds and publishes `dist/` on every push to `main`.

---

## What is built today

The master specification (`docs/spec/01_MASTER_AI_SPECIFICATION.txt`, §259–§260) defines **45 build phases** and requires them to be delivered incrementally — inspecting existing code, implementing, testing and documenting before continuing. State of the build:

| Phase | Area | State |
| --- | --- | --- |
| 01 | Repository, design system, unit engine, formula engine, provenance engine, tests, CI | Built |
| 02 | The virtual mine — one dataset behind 3D, plan and section views | Built |
| 03 | Knowledge graph across the full specification chain | Built |
| 04–05 | Procurement from the objective, technical evaluation, acceptance and incoming inspection | Built |
| 06–09 | Drone anatomy, aerodynamics, propulsion, flight control, PID, motor mixing, energy | Built |
| 10–11 | IMU drift and fusion, magnetometer calibration, local magnetic disturbance | Built |
| 12–14 | North references, CRS/datum/UTM, height, geoid and RL | Built |
| 15–16 | GNSS geometry and DOP, positioning modes, RTK vs PPK, NTRIP, base-coordinate blunder | Built |
| 17–19 | Camera, GSD, footprint, overlap, LiDAR, thermal, multispectral | Built |
| 20–23 | Mission planner, pre-flight with fault injection, survey flight, incidents, post-flight lineage | Built (22 partial) |
| 24–29 | Control and checkpoints, photogrammetry, triangulation, bundle adjustment, point cloud, surfaces | Built |
| 31–33, 35 | LiDAR trajectory and boresight, thermal/multispectral, formats and GIS/CAD, volume and reconciliation | Built |
| 36–37 | QA/QC, checkpoint RMSE, systematic error, error budget, error laboratory | Built |
| 30, 34, 38–39, 41 | Orthorectification and mesh, mine modelling, case studies, super simulation, trainer mode | Partial |
| 40, 42 | AI tutor, offline/PWA | Planned |

The in-app **knowledge graph** (`/#/knowledge`) is the live version of this table: it records what each topic requires, what breaks without it, and whether it is built, partial or planned.

## Architecture

```
src/
├── engine/          pure TypeScript, no React — every calculation lives here
│   ├── units/           cross-dimension conversion is refused, not scaled
│   ├── geodesy/         north references, UTM, coordinates with mandatory metadata, heights
│   ├── sensors/         IMU drift and fusion, magnetometer distortion and calibration
│   ├── gnss/            DOP from satellite geometry, positioning modes, RTK/PPK
│   ├── flight/          aerodynamics, energy, PID, mission execution, pre-flight
│   ├── camera/          GSD, footprint, overlap, mission geometry
│   ├── photogrammetry/  collinearity, triangulation, bundle adjustment, image network
│   ├── pointcloud/      synthetic cloud, outlier removal, ground classification
│   ├── terrain/         DSM/DTM gridding, contours, differencing, volume, reconciliation
│   ├── payloads/        LiDAR, thermal, multispectral
│   ├── gis/             format catalogue, conversion loss, CSV/DXF/GeoJSON export
│   ├── qaqc/            residuals, RMSE, error budget
│   ├── assessment/      report generator, decision gate, competency scoring
│   ├── provenance/      data origin, quality, limitations, lineage
│   └── formula.ts       formula registry with substitution + dimensional analysis
├── data/            the virtual mine, cameras, formula library, knowledge graph, SOP index
├── modules/         one folder per lab, each a thin layer over the engine
├── components/      design-system primitives that enforce the spec's UI rules
└── styles/          design tokens and global styles
```

Three rules hold throughout:

1. **Engines are pure and tested.** UI never contains a formula.
2. **One dataset.** Every view of the mine calls the same `terrainElevation()` function, so the 3D scene, the plan view and the section cannot drift apart (spec §4, §5).
3. **No undocumented numbers.** Simulated output is labelled, coordinates carry their CRS, heights carry their type and reference, and calculations print their working.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for detail and [`docs/PHASES.md`](docs/PHASES.md) for the build order.

## Documented limitations

Stated in full in [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md). In short: simplified training models for physics, no geoid model, no geomagnetic model, no datum transformations, no lens-distortion model in the bundle adjustment, no orthorectification or meshing, and a fictitious site. Simulation is not certification.

## Reference projects

`docs/REFERENCE_REPOSITORIES.md` lists open-source projects studied as **references only**. No third-party source, asset, model or dataset is copied into this repository. Those projects remain under their own licences.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: build by phase, never replace technical simulation with decorative animation, never silently change a coordinate-reference assumption, and never remove working functionality to simplify a later phase.

## Licence

MIT — see [`LICENSE`](LICENSE). Copyright (c) 2026 MD Salim Ansari.
