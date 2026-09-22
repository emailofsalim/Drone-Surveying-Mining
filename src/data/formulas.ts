/**
 * FORMULA LIBRARY — Spec §162.
 * Every entry states its assumptions, its limitations and the questions that
 * must be answered before the number means anything (§232).
 */

import { registry, type Formula } from '../engine/formula';

const GSD_SENSOR: Formula = {
  id: 'gsd.sensor',
  title: 'Ground Sampling Distance (sensor form)',
  category: 'camera',
  expression: 'GSD = (H × Sw) / (f × Wpx)',
  definition:
    'Approximate ground dimension represented by one image pixel for nadir imaging over a ' +
    'surface at a stated height below the camera.',
  variables: [
    { symbol: 'H', name: 'Height above the imaged surface', unit: 'm', description: 'Not height above take-off unless the surface and the take-off point are at the same elevation.' },
    { symbol: 'Sw', name: 'Sensor width', unit: 'mm', description: 'Physical sensor dimension from the manufacturer specification.' },
    { symbol: 'f', name: 'Focal length', unit: 'mm', description: 'Actual focal length, not 35 mm equivalent.' },
    { symbol: 'Wpx', name: 'Image width', unit: 'px', description: 'Pixel count across the sensor width.' },
  ],
  result: { symbol: 'GSD', name: 'Ground sampling distance', unit: 'm' },
  assumptions: [
    'Nadir camera, flat horizontal surface.',
    'Pinhole geometry: lens distortion is ignored.',
    'H is measured to the imaged surface, not to the take-off point.',
  ],
  limitations: [
    'Over relief the achieved GSD varies across the frame and across the site.',
    'A finer GSD does not by itself produce a more accurate survey (golden principle 14).',
  ],
  preconditions: [
    'Which surface is H measured to — crest, floor, or an averaged plane?',
    'Is the focal length the true focal length for this lens?',
    'Does the accuracy requirement actually demand this GSD, or is it being chosen by habit?',
  ],
  compute: ({ H, Sw, f, Wpx }) => (H! * Sw!) / (f! * Wpx!),
};

const GSD_PITCH: Formula = {
  id: 'gsd.pixelPitch',
  title: 'Ground Sampling Distance (pixel-pitch form)',
  category: 'camera',
  expression: 'GSD = (H × p) / f',
  definition: 'Same relationship expressed through pixel pitch p = Sw / Wpx.',
  variables: [
    { symbol: 'H', name: 'Height above the imaged surface', unit: 'm', description: 'As above.' },
    { symbol: 'p', name: 'Pixel pitch', unit: 'mm', description: 'Physical size of one photosite.' },
    { symbol: 'f', name: 'Focal length', unit: 'mm', description: 'Actual focal length.' },
  ],
  result: { symbol: 'GSD', name: 'Ground sampling distance', unit: 'm' },
  assumptions: ['Identical to the sensor form; useful when the datasheet quotes pixel pitch.'],
  limitations: ['Same as the sensor form.'],
  preconditions: ['Is p the true photosite pitch, or a binned/cropped value?'],
  compute: ({ H, p, f }) => (H! * p!) / f!,
};

const FORWARD_OVERLAP: Formula = {
  id: 'overlap.forward',
  title: 'Forward (along-track) overlap',
  category: 'survey',
  expression: 'OL = 1 − (d / L)',
  definition: 'Fraction of an image footprint that is also covered by the next image along the line.',
  variables: [
    { symbol: 'd', name: 'Image spacing along track', unit: 'm', description: 'ground speed × trigger interval.' },
    { symbol: 'L', name: 'Footprint length along track', unit: 'm', description: 'GSD × image height in pixels.' },
  ],
  result: { symbol: 'OL', name: 'Forward overlap', unit: '-' },
  assumptions: ['Level flight, constant height, nadir camera, no crab.'],
  limitations: [
    'Real overlap depends on attitude, terrain relief and trigger timing jitter.',
    'Overlap is the source of observational redundancy for matching — not decoration (golden principle 10).',
  ],
  preconditions: [
    'Is L computed at the highest ground, the lowest ground, or the mean?',
    'Does the terrain rise toward the aircraft anywhere on the line?',
  ],
  compute: ({ d, L }) => 1 - d! / L!,
};

