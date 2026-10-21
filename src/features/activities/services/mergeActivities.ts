export interface MergeActivitiesResult<TActivity> {
  myActivitiesMerged: string[];
  activitiesMerged: TActivity[];
}

/**
 * Strava types folded into a sibling type when merging is enabled.
 * The activity list *and* the type list have to follow this map: dropping the
 * source type from the list without adding the target leaves the stats tables
 * keying a column that was never initialised, which yields NaN totals.
 */
const MERGED_ACTIVITY_TYPES: Record<string, string> = {
  EBikeRide: 'Ride',
  Hike: 'Walk',
  Workout: 'Yoga' // Strava has returned 'Workout' for Yoga activities since 2025-08-20; the archive importer keeps both raw types, so fold Workout here
};

export function mergeActivities<TActivity extends { type: string }>(
  myActivities: string[],
  activities: TActivity[],
  enabled: boolean
): MergeActivitiesResult<TActivity> {
  if (!enabled) {
    return { myActivitiesMerged: myActivities, activitiesMerged: activities };
  }

  const activitiesMerged = activities.map(a => {
    const mergedType = MERGED_ACTIVITY_TYPES[a.type];
    return mergedType ? ({ ...a, type: mergedType } as TActivity) : a;
  });

  // Rename in place and de-duplicate, so 'Ride' keeps the position 'EBikeRide'
  // had and a list holding both collapses to one column.
  const myActivitiesMerged = Array.from(
    new Set(myActivities.map(type => MERGED_ACTIVITY_TYPES[type] ?? type))
  );

  return { myActivitiesMerged, activitiesMerged };
}
