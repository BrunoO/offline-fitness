import { simpleLogger } from '@/shared';
import { useActivitiesContext } from '@/features/activities';
import { useCallback, useEffect, useState } from 'react';
import { GpsTracker, gpsTrackerEvents } from '../services/gpsTracker';
import type {
  GpsTrackerCapabilities,
  LiveStats,
  Profile,
  RecordingState,
  RecordingSummary
} from '../services/gpsTracker';
import { buildRecordedActivity } from '../services/buildRecordedActivity';
import { readFixLog } from '../services/fixLog';
import { PROFILE_CAPTURE_OPTIONS } from '../services/profiles';
import { replaySession } from '../services/replaySession';
import { useRecordingPermissions } from './useRecordingPermissions';
import { writeStreamFile } from '../services/writeStreamFile';

const MODULE_UNAVAILABLE = 'The recording module is not available in this build.';

const IDLE_STATE: RecordingState = { phase: 'idle' };

export interface UseRecordingResult {
  capabilities: GpsTrackerCapabilities | null;
  state: RecordingState;
  liveStats: LiveStats | null;
  summary: RecordingSummary | null;
  error: string | null;
  isBusy: boolean;
  isSaving: boolean;
  start: (profile: Profile) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  save: (name: string) => Promise<void>;
  discard: () => Promise<void>;
}

const describeError = (cause: unknown, fallback: string): string => {
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  return fallback;
};

/**
 * Drives the native recorder and the save flow.
 *
 * The service owns the session, so this hook is a thin client: it starts,
 * pauses, resumes and stops, and it treats the state event as the truth about
 * the phase. Saving is a separate, retryable flow (replay → write stream →
 * store activity → mark saved) so a failed save leaves the session intact and
 * "Save" stays available.
 */
