import { PROFILE_FILTER_OPTIONS } from './profiles';
import type { FilterOptions } from './profiles';
import type { FixLogEntry, Profile, RecordingMeta } from './gpsTracker';
import type { HeartRateSample } from '../types/heartRate';
import type { EncodableStreamSet } from '@/shared/services/streamCodec';
import { SMOOTHING_ALPHA, updateSlopeWindow } from './slope';
import type { AltitudeSample } from './slope';
import { SplitDetector } from './splits';
import type { SplitEvent } from './splits';

const BARO_WEIGHT_GPS = 0.15;
const BARO_WEIGHT_BARO = 0.85;
const HYSTERESIS_THRESHOLD_BARO_M = 1.5;
const HYSTERESIS_THRESHOLD_GPS_M = 3.5;
const AUTO_PAUSE_THRESHOLD_MPS = 0.8 / 3.6;
const AUTO_PAUSE_DURATION_MS = 3_000;

const roundCoordinate = (value: number): number => Math.round(value * 1e6) / 1e6;
const roundElevation = (value: number): number => Math.round(value * 10) / 10;

export interface ReplayResult {
  stream: EncodableStreamSet;
  segments: { startIndex: number; endIndex: number }[];
  stats: {
    distanceMeters: number;
    elapsedTimeSec: number;
    movingTimeSec: number;
    elevationGainMeters: number;
    elevationLossMeters: number;
    maxSpeedMetersPerSec: number;
    averageSpeedMetersPerSec: number;
    averageHeartRate?: number;
    maxHeartRate?: number;
  };
  rejected: { index: number; reason: string }[];
  skipped: number;
  recovered: boolean;
  splits: SplitEvent[];
  autoPausedCount: number;
}

interface AltitudeState {
  smoothed: number | null;
  anchor: number | null;
  gain: number;
  loss: number;
  baselineBaro: number | null;
  geoid: number | null;
  samples: AltitudeSample[];
  cumulativeDistance: number;
  slope: number;
}

interface ReplayContext {
  meta: RecordingMeta;
  filterOptions: FilterOptions;
  isSwimming: boolean;
  fixes: FixLogEntry[];
  heartRateSamples: HeartRateSample[];
  latlng: [number, number][];
  altitude: number[];
  time: number[];
  heartrate: (number | null)[];
  segments: { startIndex: number; endIndex: number }[];
  rejected: { index: number; reason: string }[];
  distanceMeters: number;
  maxSpeedMps: number;
  lastAccepted: FixLogEntry | null;
  altitudeState: AltitudeState;
  currentSegmentStart: number | null;
  belowThresholdSince: number | null;
  autoPausedSince: number | null;
  autoPauseGaps: { startMs: number; endMs: number }[];
  splits: SplitEvent[];
  autoPausedCount: number;
  splitDetector: SplitDetector;
  firstKnownEle: number | null;
  lastKnownEle: number | null;
  firstKnownGeoid: number | null;
  lastKnownGeoid: number | null;
  hasBarometer: boolean;
}

function createAltitudeState(): AltitudeState {
  return {
    smoothed: null,
    anchor: null,
    gain: 0,
    loss: 0,
    baselineBaro: null,
    geoid: null,
    samples: [],
    cumulativeDistance: 0,
    slope: 0
  };
}

function barometricAltitude(pressureHpa: number): number {
  return 44330 * (1 - Math.pow(pressureHpa / 1013.25, 0.1903));
}

function fuseBarometer(state: AltitudeState, msl: number | null, pressure: number): number {
  const baroAlt = barometricAltitude(pressure);
  if (state.baselineBaro == null) {
    if (msl == null) {
      return 0;
    }
    state.baselineBaro = baroAlt - msl;
    return msl;
  }
  const baroDerived = baroAlt - state.baselineBaro;
  if (msl == null) {
    return baroDerived;
  }
  return BARO_WEIGHT_GPS * msl + BARO_WEIGHT_BARO * baroDerived;
}

