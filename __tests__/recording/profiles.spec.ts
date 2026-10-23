import {
  PROFILE_CAPTURE_OPTIONS,
  PROFILE_FILTER_OPTIONS,
  PROFILES
} from '@/features/recording/services/profiles';

describe('recording profiles', () => {
  it('exposes the four MVP profiles in a stable order', () => {
    expect(PROFILES).toEqual(['walking', 'running', 'hiking', 'cycling', 'swimming']);
  });

  it('freezes the capture numbers copied verbatim from ActivityProfile.kt', () => {
    // These numbers are the contract: changing one silently changes capture
    // behaviour, so the test pins them to the legacy values.
    expect(PROFILE_CAPTURE_OPTIONS).toEqual({
      walking: { intervalMs: 2000, minDistanceM: 2.5, accuracyCeilingM: 15, useBarometer: true },
      running: { intervalMs: 1000, minDistanceM: 2.0, accuracyCeilingM: 15, useBarometer: true },
      hiking: { intervalMs: 4000, minDistanceM: 4, accuracyCeilingM: 20, useBarometer: true },
      cycling: { intervalMs: 1000, minDistanceM: 3, accuracyCeilingM: 15, useBarometer: true },
      swimming: { intervalMs: 1000, minDistanceM: 0.5, accuracyCeilingM: 25, useBarometer: false }
    });
  });

  it('freezes the filter thresholds copied verbatim from ActivityProfile.kt', () => {
    expect(PROFILE_FILTER_OPTIONS).toEqual({
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
    });
  });
});
