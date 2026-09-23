/**
 * Generic camera specifications — Spec §80, §227 (third-party asset policy).
 *
 * These are GENERIC TRAINING PROFILES, deliberately not named after any
 * manufacturer product. Real sensor geometry must be taken from the
 * manufacturer's current specification for the actual payload in use.
 */

import type { CameraSpec } from '../engine/camera/gsd';

export const CAMERAS: CameraSpec[] = [
  {
    id: 'cam-1inch-20mp',
    name: 'Generic 1" — 20 MP mapping camera',
    sensorWidthMm: 13.2,
    sensorHeightMm: 8.8,
    imageWidthPx: 5472,
    imageHeightPx: 3648,
    focalLengthMm: 8.8,
    shutter: 'mechanical',
    notes: 'Typical integrated mapping payload geometry. Mechanical shutter avoids rolling-shutter shear.',
  },
  {
    id: 'cam-apsc-24mp',
    name: 'Generic APS-C — 24 MP survey camera',
    sensorWidthMm: 23.5,
    sensorHeightMm: 15.6,
    imageWidthPx: 6000,
    imageHeightPx: 4000,
    focalLengthMm: 24,
    shutter: 'global',
    notes: 'Larger pixels, better low-texture performance; heavier payload, shorter endurance.',
  },
  {
    id: 'cam-4-3-20mp',
    name: 'Generic 4/3" — 20 MP wide mapping camera',
    sensorWidthMm: 17.3,
    sensorHeightMm: 13.0,
    imageWidthPx: 5280,
    imageHeightPx: 3956,
    focalLengthMm: 12,
    shutter: 'mechanical',
    notes: 'Wide footprint: fewer lines for the same area, but a coarser GSD at equal height.',
  },
  {
    id: 'cam-compact-12mp',
    name: 'Generic compact — 12 MP inspection camera',
    sensorWidthMm: 6.17,
    sensorHeightMm: 4.55,
    imageWidthPx: 4000,
    imageHeightPx: 3000,
    focalLengthMm: 4.5,
    shutter: 'rolling',
    notes: 'Rolling shutter. Acceptable for inspection; the shear it introduces is a survey concern (§82).',
  },
];

export function cameraById(id: string): CameraSpec {
  const cam = CAMERAS.find((c) => c.id === id);
  if (!cam) throw new Error(`Unknown camera "${id}"`);
  return cam;
}
