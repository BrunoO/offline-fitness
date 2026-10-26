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
export type { CompressStreamOptions } from './services/fetchAndStoreStreams';

// Services
export {
  calculateAdaptiveTolerance,
  calculateAndStoreMissingBoundingBoxes,
  compressStreamSet,
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
  buildManualTypeList,
  deviceTimezoneLabel,
  MANUAL_ACTIVITY_TYPES,
  MANUAL_DURATION_PRESETS_MIN
} from './services/manualActivity';
export type { ManualActivityInput } from './services/manualActivity';
export {
  addCustomManualEntryType,
  loadManualEntryPrefs,
  saveLastManualEntryType
} from './services/manualEntryPrefs';
export type { ManualEntryPrefs } from './services/manualEntryPrefs';

// Screens
export { DetailsScreen } from './screens/DetailsScreen';
