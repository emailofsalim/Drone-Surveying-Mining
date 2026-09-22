# Build phases

The master specification (§259) defines 45 phases and (§260) forbids attempting the whole application in one pass. This file records the actual state of the build. The in-app knowledge graph (`/#/knowledge`) renders the same information from `src/data/knowledge-graph.ts`.

Legend: ✅ built · 🟡 partial · ⬜ planned

| Phase | Subject | State | Where |
| --- | --- | --- | --- |
| 01 | Repository + design system | ✅ | `src/styles/`, `src/engine/units`, `src/engine/formula.ts`, `src/engine/provenance` |
| 02 | Home + virtual mine | ✅ | `src/modules/home`, `src/modules/mine`, `src/data/mine.ts` |
| 03 | Knowledge graph | ✅ | `src/modules/knowledge`, `src/data/knowledge-graph.ts` |
| 04 | Procurement | ⬜ | |
| 05 | Receiving / inspection / maintenance | ⬜ | |
| 06 | Drone anatomy | ⬜ | |
| 07 | Aerodynamics | ⬜ | |
| 08 | Propulsion | ⬜ | |
| 09 | Flight control | ⬜ | |
| 10 | IMU / sensor fusion | ⬜ | |
| 11 | Compass / magnetic field / calibration | ⬜ | |
| 12 | North references | ✅ | `src/engine/geodesy/north.ts`, `src/modules/geodesy/NorthLabPage.tsx` |
| 13 | Geodesy / CRS / datum / UTM | ✅ | `src/engine/geodesy/utm.ts`, `coordinate.ts`, `src/modules/geodesy/CrsLabPage.tsx` |
| 14 | Height / geoid / RL | ✅ | `src/engine/geodesy/height.ts`, `src/modules/geodesy/HeightLabPage.tsx` |
| 15 | GNSS | ⬜ | |
| 16 | RTK / PPK / CORS / NTRIP | ⬜ | |
| 17 | Camera | 🟡 | sensor geometry, shutter, blur in `src/engine/camera/gsd.ts` |
| 18 | GSD / footprint / overlap | ✅ | `src/engine/camera/gsd.ts`, `src/modules/camera/GsdLabPage.tsx` |
| 19 | Payloads (LiDAR, thermal, multispectral) | ⬜ | |
| 20 | Mission planner | 🟡 | geometry layer only — no battery, wind or turn model |
| 21 | Pre-flight | ⬜ | |
| 22 | Flight simulator | ⬜ | |
| 23 | Post-flight / data | ⬜ | |
| 24 | GCP / checkpoints | 🟡 | control layout and residual assessment; no placement lab yet |
| 25 | Photogrammetry | ⬜ | |
| 26 | Keypoint / tie-point lab | ⬜ | |
| 27 | Triangulation / bundle adjustment | ⬜ | |
| 28 | Point cloud | ⬜ | |
| 29 | TIN / DSM / DTM | ⬜ | |
| 30 | Orthomosaic / mesh / contours | 🟡 | contour extraction exists in the plan view (`src/modules/mine/PlanView.tsx`) |
| 31 | LiDAR | ⬜ | |
| 32 | Thermal / multispectral | ⬜ | |
| 33 | GIS / CAD | ⬜ | |
| 34 | Mine modelling | ⬜ | |
| 35 | Volume / change detection | 🟡 | analytic truth volume for the stockpile (`stockpileTruth()`) |
| 36 | QA/QC | ✅ | `src/engine/qaqc/rmse.ts`, `src/modules/qaqc/QaQcLabPage.tsx` |
| 37 | Error laboratory | 🟡 | error budget and the north/height/CRS error labs |
| 38 | Case studies | ⬜ | |
| 39 | Super simulation | ⬜ | |
| 40 | AI tutor | ⬜ | |
| 41 | Trainer mode | ⬜ | |
| 42 | Offline / PWA | ⬜ | |
| 43 | Performance / accessibility | 🟡 | code splitting, lazy 3D, themes, contrast, reduced motion |
| 44 | Automated testing | 🟡 | engine + data suite; no visual-regression suite yet |
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
