/**
 * Single entry point for the native recording module.
 *
 * The module lives outside `src/` (a local Expo module under `modules/`), so
 * the long relative path is kept here instead of being repeated across the
 * feature.
 */
export { GpsTracker, gpsTrackerEvents } from '../../../../modules/gps-tracker/src';
export type {
  CaptureOptions,
  FixLogEntry,
  GpsTrackerCapabilities,
  LocationUpdate,
  LiveStats,
  PauseInterval,
  Profile,
  RecordingMeta,
  RecordingOptions,
  RecordingPhase,
  RecordingState,
  RecordingSummary
} from '../../../../modules/gps-tracker/src';
