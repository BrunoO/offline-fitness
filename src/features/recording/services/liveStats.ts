import type { LiveStats } from './gpsTracker';

/**
 * Pure helpers for the live (per-second) stats shown while recording.
 *
 * Extracted from `useRecording` so they can be unit-tested in isolation and so
 * the hook itself stays focused on orchestration. None of these touch state,
 * storage, or the native module.
 */

/**
 * Advances the live stats by one second when no new GPS fix has arrived.
 * When a previous sample exists, only the elapsed counter ticks; when none
 * exists yet, the elapsed time is derived from the wall clock so the timer
 * starts immediately even before the first fix.
 */
export function tickLiveStats(prev: LiveStats | null, startedAtUtcMs: number): LiveStats {
  if (prev !== null) {
    return {
      ...prev,
      elapsedSec: prev.elapsedSec + 1
    };
  }
  return {
    elapsedSec: Math.max(0, Math.floor((Date.now() - startedAtUtcMs) / 1000)),
    movingTimeSec: 0,
    distanceMeters: 0,
    currentSpeedMps: null,
    altitudeM: null,
    slopePercent: null,
    elevationGainM: 0,
    gpsLost: false,
    hAccM: null
  };
}

/**
 * Display distance: 0 until the first move, otherwise the live distance while
 * moving or the last known distance while stationary.
 */
export function computeDisplayDistance(
  hasMoved: boolean,
  isMoving: boolean,
  currentDistance: number,
  lastDistance: number
): number {
  if (!hasMoved) {
    return 0;
  }
  return isMoving ? currentDistance : lastDistance;
}

/**
 * Accumulates moving time from consecutive fixes: only deltas between 0 and
 * 5 seconds count, and only while currently moving. Returns the unchanged
 * total when there is no previous timestamp.
 */
export function updateMovingTime(
  lastTimestampMs: number | null,
  currentTimestampMs: number,
  isCurrentlyMoving: boolean,
  currentMovingTimeSec: number
): number {
  if (lastTimestampMs === null) {
    return currentMovingTimeSec;
  }
  const deltaSec = (currentTimestampMs - lastTimestampMs) / 1000;
  if (deltaSec > 0 && deltaSec <= 5 && isCurrentlyMoving) {
    return currentMovingTimeSec + deltaSec;
  }
  return currentMovingTimeSec;
}
