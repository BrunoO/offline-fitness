import { simpleLogger } from '@/shared';
import { useCallback, useEffect, useState } from 'react';
import { GpsTracker, gpsTrackerEvents } from '../services/gpsTracker';
import type {
  GpsTrackerCapabilities,
  LiveStats,
  Profile,
  RecordingState,
  RecordingSummary
} from '../services/gpsTracker';
import { PROFILE_CAPTURE_OPTIONS } from '../services/profiles';
import { useRecordingPermissions } from './useRecordingPermissions';

const MODULE_UNAVAILABLE = 'The recording module is not available in this build.';

const IDLE_STATE: RecordingState = { phase: 'idle' };

export interface UseRecordingResult {
  capabilities: GpsTrackerCapabilities | null;
  state: RecordingState;
  liveStats: LiveStats | null;
  summary: RecordingSummary | null;
  error: string | null;
  isBusy: boolean;
  start: (profile: Profile) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
}

const describeError = (cause: unknown, fallback: string): string => {
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  return fallback;
};

/**
 * Drives the native recorder.
 *
 * The service owns the session, so this hook is a thin client: it starts,
 * pauses, resumes and stops, and it treats the state event as the truth about
 * the phase (a reload, a second screen or a stale render cannot talk it out of
 * that). Live numbers are display-only; the canonical ones come from the
 * TypeScript replay over the fix log.
 */
export function useRecording(): UseRecordingResult {
  const { requestPermissions } = useRecordingPermissions();
  const [capabilities, setCapabilities] = useState<GpsTrackerCapabilities | null>(null);
  const [state, setState] = useState<RecordingState>(IDLE_STATE);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [summary, setSummary] = useState<RecordingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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

  return { capabilities, state, liveStats, summary, error, isBusy, start, pause, resume, stop };
}
