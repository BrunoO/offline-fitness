import { PROFILE_FILTER_OPTIONS } from './profiles';
import type { FilterOptions } from './profiles';
import type { FixLogEntry, Profile, RecordingMeta } from './gpsTracker';
import type { EncodableStreamSet } from '@/shared/services/streamCodec';
import { SplitDetector } from './splits';
import type { SplitEvent } from './splits';

const BARO_WEIGHT_GPS = 0.7;
const BARO_WEIGHT_BARO = 0.3;
const SMOOTHING_ALPHA = 0.25;
const HYSTERESIS_THRESHOLD_M = 1.5;
const SLOPE_WINDOW_METERS = 30;
const SLOPE_WINDOW_MS = 15_000;
const SLOPE_MIN_DISTANCE_M = 5;
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
  samples: { t: number; distance: number; altitude: number }[];
  cumulativeDistance: number;
  slope: number;
}

interface ReplayContext {
  meta: RecordingMeta;
  filterOptions: FilterOptions;
  isSwimming: boolean;
  fixes: FixLogEntry[];
  latlng: [number, number][];
  altitude: number[];
  time: number[];
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

function fuseBarometer(state: AltitudeState, msl: number, pressure: number): number {
  const baroAlt = barometricAltitude(pressure);
  if (state.baselineBaro == null) {
    state.baselineBaro = baroAlt - msl;
    return msl;
  }
  const baroDerived = baroAlt - state.baselineBaro;
  return BARO_WEIGHT_GPS * msl + BARO_WEIGHT_BARO * baroDerived;
}

function applyHysteresis(state: AltitudeState, smoothed: number, isSwimming: boolean): void {
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
  if (delta >= HYSTERESIS_THRESHOLD_M) {
    state.gain += delta;
    state.anchor = smoothed;
  } else if (delta <= -HYSTERESIS_THRESHOLD_M) {
    state.loss += Math.abs(delta);
    state.anchor = smoothed;
  }
}

function updateSlope(state: AltitudeState, smoothed: number, location: FixLogEntry): void {
  state.samples.push({ t: location.t, distance: state.cumulativeDistance, altitude: smoothed });
  while (state.samples.length > 2) {
    const oldest = state.samples[0];
    const distDiff = state.cumulativeDistance - oldest.distance;
    const timeDiffMs = location.t - oldest.t;
    if (distDiff > SLOPE_WINDOW_METERS || timeDiffMs > SLOPE_WINDOW_MS) {
      state.samples.shift();
    } else {
      break;
    }
  }
  if (state.samples.length >= 2) {
    const oldest = state.samples[0];
    const deltaDist = state.cumulativeDistance - oldest.distance;
    const deltaAlt = smoothed - oldest.altitude;
    if (deltaDist >= SLOPE_MIN_DISTANCE_M) {
      state.slope = (deltaAlt / deltaDist) * 100;
    }
  }
}

function sampleAltitude(
  state: AltitudeState,
  location: FixLogEntry,
  stepDistance: number,
  isSwimming: boolean
): { smoothed: number; gain: number; loss: number } {
  const raw = location.ele ?? 0;

  let msl = raw;
  if (location.geoid != null) {
    msl = raw - location.geoid;
  }
  state.geoid = location.geoid ?? state.geoid;

  let estimated = msl;
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

  applyHysteresis(state, smoothed, isSwimming);
  updateSlope(state, smoothed, location);

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

function filterReason(
  fix: FixLogEntry,
  lastAccepted: FixLogEntry | null,
  filterOptions: FilterOptions,
  meta: RecordingMeta
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
  return manualPauses.some(pause => pause.startUtcMs > prevT && pause.startUtcMs < currT);
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
  if (!isManualPauseBetween(ctx.meta.pauses ?? [], ctx.lastAccepted.t, fix.t)) {
    return;
  }
  if (ctx.currentSegmentStart !== null) {
    ctx.segments.push({ startIndex: ctx.currentSegmentStart, endIndex: ctx.latlng.length - 1 });
    ctx.currentSegmentStart = null;
  }
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

function processFix(ctx: ReplayContext, fix: FixLogEntry, index: number): void {
  const stepDistance =
    ctx.lastAccepted === null
      ? 0
      : haversineMeters(ctx.lastAccepted.lat, ctx.lastAccepted.lon, fix.lat, fix.lon);

  // Auto-pause is checked before the filter, like the legacy service: a
  // stationary run is detected from the incoming fix even when the fix itself
  // is later rejected for distance or accuracy.
  // Swimming is exempt: open-water GPS speed is noisy and a swimmer's slow
  // laps would otherwise false-trigger auto-pause (and freeze moving time).
  const speed = computeSpeed(fix, ctx.lastAccepted, stepDistance);
  const isAutoPaused = ctx.isSwimming ? false : handleAutoPause(ctx, fix, speed);
  if (isAutoPaused) {
    ctx.autoPausedCount += 1;
    ctx.lastAccepted = fix;
    return;
  }

  const reason = filterReason(fix, ctx.lastAccepted, ctx.filterOptions, ctx.meta);
  if (reason !== null) {
    ctx.rejected.push({ index, reason });
    return;
  }

  handleManualPauseBoundary(ctx, fix);

  const sample = sampleAltitude(ctx.altitudeState, fix, stepDistance, ctx.isSwimming);
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

  ctx.distanceMeters += stepDistance;

  const fixSpeed = computeSpeed(fix, ctx.lastAccepted, stepDistance);
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

function computeTimeAccounting(
  ctx: ReplayContext,
  meta: RecordingMeta,
  fixes: FixLogEntry[]
): { elapsedSec: number; manualPauseMs: number; autoPauseMs: number } {
  const startedAt = meta.startedAtUtcMs;
  const endedAt = meta.endedAtUtcMs ?? (fixes.length > 0 ? fixes.at(-1)!.t : startedAt);
  const elapsedSec = Math.max(0, Math.floor((endedAt - startedAt) / 1000));

  let manualPauseMs = 0;
  for (const pause of meta.pauses ?? []) {
    const pauseEnd = pause.endUtcMs ?? endedAt;
    manualPauseMs += Math.max(0, pauseEnd - pause.startUtcMs);
  }

  let autoPauseMs = 0;
  for (const gap of ctx.autoPauseGaps) {
    autoPauseMs += Math.max(0, gap.endMs - gap.startMs);
  }

  return { elapsedSec, manualPauseMs, autoPauseMs };
}

export function replaySession(
  meta: RecordingMeta,
  fixes: FixLogEntry[],
  skipped = 0
): ReplayResult {
  const isSwimming = meta.profile === 'swimming';
  const filterOptions =
    PROFILE_FILTER_OPTIONS[meta.profile as Profile] ?? PROFILE_FILTER_OPTIONS.walking;

  const ctx: ReplayContext = {
    meta,
    filterOptions,
    isSwimming,
    fixes,
    latlng: [],
    altitude: [],
    time: [],
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
    splitDetector: new SplitDetector({ audioEnabled: false, hapticEnabled: false })
  };

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

  return {
    stream,
    segments: ctx.segments,
    stats: {
      distanceMeters: ctx.distanceMeters,
      elapsedTimeSec: elapsedSec,
      movingTimeSec,
      elevationGainMeters: isSwimming ? 0 : ctx.altitudeState.gain,
      elevationLossMeters: isSwimming ? 0 : ctx.altitudeState.loss,
      maxSpeedMetersPerSec: ctx.maxSpeedMps,
      averageSpeedMetersPerSec: averageSpeedMps
    },
    rejected: ctx.rejected,
    skipped,
    recovered: meta.endedAtUtcMs == null,
    splits: ctx.splits,
    autoPausedCount: ctx.autoPausedCount
  };
}
