import { Activity } from '@/shared/types/types';
import { calculatePaceMinPerKm, calculateSpeedKmh } from '@/shared/utils/utils';

export interface ExtremeRecord {
  value: number;
  name: string | null;
  id: string | null;
}

export interface ActivityExtremes {
  longestDistance: ExtremeRecord;
  longestDuration: ExtremeRecord;
  mostElevation: ExtremeRecord;
  fastestSpeed: ExtremeRecord;
  bestPace: ExtremeRecord;
}

export interface DistanceBenchmarkDefinition {
  key: string;
  label: string;
  targetMeters: number;
  minQualifiedMeters: number;
}

export interface DistanceBenchmarkResult {
  key: string;
  label: string;
  targetMeters: number;
  estimatedTimeSeconds: number;
  paceMinPerKm: number;
  activityId: string;
  activityName: string;
  activityDistanceMeters: number;
  activityDate: string;
}

/**
 * Classic running benchmark distances with a 2% GPS tolerance on minimum qualifying distance
 * (e.g. a 5K race logged at 4.92 km by GPS still qualifies, scaled proportionally to 5.000 km).
 */
export const RUNNING_DISTANCE_BENCHMARKS: readonly DistanceBenchmarkDefinition[] = [
  { key: '5k', label: '5K', targetMeters: 5000, minQualifiedMeters: 4900 },
  { key: '10k', label: '10K', targetMeters: 10000, minQualifiedMeters: 9800 },
  { key: 'half', label: 'Half Marathon', targetMeters: 21097.5, minQualifiedMeters: 20800 },
  { key: 'marathon', label: 'Marathon', targetMeters: 42195, minQualifiedMeters: 41800 }
];

const RUNNING_SPORT_TYPES = new Set<string>([
  'run',
  'running',
  'trailrun',
  'trail run',
  'virtualrun',
  'virtual run'
]);

export function isRunningActivityType(sport: string | undefined | null): boolean {
  if (!sport) return false;
  return RUNNING_SPORT_TYPES.has(sport.toLowerCase());
}

/**
 * Returns available sport filter options ordered with `'All'` first, followed by
 * sports present in `activities` sorted by frequency (most frequent first).
 */
export function computeRecordSportOptions(activities: readonly Activity[]): string[] {
  const counts = new Map<string, number>();
  for (const a of activities) {
    if (!a.type) continue;
    counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  }
  const sortedSports = Array.from(counts.keys()).sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    return diff === 0 ? a.localeCompare(b) : diff;
  });
  return ['All', ...sortedSports];
}

function getEffectiveTimeSeconds(activity: Activity, useElapsedTime: boolean): number {
  if (useElapsedTime) {
    return activity.elapsed_time;
  }
  return activity.moving_time > 0 ? activity.moving_time : activity.elapsed_time;
}

function updateSpeedAndPace(
  activity: Activity,
  timeSeconds: number,
  extremes: { fastestSpeed: ExtremeRecord; bestPace: ExtremeRecord }
): void {
  if (timeSeconds <= 0 || activity.distance <= 0) return;
  const speedKmh = calculateSpeedKmh(activity.distance, timeSeconds);
  if (speedKmh > extremes.fastestSpeed.value) {
    extremes.fastestSpeed = { value: speedKmh, name: activity.name, id: activity.id };
  }
  const paceMinPerKm = calculatePaceMinPerKm(activity.distance, timeSeconds);
  if (paceMinPerKm > 0 && paceMinPerKm < extremes.bestPace.value) {
    extremes.bestPace = { value: paceMinPerKm, name: activity.name, id: activity.id };
  }
}