const IMAGE_SPACING: Formula = {
  id: 'mission.imageSpacing',
  title: 'Image spacing along track',
  category: 'survey',
  expression: 'd = v × t',
  definition: 'Ground distance flown between two consecutive exposures.',
  variables: [
    { symbol: 'v', name: 'Ground speed', unit: 'm/s', description: 'Ground speed, not airspeed: wind changes it.' },
    { symbol: 't', name: 'Trigger interval', unit: 's', description: 'Limited by the camera write cycle.' },
  ],
  result: { symbol: 'd', name: 'Image spacing', unit: 'm' },
  assumptions: ['Constant speed between exposures.'],
  limitations: ['Acceleration on turns and in gusts makes spacing uneven at line ends.'],
  preconditions: ['Is v ground speed or airspeed? In wind they differ on every line.'],
  compute: ({ v, t }) => v! * t!,
};

const MOTION_BLUR: Formula = {
  id: 'camera.motionBlur',
  title: 'Motion blur (image smear)',
  category: 'camera',
  expression: 'smear = (v × te) / GSD',
  definition: 'Number of pixels the image smears during the exposure.',
  variables: [
    { symbol: 'v', name: 'Ground speed', unit: 'm/s', description: 'Speed over the ground during exposure.' },
    { symbol: 'te', name: 'Exposure time', unit: 's', description: 'Shutter open duration.' },
    { symbol: 'GSD', name: 'Ground sampling distance', unit: 'm', description: 'Ground size of one pixel.' },
  ],
  result: { symbol: 'smear', name: 'Smear', unit: 'px' },
  assumptions: ['Straight, level flight during the exposure; vibration ignored.'],
  limitations: [
    'The acceptable smear limit is a project/manufacturer decision, not a constant this app supplies.',
    'Blur degrades keypoint detection before it becomes visible to the eye (§241).',
  ],
  preconditions: ['What smear does the processing workflow tolerate for this deliverable?'],
  compute: ({ v, te, GSD }) => (v! * te!) / GSD!,
};

const HEIGHT_RELATION: Formula = {
  id: 'height.hHN',
  title: 'Ellipsoidal / orthometric height relation',
  category: 'height',
  expression: 'h = H + N',
  definition:
    'Ellipsoidal height equals orthometric height plus geoid separation. Raw GNSS delivers h; ' +
    'engineering drawings and mine RLs use H.',
  variables: [
    { symbol: 'H', name: 'Orthometric height (RL)', unit: 'm', description: 'Height above the geoid / vertical datum.' },
    { symbol: 'N', name: 'Geoid separation', unit: 'm', description: 'From the applicable geoid model for the site. Can exceed 100 m.' },
  ],
  result: { symbol: 'h', name: 'Ellipsoidal height', unit: 'm' },
  assumptions: ['N is taken from a geoid model valid for the site and the datum in use.'],
  limitations: [
    'This application ships no geoid model. N must be supplied by the learner (§228).',
    'Mixing h and H shifts the entire surface by N and corrupts every volume computed against a fixed design surface.',
  ],
  preconditions: [
    'Which vertical datum is the project RL on?',
    'Which geoid model produced N, and is it valid for this datum?',
  ],
  compute: ({ H, N }) => H! + N!,
};

const TRIG_HEIGHT: Formula = {
  id: 'height.trigonometric',
  title: 'Trigonometric height difference',
  category: 'height',
  expression: 'dH = S × cos(Z) + HI − HT',
  definition: 'Height difference from a slope distance and a zenith angle.',
  variables: [
    { symbol: 'S', name: 'Slope distance', unit: 'm', description: 'Instrument to target.' },
    { symbol: 'Z', name: 'Zenith angle', unit: 'deg', description: '0° at the zenith, 90° horizontal.' },
    { symbol: 'HI', name: 'Instrument height', unit: 'm', description: 'Trunnion axis above the mark.' },
    { symbol: 'HT', name: 'Target height', unit: 'm', description: 'Prism/target above the mark.' },
  ],
  result: { symbol: 'dH', name: 'Height difference', unit: 'm' },
  assumptions: ['Short sight: curvature and refraction neglected.'],
  limitations: [
    'Over long sights the combined curvature-and-refraction correction is required.',
    'A mistyped HI or HT is a listed cause of a wrong RL (§238).',
  ],
  preconditions: ['Were HI and HT measured, or assumed from a previous setup?'],
  compute: ({ S, Z, HI, HT }) => S! * Math.cos((Z! * Math.PI) / 180) + HI! - HT!,
};

