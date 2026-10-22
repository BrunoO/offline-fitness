import type { CaptureOptions, Profile } from './gpsTracker';

/**
 * The four MVP profiles and the capture parameters each one uses.
 *
 * The numbers are the ones the legacy `ActivityProfile` carried - the
 * behaviour did not change, the class did: profiles are app data now, and
 * the service only receives the four values the capture loop needs.
 */
export const PROFILES: Profile[] = ['walking', 'running', 'hiking', 'cycling', 'swimming'];

export const PROFILE_CAPTURE_OPTIONS: Record<Profile, CaptureOptions> = {
  walking: {
    intervalMs: 2000,
    minDistanceM: 2.5,
    accuracyCeilingM: 15,
    useBarometer: true
  },
  running: {
    intervalMs: 1000,
    minDistanceM: 2.0,
    accuracyCeilingM: 15,
    useBarometer: true
  },
  hiking: {
    intervalMs: 4000,
    minDistanceM: 4,
    accuracyCeilingM: 20,
    useBarometer: true
  },
  cycling: {
    intervalMs: 1000,
    minDistanceM: 3,
    accuracyCeilingM: 15,
    useBarometer: true
  },
  swimming: {
    intervalMs: 1000,
    minDistanceM: 0.5,
    accuracyCeilingM: 25,
    useBarometer: false
  }
};

export const PROFILE_LABELS: Record<Profile, string> = {
  walking: 'Walking',
  running: 'Running',
  hiking: 'Hiking',
  cycling: 'Cycling',
  swimming: 'Swimming'
};

/**
 * The filter thresholds the legacy `ActivityProfile` carried.
 *
 * They are not part of `CaptureOptions` (and therefore not part of `meta.json`):
 * the capture contract stays at four fields, and the replay looks these up by
 * profile. The numbers are copied verbatim from `ActivityProfile.kt` so the
 * port does not silently change capture behaviour.
 */
export interface FilterOptions {
  maxAccuracyMeters: number;
  minIntervalMs: number;
  maxSpeedMps: number;
  driftSuppressionEnabled: boolean;
  stationarySpeedThreshold: number;
}

export const PROFILE_FILTER_OPTIONS: Record<Profile, FilterOptions> = {
  walking: {
    maxAccuracyMeters: 15,
    minIntervalMs: 2000,
    maxSpeedMps: 5,
    driftSuppressionEnabled: true,
    stationarySpeedThreshold: 0.4
  },
  running: {
    maxAccuracyMeters: 15,
    minIntervalMs: 1000,
    maxSpeedMps: 12,
    driftSuppressionEnabled: true,
    stationarySpeedThreshold: 0.5
  },
  hiking: {
    maxAccuracyMeters: 20,
    minIntervalMs: 4000,
    maxSpeedMps: 7,
    driftSuppressionEnabled: true,
    stationarySpeedThreshold: 0.3
  },
  cycling: {
    maxAccuracyMeters: 15,
    minIntervalMs: 1000,
    maxSpeedMps: 35,
    driftSuppressionEnabled: true,
    stationarySpeedThreshold: 0.8
  },
  swimming: {
    maxAccuracyMeters: 25,
    minIntervalMs: 1000,
    maxSpeedMps: 3.5,
    driftSuppressionEnabled: false,
    stationarySpeedThreshold: 0.5
  }
};