export function computeActivityExtremes(
  activities: readonly Activity[],
  useElapsedTime = true
): ActivityExtremes {
  let longestDistance: ExtremeRecord = { value: 0, name: null, id: null };
  let longestDuration: ExtremeRecord = { value: 0, name: null, id: null };
  let mostElevation: ExtremeRecord = { value: 0, name: null, id: null };
  const speedAndPace = {
    fastestSpeed: { value: 0, name: null, id: null } as ExtremeRecord,
    bestPace: { value: Infinity, name: null, id: null } as ExtremeRecord
  };

  for (const activity of activities) {
    const distanceKm = activity.distance / 1000;
    const timeSeconds = getEffectiveTimeSeconds(activity, useElapsedTime);
    if (distanceKm > longestDistance.value) {
      longestDistance = { value: distanceKm, name: activity.name, id: activity.id };
    }
    if (timeSeconds > longestDuration.value) {
      longestDuration = { value: timeSeconds, name: activity.name, id: activity.id };
    }
    if (activity.total_elevation_gain > mostElevation.value) {
      mostElevation = {
        value: activity.total_elevation_gain,
        name: activity.name,
        id: activity.id
      };
    }
    updateSpeedAndPace(activity, timeSeconds, speedAndPace);
  }

  return {
    longestDistance,
    longestDuration,
    mostElevation,
    fastestSpeed: speedAndPace.fastestSpeed,
    bestPace: speedAndPace.bestPace
  };
}

function evaluateBenchmarkCandidate(
  activity: Activity,
  benchmark: DistanceBenchmarkDefinition,
  useElapsedTime: boolean
): DistanceBenchmarkResult | null {
  if (!isRunningActivityType(activity.type)) return null;
  if (typeof activity.distance !== 'number' || activity.distance < benchmark.minQualifiedMeters) {
    return null;
  }
  const timeSeconds = getEffectiveTimeSeconds(activity, useElapsedTime);
  if (typeof timeSeconds !== 'number' || timeSeconds <= 0) return null;

  const paceMinPerKm = calculatePaceMinPerKm(activity.distance, timeSeconds);
  if (paceMinPerKm <= 0) return null;

  const estimatedTimeSeconds = Math.round(
    timeSeconds * (benchmark.targetMeters / activity.distance)
  );
  const activityDate =
    activity.local_date ??
    `${activity.start_year}-${String(activity.start_month + 1).padStart(2, '0')}-${String(activity.start_day).padStart(2, '0')}`;

  return {
    key: benchmark.key,
    label: benchmark.label,
    targetMeters: benchmark.targetMeters,
    estimatedTimeSeconds,
    paceMinPerKm,
    activityId: activity.id,
    activityName: activity.name,
    activityDistanceMeters: activity.distance,
    activityDate
  };
}

/**
 * Computes all-time fastest running benchmark efforts (5K, 10K, Half Marathon, Marathon)
 * across the provided activities. An activity qualifies for a benchmark if it is a running
 * activity with distance >= `minQualifiedMeters`, and its time is scaled proportionally
 * to `targetMeters` based on its average pace.
 */
export function computeRunningBenchmarkPRs(
  activities: readonly Activity[],
  useElapsedTime = false
): DistanceBenchmarkResult[] {
  const bestByKey = new Map<string, DistanceBenchmarkResult>();

  for (const activity of activities) {
    for (const benchmark of RUNNING_DISTANCE_BENCHMARKS) {
      const candidate = evaluateBenchmarkCandidate(activity, benchmark, useElapsedTime);
      if (!candidate) continue;
      const existing = bestByKey.get(benchmark.key);
      if (!existing || candidate.estimatedTimeSeconds < existing.estimatedTimeSeconds) {
        bestByKey.set(benchmark.key, candidate);
      }
    }
  }

  const results: DistanceBenchmarkResult[] = [];
  for (const benchmark of RUNNING_DISTANCE_BENCHMARKS) {
    const found = bestByKey.get(benchmark.key);
    if (found) {
      results.push(found);
    }
  }
  return results;
}

/**
 * Formats a benchmark duration in seconds as `H:MM:SS` (when >= 1h) or `MM:SS` (when < 1h).
 */
export function formatBenchmarkTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
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
