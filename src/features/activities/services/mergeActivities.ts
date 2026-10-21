export interface MergeActivitiesResult<TActivity> {
  myActivitiesMerged: string[];
  activitiesMerged: TActivity[];
}

export function mergeActivities<TActivity extends { type: string }>(
  myActivities: string[],
  activities: TActivity[],
  enabled: boolean
): MergeActivitiesResult<TActivity> {
  if (!enabled) {
    return { myActivitiesMerged: myActivities, activitiesMerged: activities };
  }

  const activitiesMerged = activities.map(a => {
    if (a.type === 'EBikeRide') {
      return { ...a, type: 'Ride' } as TActivity;
    }
    if (a.type === 'Hike') {
      return { ...a, type: 'Walk' } as TActivity;
    }
    return a;
  });

  const myActivitiesMerged = myActivities.filter(a => a !== 'EBikeRide' && a !== 'Hike');

  return { myActivitiesMerged, activitiesMerged };
}
