import { Activity, compareActivitiesByUtcDesc, simpleLogger } from '@/shared';
import * as Storage from '@/shared/services/storage';
import { useCallback, useMemo, useState } from 'react';

/**
 * A hook for managing activities.
 * @returns An object with activities data and functions.
 */
export function useActivities() {
  const [globalActivities, setGlobalActivities] = useState<Activity[]>([]);
  const [totalActivitiesStored, setTotalActivitiesStored] = useState(0);
  const [fetchingData, setFetchingData] = useState(true);

  // Derived from globalActivities (always sorted descending by true UTC instant) so
  // it stays correct after any setGlobalActivities call without a separate state.
  const mostRecentActivity = useMemo(() => globalActivities[0], [globalActivities]);

  const myActivitiesDiscovered = useMemo(() => {
    const discovered = new Set<string>();
    globalActivities.forEach(a => discovered.add(a.type));
    return discovered;
  }, [globalActivities]);

  /**
   * Reloads activities from local storage only, without touching the network.
   * This is the only way activities enter the app: they come from a Strava
   * archive import, which writes the same local records the API used to write.
   */
  const reloadActivitiesFromLocalStorage = useCallback(async (): Promise<void> => {
    try {
      const keys = await Storage.getAllActivitiesKeys();
      simpleLogger.log('Total activities found in local storage ' + keys.length);
      setTotalActivitiesStored(keys.length);
      const loadedActivities = await Storage.loadAllActivities(keys);
      // Sort activities by true UTC instant in descending order (most recent first)
      const sortedActivities = [...loadedActivities].sort(compareActivitiesByUtcDesc);
      setGlobalActivities(sortedActivities as Activity[]);
      setFetchingData(false);
    } catch (error) {
      simpleLogger.error('Failed to load local activities', {
        message: error instanceof Error ? error.message : String(error)
      });
      setFetchingData(false);
    }
  }, []);

  const refreshActivities = useCallback((): Promise<void> => {
    setFetchingData(true);
    return reloadActivitiesFromLocalStorage();
  }, [reloadActivitiesFromLocalStorage]);

  /**
   * Deletes an activity.
   * @param activity The activity to delete.
   */
  async function deleteActivity(activity: Activity): Promise<void> {
    simpleLogger.log('APP LEVEL - deleteActivity', {
      activityToDelete: activity,
      currentGlobalActivitiesLength: globalActivities.length
    });
    try {
      await Storage.removeActivity(activity);
    } catch (error) {
      simpleLogger.error('Failed to remove activity from storage:', error);
      return;
    }
    simpleLogger.log('Storage.removeActivity completed');
    // WebDAV backup tombstone: the next sync push deletes the remote
    // copy too. A failure only delays the propagation; it must not fail
    // the local delete the user just confirmed.
    try {
      await Storage.addActivityTombstone(String(activity.id));
    } catch (e) {
      simpleLogger.error('Could not record backup tombstone: ' + e);
    }
    setGlobalActivities(prev => {
      // Maintain sorted order after deletion
      const next = prev.filter(a => a.id !== activity.id).sort(compareActivitiesByUtcDesc);
      simpleLogger.log('setGlobalActivities', {
        prevLength: prev.length,
        newLength: next.length
      });
      return next;
    });
    setTotalActivitiesStored(prev => prev - 1);
  }

  return {
    globalActivities,
    mostRecentActivity,
    totalActivitiesStored,
    fetchingData,
    refreshActivities,
    reloadActivitiesFromLocalStorage,
    deleteActivity,
    myActivitiesDiscovered,
    setGlobalActivities,
    setTotalActivitiesStored
  };
}
