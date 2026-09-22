# Documented simulation limitations

Required by specification §228 ("documentation of simulation limitations"), §229 (field-safety language) and §230 (software-specific limitations).

## The general statement

This application is an **educational simulator**. It is not an aircraft certification system, not a legal compliance guarantee, not a manufacturer-certified simulator, and not a substitute for applicable law, manufacturer instructions, mine SOPs, aircraft qualification or competent professional supervision.

**Simulation is not certification. Software is a tool; engineering judgement remains essential.**

## Data

| Item | Limitation |
| --- | --- |
| The mine | Fictitious. A parametric open pit with a benched wall, spiral ramp, stockpile and waste dump. It is internally consistent; it is not a survey of anywhere. |
| Every coordinate, height, residual and volume | Simulated training data. None of it is a real observation. |
| Control and checkpoints | Placed to teach the GCP/checkpoint distinction, not derived from any real network. |
| Camera profiles | Generic, deliberately unbranded geometry. Real payload specifications must come from the manufacturer. |
| SOP templates | Educational structures only. They are not site procedures and must not be used as such. |

## Physics and flight

- Any physics implemented is a **simplified training model** and is labelled as such in the UI (§208).
- No CFD, no real autopilot dynamics, no aircraft-specific performance model.
- The mission planner computes **geometry only**: no turns, acceleration, climb, wind, battery model, take-off/landing time, or regulatory and site constraints. Real mission durations are longer.
- Operating limits, RTH behaviour, battery handling, airspace rules, PPE and separation requirements are **not** defined here and must be taken from current applicable sources.

## Geodesy

- UTM is implemented from the standard Transverse Mercator series (terms to e⁶) for WGS 84 / GRS 80. Accurate to a few millimetres within the normal zone width — adequate for teaching convergence and scale factor, not a replacement for a proper transformation library in production survey work.
- **No datum transformations**, no grid-shift files, no realisation/epoch handling beyond recording the epoch as metadata.
- **No geoid model.** The geoid separation `N` must be supplied by the learner from the applicable model for the site and vertical datum. The application will not invent a separation.
- **No geomagnetic model.** Magnetic declination must likewise be supplied. A declination taken from an old report is not a declination for today.
- The project CRS is never assumed. Operations across mismatched frames raise an error instead of returning a plausible number.

## Imaging

- GSD, footprint and overlap assume **nadir imaging over a flat surface** with pinhole geometry. Lens distortion is ignored.
- Real footprints and achieved overlap depend on attitude, terrain relief, the camera model and trigger jitter. The GSD error lab exists specifically to show where the flat-surface assumption breaks.
- Acceptable motion smear, acceptable overlap and acceptable GSD are **project decisions**. This application provides no thresholds.

## Photogrammetry and products

- Photogrammetric reconstruction, point clouds, surfaces, orthomosaics, LiDAR and change detection are **not yet implemented** (phases 25–35). When they are, the algorithms used and their limitations will be documented alongside them, as §210 requires.
- The stockpile carries an analytic truth volume so that a later measured volume has something to be compared against. That truth value is a property of the simulated model, not of any real pile.

## Proprietary software

Where a workflow resembles commercial survey or photogrammetry software, it is labelled **"SIMULATED WORKFLOW — NOT OFFICIAL SOFTWARE UI"**. No proprietary interface is reproduced or invented (§168).

## Accuracy of this document

If a limitation is discovered that is not listed here, adding it takes priority over adding features. An undocumented limitation is the same failure mode as an undocumented number.
