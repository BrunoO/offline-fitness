/**
 * The typed surface of the native recorder.
 *
 * These types are the contract between the app and `modules/gps-tracker`; the
 * Kotlin side produces the same field names (see `RecordingModels.kt` and the
 * `toMap` helpers in `GpsTrackerModule.kt`).
 */

export interface GpsTrackerCapabilities {
  /** False on iOS, where the module is a compiled stub (D6/D7). */
  canRecord: boolean;
  hasBarometer: boolean;
  canExemptBattery: boolean;
}

export type Profile = 'walking' | 'hiking' | 'cycling' | 'swimming';

export interface CaptureOptions {
  /** How often the platform is asked for a fix, in milliseconds. */
  intervalMs: number;
  /** Minimum movement between fixes, in meters. */
  minDistanceM: number;
  /** Fixes with a worse horizontal accuracy are logged as rejected. */
  accuracyCeilingM: number;
  useBarometer: boolean;
}

export interface RecordingOptions {
  profile: Profile;
  capture: CaptureOptions;
}

export interface PauseInterval {
  startUtcMs: number;
  endUtcMs?: number;
}

export interface RecordingMeta {
  sessionId: string;
  profile: Profile;
  startedAtUtcMs: number;
  /** Written at stop; repaired from the last fix when a session is recovered. */
  endedAtUtcMs?: number;
  deviceUtcOffsetSeconds: number;
  capture: CaptureOptions;
  pauses: PauseInterval[];
  fixCount?: number;
  /** Absolute URI of `fixes.jsonl` - the app reads the file itself (D11). */
  logUri: string;
  libraryVersion: string;
  savedActivityId?: string;
}

export type RecordingPhase = 'idle' | 'recording' | 'paused' | 'stopped-unsaved';

export interface RecordingState {
  phase: RecordingPhase;
  sessionId?: string;
  startedAtUtcMs?: number;
}

/** Live numbers for the screen. The canonical ones come from the replay. */
export interface LiveStats {
  elapsedSec: number;
  distanceMeters: number;
  currentSpeedMps: number | null;
  altitudeM: number | null;
}

export interface RecordingSummary {
  meta: RecordingMeta;
  liveStats: LiveStats;
}

/** A display-only fix event. May be dropped under load. */
export interface LocationUpdate {
  t: number;
  lat: number;
  lon: number;
  eleM: number | null;
  speedMps: number | null;
  elapsedSec: number;
  distanceMeters: number;
}


export interface FixLogEntry {
  t: number;
  lat: number;
  lon: number;
  ele: number | null;
  geoid: number | null;
  pressure: number | null;
  hAcc: number;
  vAcc: number | null;
  speed: number | null;
  bearing: number | null;
  source: 'gps' | 'fused' | 'network' | 'unknown';
  accepted: boolean;
  reason?: string | null;
}
