import type { Activity } from '@/shared';

export interface HeartRateProfileInput {
  age?: number;
  maxHeartRate?: number;
}

export type HeartRateZoneNumber = 1 | 2 | 3 | 4 | 5;
export type HeartRateZoneCode = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
export type MaxHeartRateSource = 'custom' | 'age' | 'observed' | 'default';

export interface HeartRateZoneDefinition {
  zone: HeartRateZoneNumber;
  code: HeartRateZoneCode;
  name: string;
  /** Lower bound as a fraction of Max HR (e.g. 0.60 for Z2) */
  minPct: number;
  /** Upper bound as a fraction of Max HR (e.g. 0.70 for Z2) */
  maxPct: number;
}

export interface HeartRateZoneBoundary extends HeartRateZoneDefinition {
  /** Inclusive lower BPM displayed for the zone */
  minBpm: number;
  /** Inclusive upper BPM displayed for the zone (for Z5, equals maxHr) */
  maxBpm: number;
}

export interface MaxHeartRateResolution {
  maxHr: number;
  source: MaxHeartRateSource;
}

export interface HeartRateZoneBucket extends HeartRateZoneBoundary {
  seconds: number;
  percentage: number;
}

export interface HeartRateZoneDistribution {
  zones: HeartRateZoneBucket[];
  totalTrackedSeconds: number;
  dominantZone: HeartRateZoneNumber | null;
  maxHrResolution: MaxHeartRateResolution;
}

export const DEFAULT_MAX_HEART_RATE = 190;
export const MIN_OBSERVED_MAX_HR_BPM = 120;
export const MAX_HR_SAMPLE_GAP_SECONDS = 30;

export const HEART_RATE_ZONE_DEFINITIONS: readonly HeartRateZoneDefinition[] = [
  { zone: 1, code: 'Z1', name: 'Recovery', minPct: 0.5, maxPct: 0.6 },
  { zone: 2, code: 'Z2', name: 'Aerobic', minPct: 0.6, maxPct: 0.7 },
  { zone: 3, code: 'Z3', name: 'Tempo', minPct: 0.7, maxPct: 0.8 },
  { zone: 4, code: 'Z4', name: 'Threshold', minPct: 0.8, maxPct: 0.9 },
  { zone: 5, code: 'Z5', name: 'Anaerobic', minPct: 0.9, maxPct: 1.0 }
];

function findHighestObservedMaxHr(
  activities: readonly Activity[] | undefined,
  activityMaxHr: number | null | undefined
): number {
  let highest =
    typeof activityMaxHr === 'number' && Number.isFinite(activityMaxHr) ? activityMaxHr : 0;
  if (activities) {
    for (const a of activities) {
      if (typeof a.max_heartrate === 'number' && a.max_heartrate > highest) {
        highest = a.max_heartrate;
      }
    }
  }
  return Math.round(highest);
}

/**
 * Resolves the athlete's maximum heart rate (in bpm) using the 4-tier hierarchy (`ONT-KIN-07`):
 * 1. `'custom'`: explicit `profile.maxHeartRate` (100..240 bpm)
 * 2. `'age'`: `220 - profile.age` when `profile.age` is 1..120 (clamped to 100..220 bpm)
 * 3. `'observed'`: highest `max_heartrate` across `activities` / `activityMaxHr` (>= 120 bpm)
 * 4. `'default'`: 190 bpm fallback
 */
export function resolveMaxHeartRate(
  options: {
    profile?: HeartRateProfileInput | null;
    activities?: readonly Activity[];
    activityMaxHr?: number | null;
  } = {}
): MaxHeartRateResolution {
  const { profile, activities, activityMaxHr } = options;

  if (
    profile?.maxHeartRate !== undefined &&
    Number.isFinite(profile.maxHeartRate) &&
    profile.maxHeartRate >= 100 &&
    profile.maxHeartRate <= 240
  ) {
    return { maxHr: Math.round(profile.maxHeartRate), source: 'custom' };
  }

  if (
    profile?.age !== undefined &&
    Number.isFinite(profile.age) &&
    profile.age >= 1 &&
    profile.age <= 120
  ) {
    const predicted = Math.max(100, Math.min(220, Math.round(220 - profile.age)));
    return { maxHr: predicted, source: 'age' };
  }

  const observed = findHighestObservedMaxHr(activities, activityMaxHr);
  if (observed >= MIN_OBSERVED_MAX_HR_BPM && observed <= 240) {
    return { maxHr: observed, source: 'observed' };
  }

  return { maxHr: DEFAULT_MAX_HEART_RATE, source: 'default' };
}

/**
 * Computes the 5 heart-rate zone boundaries for a given `maxHr` (`ONT-KIN-07`).
 */
export function computeHeartRateZones(maxHr: number): HeartRateZoneBoundary[] {
  const safeMax =
    Number.isFinite(maxHr) && maxHr >= 100 ? Math.round(maxHr) : DEFAULT_MAX_HEART_RATE;
  const t50 = Math.floor(safeMax * 0.5);
  const t60 = Math.floor(safeMax * 0.6);
  const t70 = Math.floor(safeMax * 0.7);
  const t80 = Math.floor(safeMax * 0.8);
  const t90 = Math.floor(safeMax * 0.9);

  return [
    { ...HEART_RATE_ZONE_DEFINITIONS[0], minBpm: t50, maxBpm: t60 - 1 },
    { ...HEART_RATE_ZONE_DEFINITIONS[1], minBpm: t60, maxBpm: t70 - 1 },
    { ...HEART_RATE_ZONE_DEFINITIONS[2], minBpm: t70, maxBpm: t80 - 1 },
    { ...HEART_RATE_ZONE_DEFINITIONS[3], minBpm: t80, maxBpm: t90 - 1 },
    { ...HEART_RATE_ZONE_DEFINITIONS[4], minBpm: t90, maxBpm: safeMax }
  ];
}

