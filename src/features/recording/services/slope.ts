import type { Profile } from './gpsTracker';

export const SLOPE_WINDOW_METERS = 30;
export const SLOPE_WINDOW_MS = 15_000;
export const SLOPE_MIN_DISTANCE_M = 5;
export const SMOOTHING_ALPHA = 0.25;
export const HYSTERESIS_THRESHOLD_BARO_M = 1.5;
export const HYSTERESIS_THRESHOLD_GPS_M = 3.5;

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
  private anchorAltitude: number | null = null;
  private gainMeters = 0;
  private currentSlope: number | null = null;
  private readonly isSwimming: boolean;
  private readonly hysteresisThresholdM: number;

  constructor(profile: Profile = 'walking', useBarometer = false) {
    this.isSwimming = profile === 'swimming';
    this.hysteresisThresholdM = useBarometer
      ? HYSTERESIS_THRESHOLD_BARO_M
      : HYSTERESIS_THRESHOLD_GPS_M;
  }

  update(eleM: number | null, distanceMeters: number, timestampMs: number): number | null {
    if (this.isSwimming) {
      this.currentSlope = 0;
      this.gainMeters = 0;
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

    if (this.anchorAltitude == null) {
      this.anchorAltitude = smoothed;
    } else {
      const delta = smoothed - this.anchorAltitude;
      if (delta >= this.hysteresisThresholdM) {
        this.gainMeters += delta;
        this.anchorAltitude = smoothed;
      } else if (delta <= -this.hysteresisThresholdM) {
        // Move the hysteresis anchor down on descents so subsequent climbs from
        // the bottom are counted toward D+. Unlike `replaySession.ts`, we do
        // not accumulate a separate `loss` (D-) counter here because `LiveStats`
        // only surfaces cumulative elevation gain (`D+`).
        this.anchorAltitude = smoothed;
      }
    }

    this.currentSlope = updateSlopeWindow(
      this.samples,
      distanceMeters,
      smoothed,
      timestampMs,
      this.currentSlope
    );

    return this.currentSlope;
  }

  /**
   * Clears the sliding slope window and hysteresis anchor on pause while
   * preserving cumulative session elevation gain (`D+`).
   */
  onPause(): void {
    this.samples.length = 0;
    this.smoothedAltitude = null;
    this.anchorAltitude = null;
    this.currentSlope = null;
  }

  reset(): void {
    this.onPause();
    this.gainMeters = 0;
  }

  getSlope(): number | null {
    return this.currentSlope;
  }

  getElevationGain(): number {
    return this.gainMeters;
  }
}
