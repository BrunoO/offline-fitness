export type Flyover3DCameraPreset = 'drone' | 'helicopter' | 'chase';

export interface Sport3DProfile {
  baseRangeMeters: number;
  baseSpeedMps: number;
}

export interface Flyover3DCameraPresetSpec {
  id: Flyover3DCameraPreset;
  label: string;
  tiltDegrees: number;
  rangeScale: number;
}

export const FLYOVER_3D_PRESETS: Record<Flyover3DCameraPreset, Flyover3DCameraPresetSpec> = {
  drone: {
    id: 'drone',
    label: 'Drone',
    tiltDegrees: 65,
    rangeScale: 1.0
  },
  helicopter: {
    id: 'helicopter',
    label: 'Heli',
    tiltDegrees: 45,
    rangeScale: 2.1
  },
  chase: {
    id: 'chase',
    label: 'Chase',
    tiltDegrees: 72,
    rangeScale: 0.55
  }
};

export const NEXT_3D_CAMERA_PRESET: Record<Flyover3DCameraPreset, Flyover3DCameraPreset> = {
  drone: 'helicopter',
  helicopter: 'chase',
  chase: 'drone'
};

const FOOT_SPORT_TYPES = new Set([
  'walk',
  'hike',
  'run',
  'trailrun',
  'snowshoe',
  'virtualrun',
  'wheelchair'
]);

const FAST_SPORT_TYPES = new Set([
  'ride',
  'gravelride',
  'mountainbikeride',
  'ebikeride',
  'emountainbikeride',
  'handcycle',
  'velomobile',
  'alpineski',
  'backcountryski',
  'nordicski',
  'snowboard',
  'rollerski',
  'inlineskate',
  'iceskate'
]);

const MIN_RANGE_METERS = 250;
const MAX_RANGE_METERS = 3000;
const MIN_BASE_SPEED_MPS = 30;
const MAX_BASE_SPEED_MPS = 260;

/**
 * Resolves sport- and distance-adaptive 3D camera range and flyover base speed
 * so short hikes feel intimate while long alpine rides progress briskly.
 */
export function resolveSport3DProfile(
  activityType?: string,
  trackDistanceMeters = 0
): Sport3DProfile {
  const normalized = activityType?.toLowerCase().replaceAll(/[\s_-]+/g, '') ?? '';

  let baseRangeMeters = 750;
  let baseSpeedMps = 85;

  if (FOOT_SPORT_TYPES.has(normalized)) {
    baseRangeMeters = 500;
    baseSpeedMps = 50;
  } else if (FAST_SPORT_TYPES.has(normalized)) {
    baseRangeMeters = 850;
    baseSpeedMps = 110;
  }

  // Gently scale speed up on very long endurance tracks so playback stays engaging.
  if (Number.isFinite(trackDistanceMeters) && trackDistanceMeters > 20_000) {
    const distanceBoost = Math.min(2.0, 1 + (trackDistanceMeters - 20_000) / 80_000);
    baseSpeedMps = Math.round(baseSpeedMps * distanceBoost);
  }

  return {
    baseRangeMeters,
    baseSpeedMps: Math.max(MIN_BASE_SPEED_MPS, Math.min(MAX_BASE_SPEED_MPS, baseSpeedMps))
  };
}

/**
 * Combines the sport profile with the user's chosen 3D camera preset.
 */
export function resolve3DCameraParams(
  profile: Sport3DProfile,
  preset: Flyover3DCameraPreset
): { tilt: number; range: number; label: string } {
  const spec = FLYOVER_3D_PRESETS[preset];
  const scaledRange = Math.round(profile.baseRangeMeters * spec.rangeScale);
  return {
    tilt: spec.tiltDegrees,
    range: Math.max(MIN_RANGE_METERS, Math.min(MAX_RANGE_METERS, scaledRange)),
    label: spec.label
  };
}