/**
 * Returns the 0-based zone index (`0..4` for `Z1..Z5`) for a valid BPM reading,
 * or `-1` if `bpm` is null, non-finite, or `<= 0`.
 */
export function getZoneIndexForBpm(bpm: number | null | undefined, maxHr: number): number {
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) {
    return -1;
  }
  const safeMax =
    Number.isFinite(maxHr) && maxHr >= 100 ? Math.round(maxHr) : DEFAULT_MAX_HEART_RATE;
  if (bpm < Math.floor(safeMax * 0.6)) return 0;
  if (bpm < Math.floor(safeMax * 0.7)) return 1;
  if (bpm < Math.floor(safeMax * 0.8)) return 2;
  if (bpm < Math.floor(safeMax * 0.9)) return 3;
  return 4;
}

/**
 * Resolves the `HeartRateZoneBoundary` for a live or recorded BPM value.
 */
export function getZoneForBpm(
  bpm: number | null | undefined,
  maxHr: number
): HeartRateZoneBoundary | null {
  const index = getZoneIndexForBpm(bpm, maxHr);
  if (index < 0) return null;
  const zones = computeHeartRateZones(maxHr);
  return zones[index] ?? null;
}

function accumulateTimeSeriesZones(
  heartrate: readonly (number | null)[],
  time: readonly number[],
  maxHr: number,
  zoneSeconds: number[]
): void {
  const len = Math.min(heartrate.length, time.length);
  for (let i = 1; i < len; i++) {
    const bpm = heartrate[i];
    const zoneIdx = getZoneIndexForBpm(bpm, maxHr);
    if (zoneIdx < 0) continue;

    const dt = time[i] - time[i - 1];
    if (!Number.isFinite(dt) || dt <= 0) continue;

    const clampedDt = Math.min(dt, MAX_HR_SAMPLE_GAP_SECONDS);
    zoneSeconds[zoneIdx] += clampedDt;
  }
}

function accumulateSampleFallbackZones(
  heartrate: readonly (number | null)[],
  maxHr: number,
  fallbackDurationSeconds: number | undefined,
  zoneSeconds: number[]
): void {
  const validIndices: number[] = [];
  for (const bpm of heartrate) {
    const zoneIdx = getZoneIndexForBpm(bpm, maxHr);
    if (zoneIdx >= 0) {
      validIndices.push(zoneIdx);
    }
  }
  if (validIndices.length === 0) return;

  const totalSec =
    typeof fallbackDurationSeconds === 'number' &&
    Number.isFinite(fallbackDurationSeconds) &&
    fallbackDurationSeconds > 0
      ? fallbackDurationSeconds
      : validIndices.length;
  const weightPerSample = totalSec / validIndices.length;

  for (const zoneIdx of validIndices) {
    zoneSeconds[zoneIdx] += weightPerSample;
  }
}

/**
 * Computes the time-weighted 5-zone heart-rate distribution (`ONT-KIN-08`).
 * Uses aligned `time` deltas (clamped to `MAX_HR_SAMPLE_GAP_SECONDS = 30`s) when available
 * so Ramer-Douglas-Peucker (`simplify-js`) track compression does not bias zones toward curvy segments.
 */
export function computeHeartRateZoneDistribution(params: {
  heartrate: readonly (number | null)[] | undefined;
  time?: readonly number[];
  maxHrResolution: MaxHeartRateResolution;
  fallbackDurationSeconds?: number;
}): HeartRateZoneDistribution | null {
  const { heartrate, time, maxHrResolution, fallbackDurationSeconds } = params;
  if (!heartrate || heartrate.length === 0) return null;

  const { maxHr } = maxHrResolution;
  const zoneSeconds = [0, 0, 0, 0, 0];
  const hasAlignedTime =
    Array.isArray(time) && time.length === heartrate.length && time.length >= 2;

  if (hasAlignedTime) {
    accumulateTimeSeriesZones(heartrate, time, maxHr, zoneSeconds);
  } else {
    accumulateSampleFallbackZones(heartrate, maxHr, fallbackDurationSeconds, zoneSeconds);
  }

  const totalTrackedSeconds = zoneSeconds.reduce((sum, s) => sum + s, 0);
  if (totalTrackedSeconds <= 0) {
    return null;
  }

  const boundaries = computeHeartRateZones(maxHr);
  let dominantZone: HeartRateZoneNumber | null = null;
  let maxSec = 0;

  const zones: HeartRateZoneBucket[] = boundaries.map((b, idx) => {
    const sec = Math.round(zoneSeconds[idx]);
    const pct = (zoneSeconds[idx] / totalTrackedSeconds) * 100;
    if (zoneSeconds[idx] > maxSec) {
      maxSec = zoneSeconds[idx];
      dominantZone = b.zone;
    }
    return {
      ...b,
      seconds: sec,
      percentage: pct
    };
  });

  return {
    zones,
    totalTrackedSeconds: Math.round(totalTrackedSeconds),
    dominantZone,
    maxHrResolution
  };
}

/**
 * Formats a duration in seconds as `H:MM:SS` (when >= 1h) or `M:SS` (when < 1h).
 */
export function formatZoneDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const rounded = Math.round(seconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}

export function formatMaxHrSourceLabel(source: MaxHeartRateSource): string {
  switch (source) {
    case 'custom':
      return 'custom profile';
    case 'age':
      return '220 − age';
    case 'observed':
      return 'observed peak';
    case 'default':
      return 'default';
  }
}
