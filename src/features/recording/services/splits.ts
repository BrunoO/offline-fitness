import AsyncStorage from '@react-native-async-storage/async-storage';
import { GpsTracker } from './gpsTracker';
import type { Profile } from './gpsTracker';

/**
 * A split milestone event, mirroring GpsLib's `SplitEvent`.
 */
export interface SplitEvent {
  splitNumber: number;
  splitDistanceMeters: number;
  splitDurationMs: number;
  paceSecondsPerKm: number;
  paceFormatted: string;
  totalDistanceMeters: number;
  totalElapsedTimeMs: number;
}

export interface SplitAnnouncementOptions {
  readonly profile?: Profile;
  /** Split speed in km/h (used when profile === 'cycling'). */
  readonly speedKmh?: number;
  /** Total elapsed workout duration in milliseconds. */
  readonly totalElapsedMs?: number;
  /** Current live heart rate in bpm, if a BLE strap is connected. */
  readonly heartRateBpm?: number | null;
}

export interface SplitDetectorOptions {
  /** Activity profile (e.g. 'cycling' announces speed in km/h instead of pace). */
  profile?: Profile;
  /** Distance between splits, in meters. Defaults to 1000 (1 km). */
  intervalMeters?: number;
  audioEnabled?: boolean;
  hapticEnabled?: boolean;
  /** Optional live heart-rate provider (in bpm) for spoken split announcements. */
  getHeartRateBpm?: () => number | null;
  /** Override for tests; defaults to GpsTracker.speak. */
  speak?: (text: string) => void | Promise<void>;
  /** Override for tests; defaults to GpsTracker.vibrate. */
  vibrate?: () => void | Promise<void>;
}

const DEFAULT_INTERVAL_METERS = 1000;

/**
 * Formats a duration in milliseconds into natural spoken English units
 * (hours, minutes, seconds) for TTS announcements.
 */
export function formatSpokenDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }
  return parts.join(' ');
}

function buildRateClause(
  minutes: number,
  seconds: number,
  options: SplitAnnouncementOptions
): string {
  if (options.profile === 'cycling' && options.speedKmh !== undefined && options.speedKmh > 0) {
    return `Speed: ${options.speedKmh.toFixed(1)} kilometers per hour.`;
  }
  if (minutes > 0) {
    return `Pace: ${minutes} minutes ${seconds} seconds.`;
  }
  return `Pace: ${seconds} seconds.`;
}

/**
 * Builds the spoken announcement for a split.
 *
 * Only kilometers and meters are used (the app is metric-only): an interval
 * under 950 m is announced in meters, otherwise in kilometers. Includes
 * sport-appropriate rate (km/h for cycling, pace otherwise), total elapsed
 * time, and current heart rate when available.
 */
export function buildAnnouncementText(
  splitNumber: number,
  minutes: number,
  seconds: number,
  intervalMeters: number,
  options: SplitAnnouncementOptions = {}
): string {
  const isSubKm = intervalMeters < 950;
  const prefix = isSubKm
    ? `${Math.round(splitNumber * intervalMeters)} meters completed.`
    : `Kilometer ${splitNumber} completed.`;

  const clauses: string[] = [prefix, buildRateClause(minutes, seconds, options)];

  if (options.totalElapsedMs !== undefined && options.totalElapsedMs > 0) {
    clauses.push(`Total time: ${formatSpokenDuration(options.totalElapsedMs)}.`);
  }

  if (options.heartRateBpm != null && options.heartRateBpm > 0) {
    clauses.push(`Heart rate: ${Math.round(options.heartRateBpm)} beats per minute.`);
  }

  return clauses.join(' ');
}

/**
 * Pure-ish split detector. The arithmetic is deterministic and unit-testable;
 * the only side effects are the injected `speak`/`vibrate` calls, which
 * default to the native module.
 */
export class SplitDetector {
  private readonly profile?: Profile;
  private readonly intervalMeters: number;
  private audioEnabled: boolean;
  private hapticEnabled: boolean;
  private readonly getHeartRateBpm?: () => number | null;
  private readonly speakFn: (text: string) => void | Promise<void>;
  private readonly vibrateFn: () => void | Promise<void>;

  splitCount = 0;
  lastSplitDistanceMeters = 0;
  lastSplitElapsedMs = 0;

