import type { Profile } from './gpsTracker';

export const SLOPE_WINDOW_METERS = 30;
export const SLOPE_WINDOW_MS = 15_000;
export const SLOPE_MIN_DISTANCE_M = 5;
export const SMOOTHING_ALPHA = 0.25;

interface AltitudeSample {
  readonly t: number;
  readonly distance: number;
  readonly altitude: number;
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

    this.samples.push({ t: timestampMs, distance: distanceMeters, altitude: smoothed });

    while (this.samples.length > 2) {
      const oldest = this.samples[0];
      const distDiff = distanceMeters - oldest.distance;
      const timeDiffMs = timestampMs - oldest.t;
      if (distDiff > SLOPE_WINDOW_METERS || timeDiffMs > SLOPE_WINDOW_MS) {
        this.samples.shift();
      } else {
        break;
      }
    }

    if (this.samples.length >= 2) {
      const oldest = this.samples[0];
      const deltaDist = distanceMeters - oldest.distance;
      const deltaAlt = smoothed - oldest.altitude;
      if (deltaDist >= SLOPE_MIN_DISTANCE_M) {
        this.currentSlope = (deltaAlt / deltaDist) * 100;
      }
    }

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
