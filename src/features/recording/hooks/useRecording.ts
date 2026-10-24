import { simpleLogger } from '@/shared';
import { useActivitiesContext } from '@/features/activities';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listUnfinishedSessions, readFixLog } from '../services/fixLog';
import { heartRateLogUri, readHeartRateLog } from '../services/heartRateLog';
import type {
  RecordingMeta,
  GpsTrackerCapabilities,
  LiveStats,
  Profile,
  RecordingState,
  RecordingSummary
} from '../services/gpsTracker';
import { GpsTracker, gpsTrackerEvents } from '../services/gpsTracker';
import { buildRecordedActivity } from '../services/buildRecordedActivity';
import { PROFILE_CAPTURE_OPTIONS } from '../services/profiles';
import { replaySession } from '../services/replaySession';
import { SplitDetector } from '../services/splits';
import type { SplitEvent } from '../services/splits';
import { useRecordingPermissions } from './useRecordingPermissions';
import { writeStreamFile } from '../services/writeStreamFile';
import { heartRateService } from '@/features/heart-rate';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MODULE_UNAVAILABLE = 'The recording module is not available in this build.';

const IDLE_STATE: RecordingState = { phase: 'idle' };

export interface UseRecordingResult {
  capabilities: GpsTrackerCapabilities | null;
  state: RecordingState;
  liveStats: LiveStats | null;
  summary: RecordingSummary | null;
  heartRateSummary: { average: number; max: number } | null;
  lastSplit: SplitEvent | null;
  error: string | null;
  isBusy: boolean;
  isSaving: boolean;
  unfinished: RecordingMeta[];
  discardUnfinished: (sessionId: string) => Promise<void>;
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
  const [heartRateSummary, setHeartRateSummary] = useState<{ average: number; max: number } | null>(
    null
  );
  const [lastSplit, setLastSplit] = useState<SplitEvent | null>(null);
  // Mirrors `summary` so the state listener (a long-lived closure) can decide
  // whether the summary still needs loading without re-subscribing.
  const summaryRef = useRef<RecordingSummary | null>(null);
  const splitDetectorRef = useRef<SplitDetector | null>(null);
  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [unfinished, setUnfinished] = useState<RecordingMeta[]>([]);

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
                  altitudeM: null,
                  gpsLost: false,
                  hAccM: null
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
    let isMounted = true;
    const loadUnfinished = async () => {
      try {
        const sessions = await listUnfinishedSessions();
        if (isMounted) {
          setUnfinished(sessions.map(item => item.meta));
        }
      } catch (cause: unknown) {
        simpleLogger.error('Could not list unfinished sessions', cause);
      }
    };
    void loadUnfinished();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let stateSubscription: { remove: () => void } | null = null;
    let locationSubscription: { remove: () => void } | null = null;

