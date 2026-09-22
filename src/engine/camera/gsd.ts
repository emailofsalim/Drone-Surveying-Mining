/**
 * CAMERA / GSD / FOOTPRINT / OVERLAP ENGINE — Spec §80–§92.
 *
 * GSD is a geometric relationship, not a number a program prints (§ golden
 * principle 9). Two equivalent forms:
 *
 *   GSD = H · sensor_width / (focal_length · image_width_px)
 *   GSD = H · pixel_pitch / focal_length
 *
 * Both are used below and must agree, because pixel_pitch = sensor_width /
 * image_width_px. The test suite asserts that identity.
 *
 * LIMITATIONS (§228, §90): nadir imaging over flat terrain is assumed. Real
 * footprints depend on attitude, lens distortion, terrain relief and the
 * camera model. Over a pit, the same flight yields a different GSD on the
 * crest than on the floor — that is the point of the error lab (§88).
 */

export interface CameraSpec {
  id: string;
  name: string;
  /** Physical sensor width in millimetres. */
  sensorWidthMm: number;
  sensorHeightMm: number;
  imageWidthPx: number;
  imageHeightPx: number;
  focalLengthMm: number;
  shutter: 'global' | 'rolling' | 'mechanical';
  notes?: string;
}

/** Pixel pitch in millimetres — sensor width divided by pixel count. */
export function pixelPitchMm(camera: CameraSpec): number {
  return camera.sensorWidthMm / camera.imageWidthPx;
}

/** GSD in metres/pixel, from flying height above the imaged surface. */
export function gsdFromSensor(camera: CameraSpec, heightAboveSurfaceM: number): number {
  return (heightAboveSurfaceM * camera.sensorWidthMm) / (camera.focalLengthMm * camera.imageWidthPx);
}

/** GSD in metres/pixel, from pixel pitch. Algebraically identical to above. */
export function gsdFromPixelPitch(
  pixelPitchMillimetres: number,
  focalLengthMm: number,
  heightAboveSurfaceM: number,
): number {
  return (heightAboveSurfaceM * pixelPitchMillimetres) / focalLengthMm;
}

/** Flying height required to achieve a target GSD (§92 survey design). */
export function heightForGsd(camera: CameraSpec, targetGsdM: number): number {
  return (targetGsdM * camera.focalLengthMm * camera.imageWidthPx) / camera.sensorWidthMm;
}

export interface Footprint {
  widthM: number;
  lengthM: number;
  areaM2: number;
  gsdM: number;
}

/** Ground footprint of one nadir image (§89). */
export function imageFootprint(camera: CameraSpec, heightAboveSurfaceM: number): Footprint {
  const gsd = gsdFromSensor(camera, heightAboveSurfaceM);
  const widthM = gsd * camera.imageWidthPx;
  const lengthM = gsd * camera.imageHeightPx;
  return { widthM, lengthM, areaM2: widthM * lengthM, gsdM: gsd };
}

/**
 * OVERLAP — Spec §90.
 *   forward overlap ≈ 1 − spacing / footprint_length
 *   side overlap    ≈ 1 − line_spacing / footprint_width
 * Returned as fractions in [0,1]; negative means a gap in coverage.
 */
export function forwardOverlap(imageSpacingM: number, footprintLengthM: number): number {
  return 1 - imageSpacingM / footprintLengthM;
}

export function sideOverlap(lineSpacingM: number, footprintWidthM: number): number {
  return 1 - lineSpacingM / footprintWidthM;
}

/** Inverse: spacing that achieves a desired overlap. */
export function spacingForOverlap(footprintDimensionM: number, overlapFraction: number): number {
  return footprintDimensionM * (1 - overlapFraction);
}

/** IMAGE SPACING — Spec §91: spacing ≈ ground_speed × trigger_interval. */
export function imageSpacing(groundSpeedMs: number, triggerIntervalS: number): number {
  return groundSpeedMs * triggerIntervalS;
}

/**
 * MOTION BLUR — Spec §84.
 * Smear in pixels ≈ ground_speed × exposure_time / GSD.
 * A common rule of thumb is to keep smear below about one pixel; the
 * applicable limit is a project decision, not a value this app can set.
 */