  constructor(options: SplitDetectorOptions = {}) {
    this.profile = options.profile;
    this.intervalMeters = options.intervalMeters ?? DEFAULT_INTERVAL_METERS;
    this.audioEnabled = options.audioEnabled ?? true;
    this.hapticEnabled = options.hapticEnabled ?? true;
    this.getHeartRateBpm = options.getHeartRateBpm;
    this.speakFn = options.speak ?? ((text: string) => GpsTracker.speak(text));
    this.vibrateFn = options.vibrate ?? (() => GpsTracker.vibrate());
  }

  private get safeInterval(): number {
    return this.intervalMeters >= 5 ? this.intervalMeters : DEFAULT_INTERVAL_METERS;
  }

  /**
   * Evaluate current totals and trigger feedback if the interval was crossed.
   * Returns the split event when one fired, otherwise null.
   */
  checkSplit(
    totalDistanceMeters: number,
    totalElapsedMs: number,
    heartRateBpm?: number | null
  ): SplitEvent | null {
    const distanceSinceLastSplit = totalDistanceMeters - this.lastSplitDistanceMeters;
    if (distanceSinceLastSplit < this.safeInterval) {
      return null;
    }
    return this.fire(totalDistanceMeters, totalElapsedMs, distanceSinceLastSplit, heartRateBpm);
  }

  /**
   * Force an immediate split with the current totals.
   */
  forceSplit(
    totalDistanceMeters: number,
    totalElapsedMs: number,
    heartRateBpm?: number | null
  ): SplitEvent {
    const distanceSinceLastSplit = Math.max(1, totalDistanceMeters - this.lastSplitDistanceMeters);
    return this.fire(totalDistanceMeters, totalElapsedMs, distanceSinceLastSplit, heartRateBpm);
  }

  private fire(
    totalDistanceMeters: number,
    totalElapsedMs: number,
    distanceSinceLastSplit: number,
    heartRateBpm?: number | null
  ): SplitEvent {
    this.splitCount += 1;
    const intervalDurationMs = Math.max(0, totalElapsedMs - this.lastSplitElapsedMs);
    const distanceTraveledKm = distanceSinceLastSplit / 1000.0;
    const paceSecondsPerKm =
      distanceTraveledKm > 0 ? intervalDurationMs / 1000 / distanceTraveledKm : 0;
    const minutes = Math.floor(paceSecondsPerKm / 60);
    const seconds = Math.floor(paceSecondsPerKm % 60);
    const paceFormatted = `${minutes}:${String(seconds).padStart(2, '0')}`;

    const event: SplitEvent = {
      splitNumber: this.splitCount,
      splitDistanceMeters: distanceSinceLastSplit,
      splitDurationMs: intervalDurationMs,
      paceSecondsPerKm,
      paceFormatted,
      totalDistanceMeters,
      totalElapsedTimeMs: totalElapsedMs
    };

    this.lastSplitDistanceMeters = totalDistanceMeters;
    this.lastSplitElapsedMs = totalElapsedMs;

    // Feedback uses the cached values so it fires immediately; storage is
    // re-read in the background so a settings change lands on the next split.
    if (this.hapticEnabled) {
      void this.vibrateFn();
    }
    if (this.audioEnabled) {
      const speedKmh =
        intervalDurationMs > 0 ? (distanceSinceLastSplit / (intervalDurationMs / 1000)) * 3.6 : 0;
      const resolvedHr =
        heartRateBpm === undefined ? (this.getHeartRateBpm?.() ?? null) : heartRateBpm;
      const text = buildAnnouncementText(this.splitCount, minutes, seconds, this.safeInterval, {
        profile: this.profile,
        speedKmh,
        totalElapsedMs,
        heartRateBpm: resolvedHr
      });
      void this.speakFn(text);
    }

    void (async () => {
      try {
        const [audioRaw, hapticRaw] = await Promise.all([
          AsyncStorage.getItem('splitsAudioEnabled'),
          AsyncStorage.getItem('splitsHapticEnabled')
        ]);
        if (audioRaw !== null) {
          this.audioEnabled = audioRaw === 'true';
        }
        if (hapticRaw !== null) {
          this.hapticEnabled = hapticRaw === 'true';
        }
      } catch {
        // Ignore storage read errors and keep cached values.
      }
    })();

    return event;
  }

  /**
   * Restore detector state after a crash/recovery.
   */
  seed(count: number, lastDistMeters: number, lastElapsedMs: number): void {
    this.splitCount = Math.max(0, count);
    this.lastSplitDistanceMeters = Math.max(0, lastDistMeters);
    this.lastSplitElapsedMs = Math.max(0, lastElapsedMs);
  }

  reset(): void {
    this.splitCount = 0;
    this.lastSplitDistanceMeters = 0;
    this.lastSplitElapsedMs = 0;
  }
}
