import { Activity, isNoGpsActivity } from '@/shared';
import { calculateSpeedKmh } from '@/shared/utils/utils';

export interface ActivityStats {
  averageDistance: number;
  averageElevationGain: number;
  averageSpeed: number;
  distancePercentile: number;
  elevationGainPercentile: number;
  speedPercentile: number;
  totalActivities: number;
  distanceRank?: number;
  elevationGainRank?: number;
  speedRank?: number;
}

export function calculateRecentActivityStats(
  recentActivity: Activity,
  allActivities: Activity[]
): ActivityStats | null {
  if (isNoGpsActivity(recentActivity.type)) {
    return null;
  }

  const currentYear = recentActivity.start_year;
  const activitiesThisYear = allActivities.filter(
    activity => activity.type === recentActivity.type && activity.start_year === currentYear
  );

  if (activitiesThisYear.length === 0) {
    return null;
  }

  const totalActivities = activitiesThisYear.length;

  const totalDistance = activitiesThisYear.reduce((sum, activity) => sum + activity.distance, 0);
  const totalElevationGain = activitiesThisYear.reduce(
    (sum, activity) => sum + activity.total_elevation_gain,
    0
  );
  // Normalize speed computation across sports using distance and moving_time.
  // Strava's average_speed can vary (m/s, missing for swims, etc.).
  const speedsKmh = activitiesThisYear.map(a => calculateSpeedKmh(a.distance, a.moving_time));
  const totalSpeed = speedsKmh.reduce((sum, s) => sum + s, 0);

  const averageDistance = totalDistance / totalActivities;
  const averageElevationGain = totalElevationGain / totalActivities;
  const averageSpeed = totalSpeed / totalActivities;

  const distancePercentile =
    (activitiesThisYear.filter(activity => activity.distance < recentActivity.distance).length /
      totalActivities) *
    100;
  const elevationGainPercentile =
    (activitiesThisYear.filter(
      activity => activity.total_elevation_gain < recentActivity.total_elevation_gain
    ).length /
      totalActivities) *
    100;
  const recentSpeed = calculateSpeedKmh(recentActivity.distance, recentActivity.moving_time);
  const speedPercentile = (speedsKmh.filter(s => s < recentSpeed).length / totalActivities) * 100;

  const sortByDistance = [...activitiesThisYear].sort((a, b) => b.distance - a.distance);
  const distanceRank = sortByDistance.findIndex(a => a.id === recentActivity.id) + 1;

  const sortByElevationGain = [...activitiesThisYear].sort(
    (a, b) => b.total_elevation_gain - a.total_elevation_gain
  );
  const elevationGainRank = sortByElevationGain.findIndex(a => a.id === recentActivity.id) + 1;

  const sortBySpeedIdx = [...speedsKmh]
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => b.s - a.s)
    .findIndex(entry => activitiesThisYear[entry.idx].id === recentActivity.id);
  const speedRank = sortBySpeedIdx + 1;

  return {
    averageDistance,
    averageElevationGain,
    averageSpeed,
    distancePercentile,
    elevationGainPercentile,
    speedPercentile,
    totalActivities,
    distanceRank,
    elevationGainRank,
    speedRank
  };
}
