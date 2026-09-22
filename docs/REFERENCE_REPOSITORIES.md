# Reference Repositories — Drone Surveying in Mining

Created / initiated by **MD Salim Ansari**

This document lists open-source GitHub projects that are useful as **technical references** for the Drone Surveying in Mining web application.

> IMPORTANT: These projects are references, not automatically part of this repository. Do not copy third-party source code, assets, models, datasets or documentation into this repository unless their individual license permits it. Preserve original attribution and license notices.

## 1. DroneCommander

**Repository:** https://github.com/vroby65/DroneCommander

**Live demo:** https://vroby65.github.io/DroneCommander/

Useful reference for:
- browser-based 3D drone simulation
- mission planning concepts
- terrain-aware flight
- drone movement
- altitude and orientation
- photo capture concepts
- return-to-base behavior
- collision/flight simulation
- Three.js-based visualization

Use it as a reference for the **flight-simulator layer**.

## 2. OpenReco

**Repository:** https://github.com/abhibagul/OpenReco

Useful reference for:
- aerial-image processing
- Structure-from-Motion concepts
- georeferencing
- dense reconstruction
- point cloud
- DSM
- DTM
- contours
- orthophoto/orthomosaic workflow
- quality-control concepts
- web visualization

Use it as a reference for the **photogrammetry and survey-processing layer**.

## 3. ODyN

**Repository:** https://github.com/SMAC-Group/ODyN

Useful reference for:
- camera/GNSS/IMU relationships
- trajectory estimation concepts
- dynamic network adjustment
- calibration concepts
- control/check-point concepts
- advanced estimation workflows

Use it as a reference for the **advanced GNSS/IMU/photogrammetric mathematics layer**.

## 4. Drone Simulator

**Repository:** https://github.com/MSubham06/Drone_Simulator

Useful reference for:
- browser-based quadrotor simulation
- throttle
- yaw
- pitch
- roll
- 3D flight
- FPV concepts
- joystick/gamepad interaction
- telemetry/HUD concepts

Use it as a reference for the **manual-flight and controls layer**.

## How these references map to this project

```text
REFERENCE PROJECTS
        |
        +--> Flight Simulation
        |      DroneCommander
        |      Drone Simulator
        |
        +--> Photogrammetry / Survey Processing
        |      OpenReco
        |
        +--> GNSS / IMU / Estimation
        |      ODyN
        |
        +--> OUR PROJECT
               |
               +--> Mining-specific virtual environment
               +--> Drone anatomy
               +--> Aerodynamics
               +--> IMU
               +--> Compass calibration
               +--> True/Magnetic/Grid North
               +--> CRS / Datum / Geoid / RL
               +--> GNSS / RTK / PPK / CORS / NTRIP
               +--> Mission planning
               +--> Safety / SOP / JSA
               +--> Flight simulation
               +--> RGB / LiDAR / Thermal / Multispectral
               +--> Keypoints / Tie points
               +--> Photogrammetry
               +--> Point cloud / DSM / DTM
               +--> Orthomosaic / Mesh / Contours
               +--> Volume / Stockpile / Pit Progress
               +--> GIS / CAD / Mine Planning
               +--> QA/QC
               +--> End-to-end mining case studies
```

## Development rule

Study architecture, interaction patterns and publicly available documentation, but implement this project independently.

Before reusing any code or asset:
1. verify the source license;
2. verify that the license permits the intended use;
3. preserve required attribution/notices;
4. record the dependency in the project's third-party notices.

## Project identity

This repository is an open-source educational project:

**Drone Surveying in Mining — Interactive Training Simulator**

**Created / initiated by MD Salim Ansari**

License of this project: **MIT**

Third-party projects remain under their own licenses.
