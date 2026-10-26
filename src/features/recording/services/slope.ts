import type { Profile } from './gpsTracker';

export const SLOPE_WINDOW_METERS = 30;
export const SLOPE_WINDOW_MS = 15_000;
export const SLOPE_MIN_DISTANCE_M = 5;
export const SMOOTHING_ALPHA = 0.25;

export interface AltitudeSample {
  readonly t: number;
  readonly distance: number;
  readonly altitude: number;
}

/**
 * Updates a sliding distance/time window of smoothed altitude samples and
 * returns the updated slope percentage (or `currentSlope` if distance delta is
 * still under `SLOPE_MIN_DISTANCE_M`).
 */
export function updateSlopeWindow(
  samples: AltitudeSample[],
  cumulativeDistance: number,
  smoothedAltitude: number,
  timestampMs: number,
  currentSlope: number | null
): number | null {
  samples.push({ t: timestampMs, distance: cumulativeDistance, altitude: smoothedAltitude });

  while (samples.length > 2) {
    const oldest = samples[0];
    const distDiff = cumulativeDistance - oldest.distance;
    const timeDiffMs = timestampMs - oldest.t;
    if (distDiff > SLOPE_WINDOW_METERS || timeDiffMs > SLOPE_WINDOW_MS) {
      samples.shift();
    } else {
      break;
    }
  }

  if (samples.length >= 2) {
    const oldest = samples[0];
    const deltaDist = cumulativeDistance - oldest.distance;
    const deltaAlt = smoothedAltitude - oldest.altitude;
    if (deltaDist >= SLOPE_MIN_DISTANCE_M) {
      return (deltaAlt / deltaDist) * 100;
    }
  }

  return currentSlope;
}

/**
 * Calculates live slope percentage based on low-pass smoothed altitude
 * and a sliding distance/time window.
 *
 * Replicates the logic from `AltitudeProcessor.kt` and `replaySession.ts`:
 * - EMA low-pass filter on incoming elevation (alpha = 0.25).
 * - Sliding window buffer capped at 30 meters or 15 seconds.
 * - Minimum delta distance of 5 meters to prevent jitter/noise artifacts.
 * - Swimming activities always report 0% slope.
 */
export class LiveSlopeCalculator {
  private readonly samples: AltitudeSample[] = [];
  private smoothedAltitude: number | null = null;
  private currentSlope: number | null = null;
  private readonly isSwimming: boolean;

  constructor(profile: Profile = 'walking') {
    this.isSwimming = profile === 'swimming';
  }

  update(eleM: number | null, distanceMeters: number, timestampMs: number): number | null {
    if (this.isSwimming) {
      this.currentSlope = 0;
      return 0;
    }
    if (eleM == null) {
      return this.currentSlope;
    }

    const smoothed =
      this.smoothedAltitude == null
        ? eleM
        : SMOOTHING_ALPHA * eleM + (1 - SMOOTHING_ALPHA) * this.smoothedAltitude;
    this.smoothedAltitude = smoothed;

    this.currentSlope = updateSlopeWindow(
      this.samples,
      distanceMeters,
      smoothed,
      timestampMs,
      this.currentSlope
    );

    return this.currentSlope;
  }

  reset(): void {
    this.samples.length = 0;
    this.smoothedAltitude = null;
    this.currentSlope = null;
  }

  getSlope(): number | null {
    return this.currentSlope;
  }
}
