import type { Profile } from './gpsTracker';

export const SLOPE_WINDOW_METERS = 45;
export const SLOPE_WINDOW_MS = 60_000;
export const SLOPE_MIN_DISTANCE_M = 10;
export const SLOPE_DEADBAND_BARO_M = 0.4;
export const SLOPE_DEADBAND_GPS_M = 1;
export const SMOOTHING_ALPHA = 0.25;
export const BARO_WEIGHT_GPS = 0.15;
export const BARO_WEIGHT_BARO = 0.85;
export const HYSTERESIS_THRESHOLD_BARO_M = 1.5;
export const HYSTERESIS_THRESHOLD_GPS_M = 3.5;
export const STATIONARY_HOLD_MS = 5_000;

export const PROFILE_STATIONARY_SPEED: Record<Profile, number> = {
  walking: 0.4,
  running: 0.5,
  hiking: 0.3,
  cycling: 0.8,
  swimming: 0.3
};

export interface AltitudeSample {
  readonly t: number;
  readonly distance: number;
  readonly altitude: number;
}

export function barometricAltitude(pressureHpa: number): number {
  return 44330 * (1 - Math.pow(pressureHpa / 1013.25, 0.1903));
}

function pruneSlopeSamples(
  samples: AltitudeSample[],
  cumulativeDistance: number,
  timestampMs: number
): void {
  while (samples.length > 2) {
    const oldest = samples[0];
    const nextOldest = samples[1];
    const distDiff = cumulativeDistance - oldest.distance;
    const timeDiffMs = timestampMs - oldest.t;
    const nextDistDiff = cumulativeDistance - nextOldest.distance;
    if (
      (distDiff > SLOPE_WINDOW_METERS || timeDiffMs > SLOPE_WINDOW_MS) &&
      nextDistDiff >= SLOPE_MIN_DISTANCE_M
    ) {
      samples.shift();
    } else {
      break;
    }
  }
}

function computeLeastSquaresDeltaAlt(
  samples: readonly AltitudeSample[],
  spanDist: number
): number | null {
  let meanDist = 0;
  let meanAlt = 0;
  for (const sample of samples) {
    meanDist += sample.distance;
    meanAlt += sample.altitude;
  }
  meanDist /= samples.length;
  meanAlt /= samples.length;

  let covDistAlt = 0;
  let varDist = 0;
  for (const sample of samples) {
    const dd = sample.distance - meanDist;
    covDistAlt += dd * (sample.altitude - meanAlt);
    varDist += dd * dd;
  }
  if (varDist <= 0) {
    return null;
  }
  return (covDistAlt / varDist) * spanDist;
}

function applyVerticalDeadband(deltaAlt: number, deadbandMeters: number): number {
  if (deadbandMeters <= 0) {
    return deltaAlt;
  }
  const absDelta = Math.abs(deltaAlt);
  if (absDelta <= deadbandMeters) {
    return 0;
  }
  return Math.sign(deltaAlt) * (absDelta - deadbandMeters);
}

/**
 * Updates a sliding distance/time window of smoothed altitude samples and
 * returns the updated slope percentage using least-squares linear regression
 * and a vertical noise deadband (or `currentSlope` if distance delta is still
 * under `SLOPE_MIN_DISTANCE_M`).
 */
export function updateSlopeWindow(
  samples: AltitudeSample[],
  cumulativeDistance: number,
  smoothedAltitude: number,
  timestampMs: number,
  currentSlope: number | null,
  deadbandMeters = 0
): number | null {
  if (samples.length > 0 && cumulativeDistance <= samples.at(-1)!.distance) {
    return currentSlope;
  }

  samples.push({ t: timestampMs, distance: cumulativeDistance, altitude: smoothedAltitude });
  pruneSlopeSamples(samples, cumulativeDistance, timestampMs);

  if (samples.length >= 2) {
    const spanDist = cumulativeDistance - samples[0].distance;
    if (spanDist >= SLOPE_MIN_DISTANCE_M) {
      const fittedDeltaAlt = computeLeastSquaresDeltaAlt(samples, spanDist);
      if (fittedDeltaAlt !== null) {
        const effectiveDeltaAlt = applyVerticalDeadband(fittedDeltaAlt, deadbandMeters);
        const effectiveDist = Math.max(spanDist, SLOPE_WINDOW_METERS / 2);
        const rawSlope = (effectiveDeltaAlt / effectiveDist) * 100;
        return Math.max(-50, Math.min(50, rawSlope));
      }
    }
  }

  return currentSlope;
}

/**
 * Calculates live slope percentage based on barometer/GPS complementary fusion,
 * low-pass smoothed altitude, and a least-squares sliding distance/time window.
 *
 * Replicates the logic from `AltitudeProcessor.kt` and `replaySession.ts`:
 * - Optional barometer fusion (`0.85 * baro + 0.15 * gps`) when pressure is present.
 * - EMA low-pass filter on incoming elevation (`alpha = 0.25`).
 * - Sliding window buffer capped at 45 meters or 60 seconds.
 * - Minimum delta distance of 10 meters and sensor-adaptive vertical deadband
 *   (`0.4m` barometer / `1.0m` GPS-only) to prevent flat-ground noise artifacts.
 * - Swimming activities always report 0% slope.
 */
