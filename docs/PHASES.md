# Build phases

The master specification (§259) defines 45 phases and (§260) forbids attempting the whole application in one pass. This file records the actual state of the build. The in-app knowledge graph (`/#/knowledge`) renders the same information from `src/data/knowledge-graph.ts`.

Legend: ✅ built · 🟡 partial · ⬜ planned

| Phase | Subject | State | Where |
| --- | --- | --- | --- |
| 01 | Repository + design system | ✅ | `src/styles/`, `src/engine/units`, `src/engine/formula.ts`, `src/engine/provenance` |
| 02 | Home + virtual mine | ✅ | `src/modules/home`, `src/modules/mine`, `src/data/mine.ts` |
| 03 | Knowledge graph | ✅ | `src/modules/knowledge`, `src/data/knowledge-graph.ts` |
| 04 | Procurement | ✅ | `src/modules/procurement/ProcurementLabPage.tsx` |
| 05 | Receiving / inspection / maintenance | ✅ | `src/modules/procurement/ProcurementLabPage.tsx` |
| 06 | Drone anatomy | ✅ | `src/modules/aircraft/AircraftLabPage.tsx` |
| 07 | Aerodynamics | ✅ | `src/engine/flight/aerodynamics.ts` |
| 08 | Propulsion | ✅ | `src/engine/flight/aerodynamics.ts` |
| 09 | Flight control | ✅ | `src/engine/flight/aerodynamics.ts` (PID, mixer) |
| 10 | IMU / sensor fusion | ✅ | `src/engine/sensors/imu.ts`, `src/modules/sensors/SensorLabPage.tsx` |
| 11 | Compass / magnetic field / calibration | ✅ | `src/engine/sensors/magnetometer.ts` |
| 12 | North references | ✅ | `src/engine/geodesy/north.ts`, `src/modules/geodesy/NorthLabPage.tsx` |
| 13 | Geodesy / CRS / datum / UTM | ✅ | `src/engine/geodesy/utm.ts`, `coordinate.ts`, `src/modules/geodesy/CrsLabPage.tsx` |
| 14 | Height / geoid / RL | ✅ | `src/engine/geodesy/height.ts`, `src/modules/geodesy/HeightLabPage.tsx` |
| 15 | GNSS | ✅ | `src/engine/gnss/gnss.ts`, `src/modules/gnss/GnssLabPage.tsx` |
| 16 | RTK / PPK / CORS / NTRIP | ✅ | `src/engine/gnss/gnss.ts` |
| 17 | Camera | ✅ | `src/engine/camera/gsd.ts` |
| 18 | GSD / footprint / overlap | ✅ | `src/engine/camera/gsd.ts`, `src/modules/camera/GsdLabPage.tsx` |
| 19 | Payloads (LiDAR, thermal, multispectral) | ✅ | `src/engine/payloads/payloads.ts`, `src/modules/products/PayloadLabPage.tsx` |
| 20 | Mission planner | ✅ | `src/engine/flight/mission.ts`, `src/modules/flight/MissionLabPage.tsx` |
| 21 | Pre-flight | ✅ | `src/engine/flight/mission.ts` (checklist, fault injection) |
| 22 | Flight simulator | 🟡 | survey flight, telemetry and incidents; no manual free-flight control |
| 23 | Post-flight / data | ✅ | `src/engine/flight/mission.ts` (lineage, asset preservation) |
| 24 | GCP / checkpoints | ✅ | `src/engine/photogrammetry/*`, `src/engine/qaqc/rmse.ts` |
| 25 | Photogrammetry | ✅ | `src/engine/photogrammetry/photogrammetry.ts` |
| 26 | Keypoint / tie-point lab | ✅ | `src/modules/photogrammetry/PhotogrammetryLabPage.tsx` |
| 27 | Triangulation / bundle adjustment | ✅ | Levenberg-Marquardt solver with control weighting |
| 28 | Point cloud | ✅ | `src/engine/pointcloud/cloud.ts` |
| 29 | TIN / DSM / DTM | ✅ | `src/engine/terrain/surfaces.ts` |
| 30 | Orthomosaic / mesh / contours | 🟡 | contours and profiles built; no orthorectification or mesh |
| 31 | LiDAR | ✅ | `src/engine/payloads/payloads.ts` (range, swath, trajectory, boresight) |
| 32 | Thermal / multispectral | ✅ | `src/engine/payloads/payloads.ts` |
| 33 | GIS / CAD | ✅ | `src/engine/gis/formats.ts`, `src/modules/products/DataLabPage.tsx` |
| 34 | Mine modelling | 🟡 | layer stack and CAD/CSV/GeoJSON export; no block model |
| 35 | Volume / change detection | ✅ | `src/engine/terrain/surfaces.ts` (volume, cut/fill, reconciliation) |
| 36 | QA/QC | ✅ | `src/engine/qaqc/rmse.ts`, `src/modules/qaqc/QaQcLabPage.tsx` |
| 37 | Error laboratory | ✅ | error budget plus the north, height, CRS, GNSS and volume error labs |
| 38 | Case studies | 🟡 | failure-injection scenarios in the report lab; no guided case walkthroughs |
| 39 | Super simulation | 🟡 | scoring engine built; the 30-step guided run is not |
| 40 | AI tutor | ⬜ | |
| 41 | Trainer mode | 🟡 | failure injection and competency profile; no separate trainer dashboard |
| 42 | Offline / PWA | ⬜ | |
| 43 | Performance / accessibility | 🟡 | code splitting, lazy 3D, themes, contrast, reduced motion |
| 44 | Automated testing | ✅ | 245 engine and data tests across 5 suites |
| 45 | Open-source release | 🟡 | licence, README, contributing, security, CI in place |

## Working a phase (spec §260)

1. Inspect the existing code.
2. Identify reusable components and data dependencies.
3. Implement the module — engine first, UI second.
4. Write tests.
5. Run the build.
6. Inspect it visually.
7. Document it, including its limitations.
8. Only then continue.

Never remove working functionality to simplify a later phase. Never replace technical simulation with decorative animation. Never silently change a coordinate-reference assumption. Never overwrite raw sample datasets.

## Definition of done (spec §261)

The project is not complete because the website opens, a drone rotates, buttons work or a flight path animates. It is complete when a learner can start, understand, inspect, plan, fly, collect, process, troubleshoot, validate, calculate, document and make an engineering decision.
