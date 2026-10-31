import { useSettings } from '@/features/stats/StatsTabSettingsContext';
import { Activity } from '@/shared';
import { mergeActivities } from '../services/mergeActivities';
import { useMemo } from 'react';

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
  // Memoise so the O(n) merge (and the new arrays it produces) only run when
  // their inputs change; otherwise every render of the stats screens
  // invalidated the downstream useMemo/useMemo chains.
  const { myActivitiesMerged, activitiesMerged } = useMemo(
    () => mergeActivities(myActivities, allActivities, mergeSimilarActivities),
    [myActivities, allActivities, mergeSimilarActivities]
  );

  return { myActivitiesToUse: myActivitiesMerged, allActivitiesToUse: activitiesMerged };
}
