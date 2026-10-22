// Activities Feature - Public API
// This file exports all public interfaces for the activities feature

// Context and Hooks
export {
  ActivitiesProvider,
  useActivitiesContext,
  useActivitiesDataContext,
  useActivitiesSyncContext
} from './ActivitiesContext';
export { ManualEntryProvider, useManualEntry } from './ManualEntryContext';
export { useActivities } from './hooks/useActivities';
export { useProcessedActivities } from './hooks/useProcessedActivities';

// Types
export type { StreamSet } from './types/stravaActivityStream.model';

// Services
export {
  calculateAndStoreMissingBoundingBoxes,
  correctSwimElevationGain,
  countStreamsStatus,
  deleteStreamFiles,
  getActivityStreams,
  getNoStreamIds,
  loadRawStreamForActivity,
  loadStreamForActivity
} from './services/fetchAndStoreStreams';

// Components
export { ActivityAnalysisView } from './components/ActivityAnalysisView';
export { ActivityListItem } from './components/ActivityListItem';
export { DayActivitiesSheet } from './components/DayActivitiesSheet';
export { LastActivitySummary } from './components/LastActivitySummary';
export { ManualActivitySheet } from './components/ManualActivitySheet';

// Services
export {
  buildManualActivity,
  deviceTimezoneLabel,
  MANUAL_ACTIVITY_TYPES,
  MANUAL_DURATION_PRESETS_MIN
} from './services/manualActivity';

// Screens
export { DetailsScreen } from './screens/DetailsScreen';