function applyHysteresis(
  state: AltitudeState,
  smoothed: number,
  isSwimming: boolean,
  threshold: number
): void {
  if (isSwimming) {
    state.gain = 0;
    state.loss = 0;
    state.slope = 0;
    return;
  }
  if (state.anchor == null) {
    state.anchor = smoothed;
    return;
  }
  const delta = smoothed - state.anchor;
  if (delta >= threshold) {
    state.gain += delta;
    state.anchor = smoothed;
  } else if (delta <= -threshold) {
    state.loss += Math.abs(delta);
    state.anchor = smoothed;
  }
}

function resolveMslAltitude(
  state: AltitudeState,
  location: FixLogEntry,
  ctx: ReplayContext
): number | null {
  const effectiveEle = location.ele ?? ctx.lastKnownEle ?? ctx.firstKnownEle;
  if (location.ele != null) {
    ctx.lastKnownEle = location.ele;
  }

  // Backfill early fixes if NMEA GGA arrived later in the session,
  // preventing an artificial ~40m drop at the beginning of the recording.
  const effectiveGeoid = location.geoid ?? ctx.lastKnownGeoid ?? ctx.firstKnownGeoid;
  if (location.geoid != null) {
    ctx.lastKnownGeoid = location.geoid;
  }

  let msl: number | null = effectiveEle;
  if (msl != null && effectiveGeoid != null) {
    msl -= effectiveGeoid;
  }
  state.geoid = effectiveGeoid ?? state.geoid;
  return msl;
}

