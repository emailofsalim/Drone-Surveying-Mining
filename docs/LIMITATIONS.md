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
| Aircraft, platform and LiDAR classes | Generic capability classes. **No vendor specifications are reproduced or invented** (§11); product values must come from verified manufacturer documentation. |
| Assessment and incident items | Written for this simulator. They are not a qualification, and passing them certifies nothing. |
| SOP templates | Educational structures only. They are not site procedures and must not be used as such. |

## Physics and flight

- Any physics implemented is a **simplified training model** and is labelled as such in the UI (§208).
- No CFD, no real autopilot dynamics, no aircraft-specific performance model. Momentum theory is used for propeller thrust and hover power with a flat efficiency; blade-element effects, rotor inflow, ground effect and vortex-ring state are all absent.
- The PID laboratory drives a second-order plant, not an aircraft. **Gains must never be transferred to real hardware** (§33).
- Battery endurance uses a nominal-voltage energy model with an illustrative temperature derating curve. It is not a manufacturer specification, and battery handling must follow the manufacturer's instructions.
- The flight simulator flies constant-speed legs with instantaneous turns and a flat turn allowance. There is **no manual free-flight control** and no aircraft dynamics.
- The mission planner computes **geometry only**: no turns, acceleration, climb, wind, battery model, take-off/landing time, or regulatory and site constraints. Real mission durations are longer.
- Operating limits, RTH behaviour, battery handling, airspace rules, PPE and separation requirements are **not** defined here and must be taken from current applicable sources.

## Geodesy

- UTM is implemented from the standard Transverse Mercator series (terms to e⁶) for WGS 84 / GRS 80. Accurate to a few millimetres within the normal zone width — adequate for teaching convergence and scale factor, not a replacement for a proper transformation library in production survey work.
- **No datum transformations**, no grid-shift files, no realisation/epoch handling beyond recording the epoch as metadata.
- **No geoid model.** The geoid separation `N` must be supplied by the learner from the applicable model for the site and vertical datum. The application will not invent a separation.
- **No geomagnetic model.** Magnetic declination must likewise be supplied. A declination taken from an old report is not a declination for today.
- **GNSS** computes DOP properly from the satellite geometry matrix, but uses a **synthetic constellation, not real ephemerides**. The error budget (range sigma per mode, ~1 mm/km baseline decorrelation, correction-age growth) is an educational model, not a receiver specification. There is no ionospheric model and no carrier-phase ambiguity resolution.
- **Inertial** drift uses free-inertial propagation of a constant bias plus the gravity-leak term, and a complementary filter for fusion. There is no Kalman filter, no Earth-rotation or transport-rate term, and no scale-factor or misalignment modelling.
- The project CRS is never assumed. Operations across mismatched frames raise an error instead of returning a plausible number.

## Imaging

- GSD, footprint and overlap assume **nadir imaging over a flat surface** with pinhole geometry. Lens distortion is ignored.
- Real footprints and achieved overlap depend on attitude, terrain relief, the camera model and trigger jitter. The GSD error lab exists specifically to show where the flat-surface assumption breaks.
- Acceptable motion smear, acceptable overlap and acceptable GSD are **project decisions**. This application provides no thresholds.

## Photogrammetry and products

- **Photogrammetry** is implemented numerically: pinhole collinearity, least-squares ray triangulation, reprojection residuals and a Levenberg-Marquardt bundle adjustment with control weighting. It has **no lens-distortion model and no self-calibration of interior orientation**, uses numerical Jacobians and no robust loss, and is sized for small teaching networks rather than production blocks. Keypoints are synthesised from the terrain model rather than detected in real imagery, so detector behaviour under texture, blur and glare is modelled **statistically, not optically**.
- **Point clouds** are generated from the terrain function plus modelled cover, not reconstructed from imagery. Ground classification is a basic progressive morphological filter; production filters handle steep benches far better.
- **Surfaces** use gridding with inverse-distance gap filling. There is no kriging, no spline interpolation and no breakline-constrained triangulation.
- **Volumes** use the grid-prism method only. TIN-prism volumes are named in the interface but resolve to the same grid computation.
- **Orthorectification and meshing are not implemented** (phase 30). Contours, profiles and surface differencing are.
- **LiDAR** is modelled through its range, swath, trajectory and boresight relationships. There is no waveform processing, no multiple-return simulation against real geometry, and no strip adjustment.
- **Thermal** uses a Stefan-Boltzmann radiance balance with stated emissivity, background and transmission. There is no atmospheric transfer model and no camera radiometric calibration.
- The stockpile carries an analytic truth volume so that a later measured volume has something to be compared against. That truth value is a property of the simulated model, not of any real pile.

## Proprietary software

Where a workflow resembles commercial survey or photogrammetry software, it is labelled **"SIMULATED WORKFLOW — NOT OFFICIAL SOFTWARE UI"**. No proprietary interface is reproduced or invented (§168).

## Accuracy of this document

If a limitation is discovered that is not listed here, adding it takes priority over adding features. An undocumented limitation is the same failure mode as an undocumented number.