export function motionBlurPixels(
  groundSpeedMs: number,
  exposureTimeS: number,
  gsdM: number,
): number {
  return (groundSpeedMs * exposureTimeS) / gsdM;
}

/**
 * ROLLING-SHUTTER DISPLACEMENT — Spec §82.
 * Top and bottom of the frame are exposed at different instants; the frame is
 * sheared by ground_speed × readout_time.
 */
export function rollingShutterSmearM(groundSpeedMs: number, readoutTimeS: number): number {
  return groundSpeedMs * readoutTimeS;
}

export interface MissionGeometry {
  camera: CameraSpec;
  heightAboveSurfaceM: number;
  targetForwardOverlap: number;
  targetSideOverlap: number;
  groundSpeedMs: number;
  areaWidthM: number;
  areaLengthM: number;
}

export interface MissionGeometryResult {
  gsdM: number;
  footprint: Footprint;
  imageSpacingM: number;
  lineSpacingM: number;
  triggerIntervalS: number;
  lineCount: number;
  imagesPerLine: number;
  totalImages: number;
  flightLineLengthM: number;
  totalFlightDistanceM: number;
  estimatedFlightTimeS: number;
  warnings: string[];
}

/**
 * MISSION PLANNER GEOMETRY — Spec §92, §100.
 * Pure geometry: no battery model, no turns, no wind. Those belong to the
 * flight and battery modules and are deliberately excluded here so the
 * numbers stay auditable.
 */
export function planMissionGeometry(input: MissionGeometry): MissionGeometryResult {
  const warnings: string[] = [];
  const footprint = imageFootprint(input.camera, input.heightAboveSurfaceM);
  const imageSpacingM = spacingForOverlap(footprint.lengthM, input.targetForwardOverlap);
  const lineSpacingM = spacingForOverlap(footprint.widthM, input.targetSideOverlap);
  const triggerIntervalS = imageSpacingM / input.groundSpeedMs;

  const lineCount = Math.max(1, Math.ceil(input.areaWidthM / lineSpacingM) + 1);
  const imagesPerLine = Math.max(1, Math.ceil(input.areaLengthM / imageSpacingM) + 1);
  const flightLineLengthM = input.areaLengthM;
  const totalFlightDistanceM = lineCount * flightLineLengthM + (lineCount - 1) * lineSpacingM;

  if (input.targetForwardOverlap < 0.7) {
    warnings.push(
      'Forward overlap below 70% weakens the image network. Low-texture pit floors and ' +
        'highwalls typically need more, not less, redundancy (§90, §241).',
    );
  }
  if (input.targetSideOverlap < 0.6) {
    warnings.push('Side overlap below 60% risks gaps once terrain relief is considered (§241).');
  }
  if (triggerIntervalS < 1) {
    warnings.push(
      `Trigger interval ${triggerIntervalS.toFixed(2)} s may exceed the camera's write rate. ` +
        'Verify against the manufacturer specification.',
    );
  }

  return {
    gsdM: footprint.gsdM,
    footprint,
    imageSpacingM,
    lineSpacingM,
    triggerIntervalS,
    lineCount,
    imagesPerLine,
    totalImages: lineCount * imagesPerLine,
    flightLineLengthM,
    totalFlightDistanceM,
    estimatedFlightTimeS: totalFlightDistanceM / input.groundSpeedMs,
    warnings,
  };
}

/**
 * GSD ERROR LAB — Spec §88.
 * A mission planned at constant height above the TAKE-OFF point does not hold
 * GSD over a pit. Returns the GSD actually achieved at a surface whose
 * elevation differs from the planning surface.
 */
export function gsdAtSurface(
  camera: CameraSpec,
  plannedHeightM: number,
  plannedSurfaceElevationM: number,
  actualSurfaceElevationM: number,
): { plannedGsdM: number; actualGsdM: number; ratio: number; heightAboveActualM: number } {
  const heightAboveActual = plannedHeightM + (plannedSurfaceElevationM - actualSurfaceElevationM);
  const plannedGsd = gsdFromSensor(camera, plannedHeightM);
  const actualGsd = gsdFromSensor(camera, heightAboveActual);
  return {
    plannedGsdM: plannedGsd,
    actualGsdM: actualGsd,
    ratio: actualGsd / plannedGsd,
    heightAboveActualM: heightAboveActual,
  };
}
