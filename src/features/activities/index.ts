// Activities Feature - Public API
// This file exports all public interfaces for the activities feature

// Context and Hooks
export {
  ActivitiesProvider,
  useActivitiesContext,
  useActivitiesDataContext,
  useActivitiesSyncContext
} from './ActivitiesContext';
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
export { LastActivitySummary } from './components/LastActivitySummary';

// Screens
export { DetailsScreen } from './screens/DetailsScreen';
