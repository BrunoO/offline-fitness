import { mergeActivities } from '@/features/activities/services/mergeActivities';
import { makeTestActivity } from '../helpers/testActivities';

describe('mergeActivities', () => {
  it('passes both lists through untouched when merging is off', () => {
    const activities = [makeTestActivity({ id: '1', type: 'EBikeRide' })];
    const result = mergeActivities(['EBikeRide'], activities, false);
    expect(result.myActivitiesMerged).toEqual(['EBikeRide']);
    expect(result.activitiesMerged).toBe(activities);
  });

  it('renames the folded types in the activity list', () => {
    const activities = [
      makeTestActivity({ id: '1', type: 'EBikeRide' }),
      makeTestActivity({ id: '2', type: 'Hike' }),
      makeTestActivity({ id: '3', type: 'Run' })
    ];
    const result = mergeActivities(['EBikeRide', 'Hike', 'Run'], activities, true);
    expect(result.activitiesMerged.map(a => a.type)).toEqual(['Ride', 'Walk', 'Run']);
  });

  // The type list drives the table columns. It has to follow the renamed
  // activities, or yearlyData keys a column that was never initialised.
  it('renames the folded types in the type list instead of dropping them', () => {
    const activities = [makeTestActivity({ id: '1', type: 'EBikeRide' })];
    const result = mergeActivities(['EBikeRide'], activities, true);
    expect(result.myActivitiesMerged).toEqual(['Ride']);
  });

  it('keeps the position of a renamed type', () => {
    const activities = [
      makeTestActivity({ id: '1', type: 'EBikeRide' }),
      makeTestActivity({ id: '2', type: 'Run' })
    ];
    const result = mergeActivities(['EBikeRide', 'Run'], activities, true);
    expect(result.myActivitiesMerged).toEqual(['Ride', 'Run']);
  });

  it('collapses a list that holds both the folded type and its target', () => {
    const activities = [
      makeTestActivity({ id: '1', type: 'Ride' }),
      makeTestActivity({ id: '2', type: 'EBikeRide' })
    ];
    const result = mergeActivities(['Ride', 'EBikeRide'], activities, true);
    expect(result.myActivitiesMerged).toEqual(['Ride']);
  });
});
