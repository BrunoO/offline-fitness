## Memoization Audit - Candidates for Future Cleanup

This document lists remaining uses of `useMemo`, `useCallback`, and `React.memo` that we may consider removing or refactoring in a future pass. Many are tied to list performance or third‑party libraries (FlashList, Reanimated, Maps) and should be evaluated carefully.

### Activities
- `src/features/activities/screens/DetailsScreen.tsx`
  - useCallback: `onDeleteActivity`, `keyExtractor`, `handleActivityPress`, `renderItem`, `clearSearch`
  - useMemo: `sortedActivities`, `filteredActivities`
- `src/features/activities/components/ActivityAnalysisView.tsx`
  - useMemo: `trackSimilarCount` (and any additional memoizations within the file)
- `src/features/activities/components/ActivityListItem.tsx`
  - React.memo: `MemoizedActivityListItem`

### Activities Hooks
- `src/features/activities/hooks/useProcessedActivities.ts`
  - useMemo: `myActivitiesToUse`, `allActivitiesToUse`

### Home
- `src/features/home/components/ActivityCalendarPeriod.tsx`
  - useMemo: `currentWeekNumber`, `weekActivitiesMap`, `markedDates`
  - useCallback: `handleWeekNumberPress`, `isWeeklyGoalAchieved`, `handleDayPress`

### Maps
- `src/features/maps/screens/MapsScreen.android.tsx`
  - useMemo: `currentlyFilteredActivities`
  - useCallback: `refitMapToVisibleActivities`
- `src/features/maps/components/MiniMapComponent.android.tsx`
  - useCallback: `fitToTrack`, `onMapReady`, `onMapLoaded`, `onLayout`, and another inline callback
- `src/features/maps/components/MiniMapComponent.web.tsx`
  - useCallback: `onMapReady`

### Auth
- `src/features/auth/services/AuthService.ts`
  - useCallback: `retrieveToken`, `get_access_token`, `disconnect`

### Notes
- Many of the above are tied to:
  - List rendering performance (e.g., FlashList `renderItem`, `keyExtractor`).
  - Reanimated/Gesture Handler callbacks that benefit from stable identities.
  - Map components that may expect stable callbacks.
- Prefer profiling before removal. Reintroduce memoization selectively if regressions appear.


