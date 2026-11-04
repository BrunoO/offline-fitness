import { Activity } from '@/shared/types/types';

export { formatPace, isPaceSport } from '@/shared/utils/utils';

export interface YearPerformanceStats {
  year: number;
  activityCount: number;
  totalDistanceMeters: number;
  totalTimeSeconds: number;
  totalElevationMeters: number;
  /** Average speed in km/h: (totalDistanceMeters / 1000) / (totalTimeSeconds / 3600) */
  avgSpeedKmh: number;
  /** Average pace in minutes per km: (totalTimeSeconds / 60) / (totalDistanceMeters / 1000) */
  avgPaceMinPerKm: number;
  /** Average elevation gain in meters per 10 km: (totalElevationMeters / (totalDistanceMeters / 1000)) * 10 */
  elevationPer10Km: number;
  /** Average distance in kilometers per activity */
  avgDistanceKm: number;
  /** Average duration in seconds per activity */
  avgDurationSeconds: number;
}

interface YearAccumulator {
  count: number;
  distanceMeters: number;
  timeSeconds: number;
  elevationMeters: number;
}

function processActivity(
  a: Activity,
  sport: string,
  useElapsedTime: boolean,
  yearsMap: Map<number, YearAccumulator>
): void {
  if (a.type !== sport) return;
  if (typeof a.distance !== 'number' || a.distance <= 0) return;

  const time = useElapsedTime ? a.elapsed_time : a.moving_time;
  if (typeof time !== 'number' || time <= 0) return;

  const elevation =
    typeof a.total_elevation_gain === 'number' ? Math.max(0, a.total_elevation_gain) : 0;
  const year = a.start_year;
  if (!year || year <= 0) return;

  const current = yearsMap.get(year) ?? {
    count: 0,
    distanceMeters: 0,
    timeSeconds: 0,
    elevationMeters: 0
  };

  current.count += 1;
  current.distanceMeters += a.distance;
  current.timeSeconds += time;
  current.elevationMeters += elevation;
  yearsMap.set(year, current);
}

function buildYearStat(year: number, data: YearAccumulator): YearPerformanceStats | null {
  if (data.count === 0 || data.distanceMeters <= 0 || data.timeSeconds <= 0) return null;

  const distKm = data.distanceMeters / 1000;
  const timeHours = data.timeSeconds / 3600;
  const timeMinutes = data.timeSeconds / 60;

  const avgSpeedKmh = distKm / timeHours;
  const avgPaceMinPerKm = timeMinutes / distKm;
  const elevationPer10Km = (data.elevationMeters / distKm) * 10;
  const avgDistanceKm = distKm / data.count;
  const avgDurationSeconds = data.timeSeconds / data.count;

  return {
    year,
    activityCount: data.count,
    totalDistanceMeters: data.distanceMeters,
    totalTimeSeconds: data.timeSeconds,
    totalElevationMeters: data.elevationMeters,
    avgSpeedKmh: Number.isFinite(avgSpeedKmh) ? avgSpeedKmh : 0,
    avgPaceMinPerKm: Number.isFinite(avgPaceMinPerKm) ? avgPaceMinPerKm : 0,
    elevationPer10Km: Number.isFinite(elevationPer10Km) ? elevationPer10Km : 0,
    avgDistanceKm: Number.isFinite(avgDistanceKm) ? avgDistanceKm : 0,
    avgDurationSeconds: Number.isFinite(avgDurationSeconds) ? avgDurationSeconds : 0
  };
}

/**
 * Aggregates activities for a single sport across years into yearly performance metrics.
 * Excludes activities with 0 distance or non-positive time to prevent NaN/Infinity.
 */
export function computeYearlyPerformanceStats(
  activities: readonly Activity[],
  sport: string,
  useElapsedTime: boolean
): YearPerformanceStats[] {
  const yearsMap = new Map<number, YearAccumulator>();

  for (const a of activities) {
    processActivity(a, sport, useElapsedTime, yearsMap);
  }

  const result: YearPerformanceStats[] = [];
  for (const [year, data] of yearsMap.entries()) {
    const stat = buildYearStat(year, data);
    if (stat) {
      result.push(stat);
    }
  }

  return result.sort((a, b) => a.year - b.year);
}