export class LiveSlopeCalculator {
  private readonly samples: AltitudeSample[] = [];
  private smoothedAltitude: number | null = null;
  private anchorAltitude: number | null = null;
  private baselineBaro: number | null = null;
  private gainMeters = 0;
  private currentSlope: number | null = null;
  private stationarySince: number | null = null;
  private hasMoved = false;
  private readonly isSwimming: boolean;
  private readonly useBarometer: boolean;
  private readonly hysteresisThresholdM: number;
  private readonly stationarySpeedThreshold: number;

  constructor(profile: Profile = 'walking', useBarometer = false) {
    this.isSwimming = profile === 'swimming';
    this.useBarometer = useBarometer;
    this.hysteresisThresholdM = useBarometer
      ? HYSTERESIS_THRESHOLD_BARO_M
      : HYSTERESIS_THRESHOLD_GPS_M;
    this.stationarySpeedThreshold = PROFILE_STATIONARY_SPEED[profile] ?? 0.4;
  }

  private resolveEstimatedAltitude(
    eleM: number | null,
    pressureHpa?: number | null
  ): number | null {
    if (!this.useBarometer || pressureHpa == null) {
      return eleM;
    }
    const baroAlt = barometricAltitude(pressureHpa);
    if (this.baselineBaro == null) {
      if (eleM == null) {
        return null;
      }
      this.baselineBaro = baroAlt - eleM;
      return eleM;
    }
    const baroDerived = baroAlt - this.baselineBaro;
    if (eleM == null) {
      return baroDerived;
    }
    return BARO_WEIGHT_GPS * eleM + BARO_WEIGHT_BARO * baroDerived;
  }

  private updateElevationGain(smoothed: number): void {
    if (this.anchorAltitude == null) {
      this.anchorAltitude = smoothed;
      return;
    }
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

  private isStationarySpeed(
    speedMps: number | null | undefined,
    distanceMeters: number,
    timestampMs: number
  ): boolean {
    let speed = speedMps;
    if (speed === undefined || speed === null) {
      const last = this.samples.at(-1);
      if (last != null) {
        const deltaSec = (timestampMs - last.t) / 1000;
        speed = deltaSec > 0 ? (distanceMeters - last.distance) / deltaSec : 0;
      }
    }
    return speed != null && speed < this.stationarySpeedThreshold;
  }

  private handleStationary(timestampMs: number): number | null {
    this.stationarySince ??= timestampMs;
    if (!this.hasMoved || timestampMs - this.stationarySince >= STATIONARY_HOLD_MS) {
      this.currentSlope = null;
    }
    return this.currentSlope;
  }

  update(
    eleM: number | null,
    distanceMeters: number,
    timestampMs: number,
    pressureHpa?: number | null,
    speedMps?: number | null
  ): number | null {
    if (this.isSwimming) {
      this.currentSlope = 0;
      this.gainMeters = 0;
      return 0;
    }

    if (this.isStationarySpeed(speedMps, distanceMeters, timestampMs)) {
      return this.handleStationary(timestampMs);
    }
    this.stationarySince = null;

    const estimated = this.resolveEstimatedAltitude(eleM, pressureHpa);
    if (estimated == null) {
      return this.currentSlope;
    }
    if (this.samples.length > 0 && distanceMeters <= this.samples.at(-1)!.distance) {
      return this.currentSlope;
    }

    const smoothed =
      this.smoothedAltitude == null
        ? estimated
        : SMOOTHING_ALPHA * estimated + (1 - SMOOTHING_ALPHA) * this.smoothedAltitude;
    this.smoothedAltitude = smoothed;

    this.updateElevationGain(smoothed);

    const hasActiveBaro = this.useBarometer && (pressureHpa != null || this.baselineBaro != null);
    const deadbandMeters = hasActiveBaro ? SLOPE_DEADBAND_BARO_M : SLOPE_DEADBAND_GPS_M;

    this.currentSlope = updateSlopeWindow(
      this.samples,
      distanceMeters,
      smoothed,
      timestampMs,
      this.currentSlope,
      deadbandMeters
    );

    if (
      this.samples.length >= 2 &&
      distanceMeters - this.samples[0].distance >= SLOPE_MIN_DISTANCE_M
    ) {
      this.hasMoved = true;
    }

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
    this.stationarySince = null;
    this.hasMoved = false;
  }

  reset(): void {
    this.onPause();
    this.baselineBaro = null;
    this.gainMeters = 0;
  }

  getSlope(): number | null {
    return this.currentSlope;
  }

  getSmoothedAltitude(): number | null {
    return this.smoothedAltitude;
  }

  getElevationGain(): number {
    return this.gainMeters;
  }
}