const NORTH_CONVERSION: Formula = {
  id: 'north.gridFromMagnetic',
  title: 'Grid azimuth from magnetic azimuth',
  category: 'geodesy',
  expression: 'Ag = Am + D − y',
  definition:
    'Converts a magnetic azimuth to a grid azimuth using magnetic declination and meridian ' +
    'convergence. Both are east-positive in this application.',
  variables: [
    { symbol: 'Am', name: 'Magnetic azimuth', unit: 'deg', description: 'Measured from magnetic north.' },
    { symbol: 'D', name: 'Magnetic declination', unit: 'deg', description: 'East positive. Changes with place, date and altitude.' },
    { symbol: 'y', name: 'Meridian convergence', unit: 'deg', description: 'East positive. Zero only on the central meridian.' },
  ],
  result: { symbol: 'Ag', name: 'Grid azimuth', unit: 'deg' },
  assumptions: ['D taken from a current geomagnetic model; y computed for the project CRS.'],
  limitations: [
    'Declination drifts: a value from an old report is not a value for today (§54).',
    'A successful compass calibration does not prove the environment is magnetically clean (§48, §49).',
  ],
  preconditions: [
    'What is the date and site of the declination value?',
    'Which projection and zone define grid north here?',
  ],
  compute: ({ Am, D, y }) => {
    const a = (Am! + D! - y!) % 360;
    return a < 0 ? a + 360 : a;
  },
};

const LATERAL_ERROR: Formula = {
  id: 'north.lateralError',
  title: 'Lateral error from a bearing error',
  category: 'qaqc',
  expression: 'e = L × sin(da)',
  definition: 'Across-line displacement at distance L caused by an angular error.',
  variables: [
    { symbol: 'L', name: 'Distance along the line', unit: 'm', description: 'Setting-out distance.' },
    { symbol: 'da', name: 'Angular error', unit: 'deg', description: 'e.g. an unapplied declination or convergence.' },
  ],
  result: { symbol: 'e', name: 'Lateral error', unit: 'm' },
  assumptions: ['Plane geometry.'],
  limitations: ['Ignores any additional error in the distance itself.'],
  preconditions: ['Is the tolerance for this task stated as a distance or as an angle?'],
  compute: ({ L, da }) => L! * Math.sin((da! * Math.PI) / 180),
};

const RMSE_FORMULA: Formula = {
  id: 'qaqc.rmse',
  title: 'Root mean square error',
  category: 'qaqc',
  expression: 'RMSE = sqrt(Sr2 / n)',
  definition: 'Quadratic mean of the residuals at independent checkpoints.',
  variables: [
    { symbol: 'Sr2', name: 'Sum of squared residuals', unit: '-', description: 'Σ(modelled − surveyed)² in metres².' },
    { symbol: 'n', name: 'Number of checkpoints', unit: '-', description: 'Independent points, not GCPs.' },
  ],
  result: { symbol: 'RMSE', name: 'RMSE', unit: 'm' },
  assumptions: ['Residuals are at points that did not constrain the adjustment.'],
  limitations: [
    'RMSE over GCPs describes the fit, not the accuracy (§152, golden principle 13).',
    'A small RMSE at five clustered checkpoints says nothing about the rest of the site.',
  ],
  preconditions: [
    'Were these points independent of the adjustment?',
    'Are they distributed across the site and its full height range?',
  ],
  compute: ({ Sr2, n }) => Math.sqrt(Sr2! / n!),
};

const VOLUME_PRISM: Formula = {
  id: 'volume.prism',
  title: 'Volume between two surfaces (prismatic / grid method)',
  category: 'survey',
  expression: 'V = A × dhm',
  definition:
    'Volume between a measured surface and a reference surface over a closed boundary, by ' +
    'summing cell area × mean height difference.',
  variables: [
    { symbol: 'A', name: 'Plan area of the boundary', unit: 'm²', description: 'Projected (plan) area, not surface area.' },
    { symbol: 'dhm', name: 'Mean height difference', unit: 'm', description: 'Area-weighted mean of (surface − reference).' },
  ],
  result: { symbol: 'V', name: 'Volume', unit: 'm³' },
  assumptions: ['Both surfaces are in the same CRS and the same vertical reference.'],
  limitations: [
    'Volume without an explicit boundary, base surface and method is not a result (golden principle 18).',
    'Vegetation or an unclassified point cloud biases the surface and therefore the volume (§137, §240).',
  ],
  preconditions: [
    'What is the base/reference surface — a plane, a design surface, or a previous survey?',
    'Is the surface a DSM or a DTM, and was it classified?',
    'Are both surfaces on the same date basis?',
  ],
  compute: ({ A, dhm }) => A! * dhm!,
};

registry.register(
  GSD_SENSOR,
  GSD_PITCH,
  FORWARD_OVERLAP,
  IMAGE_SPACING,
  MOTION_BLUR,
  HEIGHT_RELATION,
  TRIG_HEIGHT,
  NORTH_CONVERSION,
  LATERAL_ERROR,
  RMSE_FORMULA,
  VOLUME_PRISM,
);

export { registry };