function sampleAltitude(
  state: AltitudeState,
  location: FixLogEntry,
  stepDistance: number,
  isSwimming: boolean,
  ctx: ReplayContext
): { smoothed: number; gain: number; loss: number } {
  const msl = resolveMslAltitude(state, location, ctx);

  let estimated = msl ?? 0;
  if (location.pressure != null) {
    estimated = fuseBarometer(state, msl, location.pressure);
  }

  const smoothed =
    state.smoothed == null
      ? estimated
      : SMOOTHING_ALPHA * estimated + (1 - SMOOTHING_ALPHA) * state.smoothed;
  state.smoothed = smoothed;

  state.cumulativeDistance += stepDistance;

  if (isSwimming) {
    state.gain = 0;
    state.loss = 0;
    state.slope = 0;
    return { smoothed, gain: 0, loss: 0 };
  }

  // Derive hysteresis threshold per fix: fixes with barometric pressure use
  // the tighter 1.5m deadband, while GPS-only fixes use 3.5m to absorb vertical drift.
  const threshold =
    location.pressure != null ? HYSTERESIS_THRESHOLD_BARO_M : HYSTERESIS_THRESHOLD_GPS_M;
  applyHysteresis(state, smoothed, isSwimming, threshold);
  state.slope =
    updateSlopeWindow(state.samples, state.cumulativeDistance, smoothed, location.t, state.slope) ??
    0;

  return { smoothed, gain: state.gain, loss: state.loss };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isStationaryDrift(
  fix: FixLogEntry,
  lastAccepted: FixLogEntry,
  dist: number,
  deltaMs: number,
  filterOptions: FilterOptions
): boolean {
  if (!filterOptions.driftSuppressionEnabled) {
    return false;
  }
  let speed: number;
  if (fix.speed != null) {
    speed = fix.speed;
  } else if (deltaMs > 0) {
    speed = dist / (deltaMs / 1000);
  } else {
    speed = 0;
  }
  return speed < filterOptions.stationarySpeedThreshold && dist < Math.max(fix.hAcc, 3);
}

function preAutoPauseFilterReason(
  fix: FixLogEntry,
  lastAccepted: FixLogEntry | null,
  filterOptions: FilterOptions,
  crossedManualPause: boolean
): string | null {
  if (fix.hAcc > filterOptions.maxAccuracyMeters) {
    return 'accuracy';
  }
  if (lastAccepted === null) {
    return null;
  }
  if (fix.t <= lastAccepted.t) {
    return 'stale-timestamp';
  }
  if (crossedManualPause) {
    return null;
  }
  const deltaMs = fix.t - lastAccepted.t;
  if (deltaMs < filterOptions.minIntervalMs) {
    return 'interval-too-short';
  }
  const dist = haversineMeters(lastAccepted.lat, lastAccepted.lon, fix.lat, fix.lon);
  if (deltaMs > 0) {
    const speed = dist / (deltaMs / 1000);
    if (speed > filterOptions.maxSpeedMps) {
      return 'speed-jump';
    }
  }
  return null;
}

function postAutoPauseFilterReason(
  fix: FixLogEntry,
  lastAccepted: FixLogEntry | null,
  filterOptions: FilterOptions,
  meta: RecordingMeta
): string | null {
  if (lastAccepted === null) {
    return null;
  }
  const deltaMs = fix.t - lastAccepted.t;
  const dist = haversineMeters(lastAccepted.lat, lastAccepted.lon, fix.lat, fix.lon);
  if (dist < meta.capture.minDistanceM) {
    return 'min-distance';
  }
  if (isStationaryDrift(fix, lastAccepted, dist, deltaMs, filterOptions)) {
    return 'stationary-drift';
  }
  return null;
}

function isManualPauseBetween(
  manualPauses: RecordingMeta['pauses'],
  prevT: number,
  currT: number
): boolean {
  return manualPauses.some(pause => pause.startUtcMs >= prevT && pause.startUtcMs < currT);
}

function firstManualPauseStartBetween(
  manualPauses: RecordingMeta['pauses'],
  prevT: number,
  currT: number
): number | null {
  let earliest: number | null = null;
  for (const pause of manualPauses) {
    if (pause.startUtcMs >= prevT && pause.startUtcMs < currT) {
      if (earliest === null || pause.startUtcMs < earliest) {
        earliest = pause.startUtcMs;
      }
    }
  }
  return earliest;
}

function computeSpeed(
  fix: FixLogEntry,
  lastAccepted: FixLogEntry | null,
  stepDistance: number
): number {
  if (fix.speed != null) {
    return fix.speed;
  }
  if (lastAccepted && fix.t > lastAccepted.t) {
    return stepDistance / ((fix.t - lastAccepted.t) / 1000);
  }
  return 0;
}

function handleManualPauseBoundary(ctx: ReplayContext, fix: FixLogEntry): void {
  if (ctx.lastAccepted === null) {
    return;
  }
  const pauses = ctx.meta.pauses ?? [];
  const pauseStart = firstManualPauseStartBetween(pauses, ctx.lastAccepted.t, fix.t);
  if (pauseStart === null) {
    return;
  }
  if (ctx.currentSegmentStart !== null) {
    ctx.segments.push({ startIndex: ctx.currentSegmentStart, endIndex: ctx.latlng.length - 1 });
    ctx.currentSegmentStart = null;
  }
  if (ctx.autoPausedSince !== null) {
    if (pauseStart > ctx.autoPausedSince) {
      ctx.autoPauseGaps.push({ startMs: ctx.autoPausedSince, endMs: pauseStart });
    }
    ctx.autoPausedSince = null;
  }
  ctx.belowThresholdSince = null;
  // A manual pause can span minutes or hours, so the altitude on the next fix
  // is unrelated to the one before the pause. Reset the hysteresis anchor
  // (mirroring ActivityProfile/AltitudeProcessor.resetAnchor on pause/resume in
  // the legacy library) so the gap is not counted as climb or descent.
  ctx.altitudeState.anchor = null;
}

function handleAutoPause(ctx: ReplayContext, fix: FixLogEntry, speed: number): boolean {
  if (speed < AUTO_PAUSE_THRESHOLD_MPS) {
    ctx.belowThresholdSince ??= fix.t;
    if (
      ctx.autoPausedSince === null &&
      ctx.belowThresholdSince !== null &&
      fix.t - ctx.belowThresholdSince >= AUTO_PAUSE_DURATION_MS
    ) {
      ctx.autoPausedSince = ctx.belowThresholdSince;
      if (ctx.currentSegmentStart !== null && ctx.latlng.length > 0) {
        ctx.segments.push({ startIndex: ctx.currentSegmentStart, endIndex: ctx.latlng.length - 1 });
        ctx.currentSegmentStart = null;
      }
      return true;
    }
  } else {
    if (ctx.autoPausedSince !== null && ctx.belowThresholdSince !== null) {
      ctx.autoPauseGaps.push({ startMs: ctx.autoPausedSince, endMs: fix.t });
      ctx.autoPausedSince = null;
    }
    ctx.belowThresholdSince = null;
  }
  return ctx.autoPausedSince !== null;
}

const HR_MATCH_WINDOW_MS = 10_000;

/**
 * Heart rate for one accepted track point, or `null` when no sample is close
 * enough to the fix. A gap stays `null` (never 0) so consumers can tell "no
 * reading" apart from a measurement.
 */
function nearestHeartRate(samples: HeartRateSample[], t: number): number | null {
  if (samples.length === 0) return null;
  // Binary search for closest sample within the window.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (samples[mid].t < t) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  let bestIndex = lo;
  if (
    bestIndex > 0 &&
    Math.abs(samples[bestIndex - 1].t - t) <= Math.abs(samples[bestIndex].t - t)
  ) {
    bestIndex -= 1;
  }
  const delta = Math.abs(samples[bestIndex].t - t);
  if (delta > HR_MATCH_WINDOW_MS) {
    return null;
  }
  return Math.round(samples[bestIndex].bpm);
}

function appendAcceptedPoint(
  ctx: ReplayContext,
  fix: FixLogEntry,
  stepDistance: number,
  crossedManualPause: boolean
): void {
  if (crossedManualPause) {
    handleManualPauseBoundary(ctx, fix);
  }

  const sample = sampleAltitude(ctx.altitudeState, fix, stepDistance, ctx.isSwimming, ctx);
  const roundedLat = roundCoordinate(fix.lat);
  const roundedLon = roundCoordinate(fix.lon);
  const roundedAlt = roundElevation(sample.smoothed);

  if (ctx.latlng.length === 0) {
    ctx.currentSegmentStart = 0;
  } else {
    ctx.currentSegmentStart ??= ctx.latlng.length;
  }

  ctx.latlng.push([roundedLat, roundedLon]);
  ctx.altitude.push(roundedAlt);
  ctx.time.push(Math.round((fix.t - ctx.meta.startedAtUtcMs) / 1000));
  ctx.heartrate.push(nearestHeartRate(ctx.heartRateSamples, fix.t));

  ctx.distanceMeters += stepDistance;

  const fixSpeed = computeSpeed(fix, crossedManualPause ? null : ctx.lastAccepted, stepDistance);
  if (fixSpeed > ctx.maxSpeedMps) {
    ctx.maxSpeedMps = fixSpeed;
  }

  const splitEvent = ctx.splitDetector.checkSplit(
    ctx.distanceMeters,
    fix.t - ctx.meta.startedAtUtcMs
  );
  if (splitEvent) {
    ctx.splits.push(splitEvent);
  }

  ctx.lastAccepted = fix;
}

function processFix(ctx: ReplayContext, fix: FixLogEntry, index: number): void {
  const crossedManualPause =
    ctx.lastAccepted !== null &&
    isManualPauseBetween(ctx.meta.pauses ?? [], ctx.lastAccepted.t, fix.t);

  // Reject corrupt fixes (accuracy, stale timestamp, too-short interval, speed jump)
  // before touching auto-pause state or `lastAccepted`.
  const preReason = preAutoPauseFilterReason(
    fix,
    ctx.lastAccepted,
    ctx.filterOptions,
    crossedManualPause
  );
  if (preReason !== null) {
    ctx.rejected.push({ index, reason: preReason });
    return;
  }

  const rawDistance =
    ctx.lastAccepted === null
      ? 0
      : haversineMeters(ctx.lastAccepted.lat, ctx.lastAccepted.lon, fix.lat, fix.lon);
  // Never accumulate straight-line distance across a manual pause boundary (§3.2).
  const stepDistance = crossedManualPause ? 0 : rawDistance;

  // Auto-pause is checked before stationary/min-distance filters, like the
  // legacy service: a stationary stop is detected from incoming valid fixes
  // even when those fixes are subsequently dropped for min-distance.
  // Swimming is exempt: open-water GPS speed is noisy and a swimmer's slow
  // laps would otherwise false-trigger auto-pause (and freeze moving time).
  const speed = computeSpeed(fix, crossedManualPause ? null : ctx.lastAccepted, stepDistance);
  const isAutoPaused =
    ctx.isSwimming || crossedManualPause ? false : handleAutoPause(ctx, fix, speed);
  if (isAutoPaused) {
    ctx.autoPausedCount += 1;
    ctx.lastAccepted = fix;
    return;
  }

  const postReason = postAutoPauseFilterReason(fix, ctx.lastAccepted, ctx.filterOptions, ctx.meta);
  if (postReason !== null) {
    ctx.rejected.push({ index, reason: postReason });
    return;
  }

  appendAcceptedPoint(ctx, fix, stepDistance, crossedManualPause);
}

function subtractIntervalFromSlice(
  slice: { start: number; end: number },
  pStart: number,
  pEnd: number
): { start: number; end: number }[] {
  if (pEnd <= slice.start || pStart >= slice.end) {
    return [slice];
  }
  const remaining: { start: number; end: number }[] = [];
  if (pStart > slice.start) {
    remaining.push({ start: slice.start, end: pStart });
  }
  if (pEnd < slice.end) {
    remaining.push({ start: pEnd, end: slice.end });
  }
  return remaining;
}

function subtractManualPauses(
  gapStart: number,
  gapEnd: number,
  pauses: RecordingMeta['pauses'],
  endedAt: number
): number {
  let slices: { start: number; end: number }[] = [{ start: gapStart, end: gapEnd }];
  for (const pause of pauses) {
    const pStart = pause.startUtcMs;
    const pEnd = pause.endUtcMs ?? endedAt;
    if (pEnd > pStart) {
      slices = slices.flatMap(slice => subtractIntervalFromSlice(slice, pStart, pEnd));
    }
  }
  return slices.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
}

function computeTimeAccounting(
  ctx: ReplayContext,
  meta: RecordingMeta,
  fixes: FixLogEntry[]
): { elapsedSec: number; manualPauseMs: number; autoPauseMs: number } {
  const startedAt = meta.startedAtUtcMs;
  const endedAt = meta.endedAtUtcMs ?? (fixes.length > 0 ? fixes.at(-1)!.t : startedAt);
  const elapsedSec = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  const pauses = meta.pauses ?? [];

  let manualPauseMs = 0;
  for (const pause of pauses) {
    const pauseEnd = pause.endUtcMs ?? endedAt;
    manualPauseMs += Math.max(0, pauseEnd - pause.startUtcMs);
  }

  let autoPauseMs = 0;
  for (const gap of ctx.autoPauseGaps) {
    autoPauseMs += subtractManualPauses(gap.startMs, gap.endMs, pauses, endedAt);
  }

  return { elapsedSec, manualPauseMs, autoPauseMs };
}

function isSampleInManualPause(
  sampleTimeMs: number,
  pauses: RecordingMeta['pauses'],
  endedAt: number
): boolean {
  return pauses.some(pause => {
    const pauseEnd = pause.endUtcMs ?? endedAt;
    return sampleTimeMs >= pause.startUtcMs && sampleTimeMs <= pauseEnd;
  });
}

function averageHeartRate(samples: HeartRateSample[]): number | undefined {
  if (samples.length === 0) return undefined;
  return Math.round(samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length);
}

function maxHeartRate(samples: HeartRateSample[]): number | undefined {
  if (samples.length === 0) return undefined;
  return Math.max(...samples.map(s => s.bpm));
}

function buildStreamSet(ctx: ReplayContext): EncodableStreamSet {
  const stream: EncodableStreamSet = {
    latlng: {
      data: ctx.latlng,
      series_type: 'distance',
      original_size: ctx.latlng.length,
      resolution: 'high'
    },
    altitude: {
      data: ctx.altitude,
      series_type: 'distance',
      original_size: ctx.altitude.length,
      resolution: 'high'
    },
    time: {
      data: ctx.time,
      series_type: 'distance',
      original_size: ctx.time.length,
      resolution: 'high'
    }
  };
  if (ctx.heartRateSamples.length > 0) {
    stream.heartrate = {
      data: ctx.heartrate,
      series_type: 'distance',
      original_size: ctx.heartrate.length,
      resolution: 'high'
    };
  }
  return stream;
}

function createReplayContext(
  meta: RecordingMeta,
  fixes: FixLogEntry[],
  heartRateSamples: HeartRateSample[]
): ReplayContext {
  const isSwimming = meta.profile === 'swimming';
  const filterOptions =
    PROFILE_FILTER_OPTIONS[meta.profile as Profile] ?? PROFILE_FILTER_OPTIONS.walking;
  const firstKnownEle = fixes.find(f => f.ele != null)?.ele ?? null;
  const firstKnownGeoid = fixes.find(f => f.geoid != null)?.geoid ?? null;
  const hasBarometer = fixes.some(f => f.pressure != null);
  const endedAt = meta.endedAtUtcMs ?? (fixes.length > 0 ? fixes.at(-1)!.t : meta.startedAtUtcMs);
  const pauses = meta.pauses ?? [];
  const sortedHr = [...heartRateSamples]
    .filter(s => !isSampleInManualPause(s.t, pauses, endedAt))
    .sort((a, b) => a.t - b.t);
  return {
    meta,
    filterOptions,
    isSwimming,
    fixes,
    heartRateSamples: sortedHr,
    latlng: [],
    altitude: [],
    time: [],
    heartrate: [],
    segments: [],
    rejected: [],
    distanceMeters: 0,
    maxSpeedMps: 0,
    lastAccepted: null,
    altitudeState: createAltitudeState(),
    currentSegmentStart: null,
    belowThresholdSince: null,
    autoPausedSince: null,
    autoPauseGaps: [],
    splits: [],
    autoPausedCount: 0,
    splitDetector: new SplitDetector({ audioEnabled: false, hapticEnabled: false }),
    firstKnownEle,
    lastKnownEle: null,
    firstKnownGeoid,
    lastKnownGeoid: null,
    hasBarometer
  };
}

export function replaySession(
  meta: RecordingMeta,
  fixes: FixLogEntry[],
  skipped = 0,
  heartRateSamples: HeartRateSample[] = []
): ReplayResult {
  const ctx = createReplayContext(meta, fixes, heartRateSamples);
  const isSwimming = ctx.isSwimming;

  for (let i = 0; i < fixes.length; i++) {
    processFix(ctx, fixes[i], i);
  }

  if (ctx.currentSegmentStart !== null && ctx.latlng.length > 0) {
    ctx.segments.push({ startIndex: ctx.currentSegmentStart, endIndex: ctx.latlng.length - 1 });
  }

  if (ctx.autoPausedSince !== null && ctx.belowThresholdSince !== null && fixes.length > 0) {
    ctx.autoPauseGaps.push({ startMs: ctx.autoPausedSince, endMs: fixes.at(-1)!.t });
  }

  const { elapsedSec, manualPauseMs, autoPauseMs } = computeTimeAccounting(ctx, meta, fixes);
  const movingTimeSec = Math.max(
    0,
    elapsedSec - Math.round(manualPauseMs / 1000) - Math.round(autoPauseMs / 1000)
  );

  const averageSpeedMps = movingTimeSec > 0 ? ctx.distanceMeters / movingTimeSec : 0;

  return {
    stream: buildStreamSet(ctx),
    segments: ctx.segments,
    stats: {
      distanceMeters: ctx.distanceMeters,
      elapsedTimeSec: elapsedSec,
      movingTimeSec,
      elevationGainMeters: isSwimming ? 0 : ctx.altitudeState.gain,
      elevationLossMeters: isSwimming ? 0 : ctx.altitudeState.loss,
      maxSpeedMetersPerSec: ctx.maxSpeedMps,
      averageSpeedMetersPerSec: averageSpeedMps,
      averageHeartRate: averageHeartRate(ctx.heartRateSamples),
      maxHeartRate: maxHeartRate(ctx.heartRateSamples)
    },
    rejected: ctx.rejected,
    skipped,
    recovered: meta.endedAtUtcMs == null,
    splits: ctx.splits,
    autoPausedCount: ctx.autoPausedCount
  };
}