    try {
      stateSubscription = gpsTrackerEvents.addStateListener(nextState => {
        setState(nextState);
        // A stop triggered from outside the app (e.g. the notification's
        // "Stop" button) still moves the session to stopped-unsaved, but the
        // hook never called GpsTracker.stopRecording(), so the summary is
        // missing. Load it from disk so the LastSessionCard and the dev-only
        // shadow comparison keep working. Mirror stop(): detach HR and compute
        // the HR summary.
        if (
          nextState.phase === 'stopped-unsaved' &&
          nextState.sessionId !== undefined &&
          summaryRef.current === null
        ) {
          heartRateService.detachRecording();
          void (async () => {
            try {
              const meta = await GpsTracker.getSessionMeta(nextState.sessionId!);
              if (summaryRef.current === null) {
                setSummary({
                  meta,
                  liveStats: {
                    elapsedSec: 0,
                    distanceMeters: 0,
                    currentSpeedMps: null,
                    altitudeM: null,
                    gpsLost: false,
                    hAccM: null
                  }
                });
              }
              const { samples } = readHeartRateLog(heartRateLogUri(meta));
              if (samples.length > 0) {
                const avg = Math.round(samples.reduce((s, x) => s + x.bpm, 0) / samples.length);
                const max = Math.max(...samples.map(x => x.bpm));
                setHeartRateSummary({ average: avg, max });
              } else {
                setHeartRateSummary(null);
              }
            } catch (cause: unknown) {
              simpleLogger.error('Could not load the stopped session', cause);
            }
          })();
        }
      });
      locationSubscription = gpsTrackerEvents.addLocationListener(update => {
        setLiveStats({
          elapsedSec: update.elapsedSec,
          distanceMeters: update.distanceMeters,
          currentSpeedMps: update.speedMps,
          altitudeM: update.eleM,
          gpsLost: update.gpsLost,
          hAccM: update.hAccM
        });
        const detector = splitDetectorRef.current;
        if (detector) {
          const event = detector.checkSplit(update.distanceMeters, update.elapsedSec * 1000);
          if (event) {
            setLastSplit(event);
          }
        }
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
        heartRateService.attachRecording(meta);
        const [audioRaw, hapticRaw, intervalRaw] = await Promise.all([
          AsyncStorage.getItem('splitsAudioEnabled'),
          AsyncStorage.getItem('splitsHapticEnabled'),
          AsyncStorage.getItem('splitsIntervalMeters')
        ]);
        const audioEnabled = audioRaw === null ? true : audioRaw === 'true';
        const hapticEnabled = hapticRaw === null ? true : hapticRaw === 'true';
        const intervalMeters = intervalRaw ? Number.parseInt(intervalRaw, 10) : 1000;
        splitDetectorRef.current = new SplitDetector({
          audioEnabled,
          hapticEnabled,
          intervalMeters: Number.isFinite(intervalMeters) ? intervalMeters : 1000
        });
        setLastSplit(null);
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
      heartRateService.detachRecording();
      splitDetectorRef.current = null;
      setSummary(nextSummary);
      const recordingState = await GpsTracker.getRecordingState();
      const sessionId = recordingState.sessionId;
      if (sessionId) {
        const meta = await GpsTracker.getSessionMeta(sessionId);
        const { samples } = readHeartRateLog(heartRateLogUri(meta));
        if (samples.length > 0) {
          const avg = Math.round(samples.reduce((s, x) => s + x.bpm, 0) / samples.length);
          const max = Math.max(...samples.map(x => x.bpm));
          setHeartRateSummary({ average: avg, max });
        } else {
          setHeartRateSummary(null);
        }
      }
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
        const { samples: heartRateSamples } = readHeartRateLog(heartRateLogUri(meta));
        const replay = replaySession(meta, fixes, skipped, heartRateSamples);

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
        heartRateService.detachRecording();
        await GpsTracker.markSessionSaved(sessionId, activity.id);

        setSummary(null);
        setHeartRateSummary(null);
        setState(IDLE_STATE);
        setLiveStats(null);
        setLastSplit(null);
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
      heartRateService.detachRecording();
      await GpsTracker.discardSession(sessionId);
      splitDetectorRef.current = null;
      setSummary(null);
      setHeartRateSummary(null);
      setState(IDLE_STATE);
      setLiveStats(null);
      setLastSplit(null);
    } catch (cause: unknown) {
      simpleLogger.error('Could not discard recording', cause);
      setError(describeError(cause, 'Could not discard the recording.'));
    }
  }, [state.sessionId]);

  const discardUnfinished = useCallback(async (sessionId: string) => {
    try {
      await GpsTracker.discardSession(sessionId);
      setUnfinished(prev => prev.filter(item => item.sessionId !== sessionId));
    } catch (cause: unknown) {
      simpleLogger.error('Could not discard unfinished session', cause);
    }
  }, []);

  return {
    capabilities,
    state,
    liveStats,
    summary,
    heartRateSummary,
    lastSplit,
    error,
    isBusy,
    isSaving,
    unfinished,
    discardUnfinished,
    start,
    pause,
    resume,
    stop,
    save,
    discard
  };
}
