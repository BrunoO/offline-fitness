import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type {
  GpsTrackerCapabilities,
  LocationUpdate,
  RecordingMeta,
  RecordingOptions,
  RecordingState,
  RecordingSummary
} from './GpsTracker.types';

interface GpsTrackerNativeModule {
  getCapabilities(): Promise<GpsTrackerCapabilities>;
  startRecording(options: RecordingOptions): Promise<RecordingMeta>;
  pauseRecording(): Promise<void>;
  resumeRecording(): Promise<void>;
  stopRecording(): Promise<RecordingSummary>;
  getRecordingState(): Promise<RecordingState>;
  getSessionMeta(sessionId?: string): Promise<RecordingMeta>;
  listSessions(): Promise<RecordingMeta[]>;
  markSessionSaved(sessionId: string, activityId: string): Promise<void>;
  discardSession(sessionId: string): Promise<void>;
  getStorageSize(): Promise<number>;
  deleteAllSessions(): Promise<void>;
  addListener(
    eventName: 'onStateChange',
    listener: (state: RecordingState) => void
  ): EventSubscription;
  addListener(
    eventName: 'onLocationUpdate',
    listener: (update: LocationUpdate) => void
  ): EventSubscription;
}

let nativeModule: GpsTrackerNativeModule | null = null;

/**
 * Resolved on first use, not at import time: a JS bundle running against a dev
 * client built before this module existed must fail one call, not crash the app
 * at startup (the screen turns the throw into an explanatory message).
 */
const loadNativeModule = (): GpsTrackerNativeModule => {
  nativeModule ??= requireNativeModule<GpsTrackerNativeModule>('GpsTracker');
  return nativeModule;
};

export const GpsTracker = {
  getCapabilities: (): Promise<GpsTrackerCapabilities> => loadNativeModule().getCapabilities(),
  startRecording: (options: RecordingOptions): Promise<RecordingMeta> =>
    loadNativeModule().startRecording(options),
  pauseRecording: (): Promise<void> => loadNativeModule().pauseRecording(),
  resumeRecording: (): Promise<void> => loadNativeModule().resumeRecording(),
  stopRecording: (): Promise<RecordingSummary> => loadNativeModule().stopRecording(),
  getRecordingState: (): Promise<RecordingState> => loadNativeModule().getRecordingState(),
  getSessionMeta: (sessionId?: string): Promise<RecordingMeta> =>
    sessionId === undefined
      ? loadNativeModule().getSessionMeta()
      : loadNativeModule().getSessionMeta(sessionId),
  listSessions: (): Promise<RecordingMeta[]> => loadNativeModule().listSessions(),
  markSessionSaved: (sessionId: string, activityId: string): Promise<void> =>
    loadNativeModule().markSessionSaved(sessionId, activityId),
  discardSession: (sessionId: string): Promise<void> => loadNativeModule().discardSession(sessionId),
  getStorageSize: (): Promise<number> => loadNativeModule().getStorageSize(),
  deleteAllSessions: (): Promise<void> => loadNativeModule().deleteAllSessions()
};

export const gpsTrackerEvents = {
  addStateListener: (listener: (state: RecordingState) => void): EventSubscription =>
    loadNativeModule().addListener('onStateChange', listener),
  addLocationListener: (listener: (update: LocationUpdate) => void): EventSubscription =>
    loadNativeModule().addListener('onLocationUpdate', listener)
};
