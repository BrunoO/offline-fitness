import { useMemo } from 'react';
import { Activity, isNoGpsActivity } from '@/shared';

/**
 * Applies search, type, and no-stream filters to the sorted activity list.
 *
 * Extracted from `DetailsScreen` to keep the screen below its complexity
 * budget and make the filtering pipeline independently testable.
 */
export function filterActivitiesList(
  sortedActivities: Activity[],
  query: string,
  selectedTypes: Set<string>,
  hideNoStream: boolean,
  noStreamIds: Set<string>
): Activity[] {
  const normalizedQuery = query.trim().toLowerCase();
  const nameFiltered =
    normalizedQuery.length === 0
      ? sortedActivities
      : sortedActivities.filter(a => (a.name || '').toLowerCase().includes(normalizedQuery));
  const typeFiltered =
    selectedTypes.size === 0 ? nameFiltered : nameFiltered.filter(a => selectedTypes.has(a.type));
  if (!hideNoStream) return typeFiltered;
  return typeFiltered.filter(a => !isNoGpsActivity(a.type) && !noStreamIds.has(a.id));
}

/**
 * Memoised wrapper around {@link filterActivitiesList} for use in components.
 */
export function useFilteredActivities(
  sortedActivities: Activity[],
  query: string,
  selectedTypes: Set<string>,
  hideNoStream: boolean,
  noStreamIds: Set<string>
): Activity[] {
  return useMemo(
    () => filterActivitiesList(sortedActivities, query, selectedTypes, hideNoStream, noStreamIds),
    [sortedActivities, query, selectedTypes, hideNoStream, noStreamIds]
  );
}
