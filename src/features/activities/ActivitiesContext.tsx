import { Activity } from '@/shared';
import React, { createContext, useContext, useMemo } from 'react';
import { useActivities } from '@/features/activities/hooks/useActivities';

// Stable values — only update when actual activity data changes.
// Screens that only display activity data (maps, charts) should use
// useActivitiesDataContext to avoid re-rendering during syncs.
type ActivitiesDataContextType = {
  globalActivities: Activity[];
  mostRecentActivity: Activity | undefined;
  myActivitiesDiscovered: Set<string>;
  deleteActivity: (activity: Activity) => void;
  setGlobalActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  setTotalActivitiesStored: React.Dispatch<React.SetStateAction<number>>;
};

// Volatile values — change while activities are (re)loaded from local storage.
type ActivitiesSyncContextType = {
  totalActivitiesStored: number;
  fetchingData: boolean;
  /** Reloads activities from local storage (no network); used by pull-to-refresh. */
  refreshActivities: () => Promise<void>;
  /** Reload activities from local storage only (no network); used after an archive import. */
  reloadActivitiesFromLocalStorage: () => Promise<void>;
};

const ActivitiesDataContext = createContext<ActivitiesDataContextType | undefined>(undefined);
const ActivitiesSyncContext = createContext<ActivitiesSyncContextType | undefined>(undefined);

/**
 * A provider for the activities context.
 * Exposes two separate contexts so consumers can subscribe only to the values
 * they need, avoiding unnecessary re-renders during high-frequency syncs.
 */
export const ActivitiesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    globalActivities,
    mostRecentActivity,
    myActivitiesDiscovered,
    deleteActivity,
    setGlobalActivities,
    setTotalActivitiesStored,
    totalActivitiesStored,
    fetchingData,
    refreshActivities,
    reloadActivitiesFromLocalStorage
  } = useActivities();

  // Memoized separately so the data context value reference stays stable while
  // the sync values (fetchingData etc.) are updating.
  const dataValue = useMemo(
    () => ({
      globalActivities,
      mostRecentActivity,
      myActivitiesDiscovered,
      deleteActivity,
      setGlobalActivities,
      setTotalActivitiesStored
    }),
    [
      globalActivities,
      mostRecentActivity,
      myActivitiesDiscovered,
      deleteActivity,
      setGlobalActivities,
      setTotalActivitiesStored
    ]
  );

  const syncValue = useMemo(
    () => ({
      totalActivitiesStored,
      fetchingData,
      refreshActivities,
      reloadActivitiesFromLocalStorage
    }),
    [totalActivitiesStored, fetchingData, refreshActivities, reloadActivitiesFromLocalStorage]
  );

  return (
    <ActivitiesDataContext.Provider value={dataValue}>
      <ActivitiesSyncContext.Provider value={syncValue}>{children}</ActivitiesSyncContext.Provider>
    </ActivitiesDataContext.Provider>
  );
};

/**
 * Access stable activity data. Re-renders only when globalActivities changes,
 * not during syncs. Use for map/chart screens that don't need sync progress.
 */
export const useActivitiesDataContext = () => {
  const context = useContext(ActivitiesDataContext);
  if (context === undefined) {
    throw new Error('useActivitiesDataContext must be used within an ActivitiesProvider');
  }
  return context;
};

/**
 * Access sync state (fetchingData, refreshActivities).
 * Re-renders when activities are reloaded — use only where that matters.
 */
export const useActivitiesSyncContext = () => {
  const context = useContext(ActivitiesSyncContext);
  if (context === undefined) {
    throw new Error('useActivitiesSyncContext must be used within an ActivitiesProvider');
  }
  return context;
};

/**
 * Backward-compatible hook returning all context values merged.
 * Prefer useActivitiesDataContext or useActivitiesSyncContext when you only
 * need one half, to avoid subscribing to unnecessary updates.
 */
export const useActivitiesContext = () => ({
  ...useActivitiesDataContext(),
  ...useActivitiesSyncContext()
});
