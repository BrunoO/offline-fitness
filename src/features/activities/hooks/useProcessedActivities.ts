import { useSettings } from '@/features/stats/StatsTabSettingsContext';
import { Activity } from '@/shared';
import { mergeActivities } from '../services/mergeActivities';

/**
 * A hook for processing activities based on the app settings.
 * @param myActivities An array of activity types.
 * @param allActivities An array of all activities.
 * @returns An object with the processed activities.
 */
export function useProcessedActivities(
  myActivities: string[],
  allActivities: Activity[]
): {
  myActivitiesToUse: string[];
  allActivitiesToUse: Activity[];
} {
  const { mergeSimilarActivities } = useSettings();
  const { myActivitiesMerged, activitiesMerged } = mergeActivities(
    myActivities,
    allActivities,
    mergeSimilarActivities
  );

  return { myActivitiesToUse: myActivitiesMerged, allActivitiesToUse: activitiesMerged };
}