export function useRecording(): UseRecordingResult {
  const { requestPermissions } = useRecordingPermissions();
  const { addActivity } = useActivitiesContext();
  const [capabilities, setCapabilities] = useState<GpsTrackerCapabilities | null>(null);
  const [state, setState] = useState<RecordingState>(IDLE_STATE);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [summary, setSummary] = useState<RecordingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadState = async () => {
      try {
        const [nextCapabilities, nextState] = await Promise.all([
          GpsTracker.getCapabilities(),
          GpsTracker.getRecordingState()
        ]);
        if (isMounted) {
          setCapabilities(nextCapabilities);
          setState(nextState);
          if (nextState.phase === 'stopped-unsaved' && nextState.sessionId) {
            try {
              const meta = await GpsTracker.getSessionMeta(nextState.sessionId);
              setSummary({
                meta,
                liveStats: {
                  elapsedSec: 0,
                  distanceMeters: 0,
                  currentSpeedMps: null,
                  altitudeM: null
                }
              });
            } catch (cause: unknown) {
              simpleLogger.error('Could not load the stopped session', cause);
            }
          }
        }
      } catch (cause: unknown) {
        simpleLogger.error('Recording module unavailable', cause);
        if (isMounted) {
          setError(MODULE_UNAVAILABLE);
        }
      }
    };

    void loadState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let stateSubscription: { remove: () => void } | null = null;
    let locationSubscription: { remove: () => void } | null = null;

    try {
      stateSubscription = gpsTrackerEvents.addStateListener(nextState => setState(nextState));
      locationSubscription = gpsTrackerEvents.addLocationListener(update => {
        setLiveStats({
          elapsedSec: update.elapsedSec,
          distanceMeters: update.distanceMeters,
          currentSpeedMps: update.speedMps,
          altitudeM: update.eleM
        });
      });
    } catch (cause: unknown) {
      // The capabilities effect already reports a missing module.
      simpleLogger.error('Recording events unavailable', cause);
    }

    return () => {
      stateSubscription?.remove();
      locationSubscription?.remove();
    };
  }, []);

  const start = useCallback(
    async (profile: Profile) => {
      setError(null);
      setIsBusy(true);

      try {
        const isLocationAllowed = await requestPermissions();
        if (!isLocationAllowed) {
          setError('Location permission is required to record.');
          setIsBusy(false);
          return;
        }

        const meta = await GpsTracker.startRecording({
          profile,
          capture: PROFILE_CAPTURE_OPTIONS[profile]
        });
        setState({
          phase: 'recording',
          sessionId: meta.sessionId,
          startedAtUtcMs: meta.startedAtUtcMs
        });
        setLiveStats(null);
      } catch (cause: unknown) {
        simpleLogger.error('Could not start recording', cause);
        setError(describeError(cause, 'Could not start the recording service.'));
      }

      setIsBusy(false);
    },
    [requestPermissions]
  );

  const pause = useCallback(async () => {
    setError(null);
    try {
      await GpsTracker.pauseRecording();
    } catch (cause: unknown) {
      simpleLogger.error('Could not pause recording', cause);
      setError(describeError(cause, 'Could not pause the recording.'));
    }
  }, []);

  const resume = useCallback(async () => {
    setError(null);
    try {
      await GpsTracker.resumeRecording();
    } catch (cause: unknown) {
      simpleLogger.error('Could not resume recording', cause);
      setError(describeError(cause, 'Could not resume the recording.'));
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    try {
      const nextSummary = await GpsTracker.stopRecording();
      setSummary(nextSummary);
    } catch (cause: unknown) {
      simpleLogger.error('Could not stop recording', cause);
      setError(describeError(cause, 'Could not stop the recording service.'));
    }
  }, []);

  const save = useCallback(
    async (name: string) => {
      const sessionId = state.sessionId;
      if (sessionId === undefined) {
        return;
      }

      setError(null);
      setIsSaving(true);

      try {
        const meta = await GpsTracker.getSessionMeta(sessionId);
        const { fixes, skipped } = readFixLog(meta.logUri, meta);
        const replay = replaySession(meta, fixes, skipped);

        // Shadow mode (dev only): compare the replay against the native display
        // numbers and log a mismatch instead of failing the save.
        if (__DEV__) {
          const nativeDistance = summary?.liveStats.distanceMeters ?? 0;
          const nativeElapsed = summary?.liveStats.elapsedSec ?? 0;
          if (
            Math.abs(replay.stats.distanceMeters - nativeDistance) > 1 ||
            Math.abs(replay.stats.elapsedTimeSec - nativeElapsed) > 1
          ) {
            simpleLogger.log('recording.shadow_mismatch', {
              sessionId,
              replayDistance: replay.stats.distanceMeters,
              nativeDistance,
              replayElapsed: replay.stats.elapsedTimeSec,
              nativeElapsed
            });
          }
        }

        const activity = buildRecordedActivity({ meta, replay, name });

        // Save order (§3.7): write the stream before the record, so a failure
        // after the stream write leaves an unreferenced file (harmless, and
        // overwritten on retry) instead of a record with a blank map.
        writeStreamFile(activity.id, replay.stream);
        await addActivity(activity);
        await GpsTracker.markSessionSaved(sessionId, activity.id);

        setSummary(null);
        setState(IDLE_STATE);
        setLiveStats(null);
      } catch (cause: unknown) {
        simpleLogger.error('Could not save recording', cause);
        setError(describeError(cause, 'Could not save the recording.'));
      }

      setIsSaving(false);
    },
    [state.sessionId, summary, addActivity]
  );

  const discard = useCallback(async () => {
    const sessionId = state.sessionId;
    if (sessionId === undefined) {
      return;
    }

    setError(null);
    try {
      await GpsTracker.discardSession(sessionId);
      setSummary(null);
      setState(IDLE_STATE);
      setLiveStats(null);
    } catch (cause: unknown) {
      simpleLogger.error('Could not discard recording', cause);
      setError(describeError(cause, 'Could not discard the recording.'));
    }
  }, [state.sessionId]);

  return {
    capabilities,
    state,
    liveStats,
    summary,
    error,
    isBusy,
    isSaving,
    start,
    pause,
    resume,
    stop,
    save,
    discard
  };
}
