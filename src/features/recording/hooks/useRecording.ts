import { simpleLogger, type Activity } from '@/shared';
import { useActivitiesContext } from '@/features/activities';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listUnfinishedSessions, readFixLog, sweepExpiredSessions } from '../services/fixLog';
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
import { PROFILE_CAPTURE_OPTIONS, saveLastRecordingProfile } from '../services/profiles';
import { replaySession } from '../services/replaySession';
import { LiveSlopeCalculator } from '../services/slope';
import { SplitDetector } from '../services/splits';
import type { SplitEvent } from '../services/splits';
import { useRecordingPermissions } from './useRecordingPermissions';
import { writeStreamFile } from '../services/writeStreamFile';
import { heartRateService } from '@/features/heart-rate';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MODULE_UNAVAILABLE = 'The recording module is not available in this build.';

const IDLE_STATE: RecordingState = { phase: 'idle' };
const TIMER_TICK_MS = 1000;
const FIX_FRESHNESS_MS = 950;

export interface UseRecordingResult {
  capabilities: GpsTrackerCapabilities | null;
  state: RecordingState;
  activeProfile: Profile | null;
  liveStats: LiveStats | null;
  summary: RecordingSummary | null;
  splits?: SplitEvent[];
  heartRateSummary: { average: number; max: number } | null;
  lastSplit: SplitEvent | null;
  error: string | null;
  isBusy: boolean;
  isSaving: boolean;
  unfinished: RecordingMeta[];
  saveUnfinished: (sessionId: string) => Promise<Activity | null>;
  discardUnfinished: (sessionId: string) => Promise<void>;
  start: (profile: Profile) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  save: (name: string, distanceOverrideMeters?: number) => Promise<Activity | null>;
  discard: () => Promise<void>;
}

const describeError = (cause: unknown, fallback: string): string => {
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  return fallback;
};

interface StoppedSessionData {
  readonly meta: RecordingMeta;
  readonly summary: RecordingSummary;
  readonly splits: SplitEvent[];
  readonly heartRateSummary: { average: number; max: number } | null;
}

const readSplitIntervalMeters = async (): Promise<number> => {
  try {
    const raw = await AsyncStorage.getItem('splitsIntervalMeters');
    const parsed = raw ? Number.parseInt(raw, 10) : 1000;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  } catch {
    return 1000;
  }
};

const createLiveSplitDetector = async (profile: Profile): Promise<SplitDetector> => {
  const [audioRaw, hapticRaw, intervalMeters] = await Promise.all([
    AsyncStorage.getItem('splitsAudioEnabled'),
    AsyncStorage.getItem('splitsHapticEnabled'),
    readSplitIntervalMeters()
  ]);
  const audioEnabled = audioRaw === null ? true : audioRaw === 'true';
  const hapticEnabled = hapticRaw === null ? true : hapticRaw === 'true';
  return new SplitDetector({
    profile,
    audioEnabled,
    hapticEnabled,
    intervalMeters,
    getHeartRateBpm: () => heartRateService.getState().liveHr
  });
};

const loadStoppedSessionData = async (
  sessionId: string,
  existingSummary: RecordingSummary | null
): Promise<StoppedSessionData> => {
  const [meta, splitIntervalMeters] = await Promise.all([
    GpsTracker.getSessionMeta(sessionId),
    readSplitIntervalMeters()
  ]);
  const { fixes, skipped } = readFixLog(meta.logUri, meta);
  const { samples } = readHeartRateLog(heartRateLogUri(meta));
  const replay = replaySession(meta, fixes, skipped, samples, splitIntervalMeters);

  const baseLiveStats: LiveStats = existingSummary?.liveStats ?? {
    elapsedSec: replay.stats.elapsedTimeSec,
    distanceMeters: replay.stats.distanceMeters,
    currentSpeedMps: replay.stats.averageSpeedMetersPerSec,
    altitudeM: replay.stream.altitude?.data.at(-1) ?? null,
    slopePercent: null,
    elevationGainM: replay.stats.elevationGainMeters,
    gpsLost: false,
    hAccM: null
  };

  const summary: RecordingSummary = {
    meta: existingSummary?.meta ?? meta,
    liveStats: {
      ...baseLiveStats,
      movingTimeSec: replay.stats.movingTimeSec,
      elevationGainM: replay.stats.elevationGainMeters,
      currentSpeedMps:
        replay.stats.averageSpeedMetersPerSec > 0
          ? replay.stats.averageSpeedMetersPerSec
          : baseLiveStats.currentSpeedMps
    }
  };

  const heartRateSummary =
    replay.stats.averageHeartRate !== undefined && replay.stats.maxHeartRate !== undefined
      ? {
          average: Math.round(replay.stats.averageHeartRate),
          max: Math.round(replay.stats.maxHeartRate)
        }
      : null;

  return { meta, summary, splits: replay.splits, heartRateSummary };
};

const persistSessionAsActivity = async (
  sessionId: string,
  name: string,
  summary: RecordingSummary | null,
  addActivity: (activity: Activity) => Promise<void>,
  distanceOverrideMeters?: number
): Promise<Activity> => {
  const meta = await GpsTracker.getSessionMeta(sessionId);
  const { fixes, skipped } = readFixLog(meta.logUri, meta);
  const { samples: heartRateSamples } = readHeartRateLog(heartRateLogUri(meta));
  const replay = replaySession(meta, fixes, skipped, heartRateSamples);

  // Shadow mode (dev only): compare the replay against the native display
  // numbers and log a mismatch instead of failing the save.
  if (__DEV__ && summary !== null) {
    const nativeDistance = summary.liveStats.distanceMeters;
    const nativeElapsed = summary.liveStats.elapsedSec;
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

  const activity = buildRecordedActivity({ meta, replay, name, distanceOverrideMeters });

  // Save order (§3.7): write the stream before the record, so a failure
  // after the stream write leaves an unreferenced file (harmless, and
  // overwritten on retry) instead of a record with a blank map.
  // `writeStreamFile` is synchronous (expo-file-system JSI File.write /
  // Directory.create), so no `await` is needed: it either finishes on disk
  // or throws before `addActivity` is called.
  writeStreamFile(activity.id, replay.stream);
  await addActivity(activity);
  heartRateService.detachRecording();
  await GpsTracker.markSessionSaved(sessionId, activity.id);
  void sweepExpiredSessions();
  return activity;
};

const tickLiveStats = (prev: LiveStats | null, startedAtUtcMs: number): LiveStats => {
  if (prev !== null) {
    return {
      ...prev,
      elapsedSec: prev.elapsedSec + 1
    };
  }
  return {
    elapsedSec: Math.max(0, Math.floor((Date.now() - startedAtUtcMs) / 1000)),
    distanceMeters: 0,
    currentSpeedMps: null,
    altitudeM: null,
    slopePercent: null,
    elevationGainM: 0,
    gpsLost: false,
    hAccM: null
  };
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
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [summary, setSummary] = useState<RecordingSummary | null>(null);
  const [splits, setSplits] = useState<SplitEvent[]>([]);
  const [heartRateSummary, setHeartRateSummary] = useState<{ average: number; max: number } | null>(
    null
  );
  const [lastSplit, setLastSplit] = useState<SplitEvent | null>(null);
  // Mirrors `summary` so the state listener (a long-lived closure) can decide
  // whether the summary still needs loading without re-subscribing.
  const summaryRef = useRef<RecordingSummary | null>(null);
  const splitDetectorRef = useRef<SplitDetector | null>(null);
  const slopeCalculatorRef = useRef<LiveSlopeCalculator | null>(null);
  const lastFixWallMsRef = useRef<number>(0);
  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [unfinished, setUnfinished] = useState<RecordingMeta[]>([]);

  useEffect(() => {
    let isMounted = true;

    const hydrateActiveSession = async (
      nextState: RecordingState,
      nextCapabilities: GpsTrackerCapabilities
    ) => {
      if (!nextState.sessionId) {
        return;
      }
      try {
        if (nextState.phase === 'stopped-unsaved') {
          const loaded = await loadStoppedSessionData(nextState.sessionId, null);
          if (isMounted) {
            setActiveProfile(loaded.meta.profile);
            setSummary(loaded.summary);
            setSplits(loaded.splits);
            setHeartRateSummary(loaded.heartRateSummary);
          }
          return;
        }
        if (nextState.phase === 'recording' || nextState.phase === 'paused') {
          const meta = await GpsTracker.getSessionMeta(nextState.sessionId);
          const detector = await createLiveSplitDetector(meta.profile);
          if (isMounted) {
            setActiveProfile(meta.profile);
            splitDetectorRef.current ??= detector;
            slopeCalculatorRef.current ??= new LiveSlopeCalculator(
              meta.profile,
              Boolean(nextCapabilities.hasBarometer && meta.capture.useBarometer)
            );
            if (nextState.phase === 'recording') {
              heartRateService.attachRecording(meta);
            }
          }
        }
      } catch (cause: unknown) {
        simpleLogger.error('Could not load the active session', cause);
      }
    };

    const loadState = async () => {
      try {
        const [nextCapabilities, nextState] = await Promise.all([
          GpsTracker.getCapabilities(),
          GpsTracker.getRecordingState()
        ]);
        if (isMounted) {
          setCapabilities(nextCapabilities);
          setState(nextState);
          await hydrateActiveSession(nextState, nextCapabilities);
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

  // Keep the hero elapsed timer ticking every second while recording, even
  // before the first GPS fix arrives or while waiting between GPS fixes.
  useEffect(() => {
    if (state.phase !== 'recording' || state.startedAtUtcMs === undefined) {
      return;
    }
    const startedAtUtcMs = state.startedAtUtcMs;
    const intervalId = setInterval(() => {
      if (Date.now() - lastFixWallMsRef.current >= FIX_FRESHNESS_MS) {
        setLiveStats(prev => tickLiveStats(prev, startedAtUtcMs));
      }
    }, TIMER_TICK_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, [state.phase, state.startedAtUtcMs]);

  useEffect(() => {
    let stateSubscription: { remove: () => void } | null = null;
    let locationSubscription: { remove: () => void } | null = null;

    const handleExternalStateChange = async (nextState: RecordingState) => {
      if (nextState.phase === 'paused') {
        heartRateService.detachRecording();
        slopeCalculatorRef.current?.onPause();
        return;
      }
      if (nextState.phase === 'recording' && nextState.sessionId !== undefined) {
        try {
          const meta = await GpsTracker.getSessionMeta(nextState.sessionId);
          setActiveProfile(meta.profile);
          heartRateService.attachRecording(meta);
        } catch (cause: unknown) {
          simpleLogger.error('Could not re-attach session on resume', cause);
        }
        return;
      }
      // A stop triggered from outside the app (e.g. the notification's
      // "Stop" button) still moves the session to stopped-unsaved, but the
      // hook never called GpsTracker.stopRecording(), so the summary is
      // missing. Load it from disk via replaySession so the LastSessionCard
      // shows real distance/duration and the dev-only shadow comparison works.
      if (
        nextState.phase === 'stopped-unsaved' &&
        nextState.sessionId !== undefined &&
        summaryRef.current === null
      ) {
        heartRateService.detachRecording();
        try {
          const loaded = await loadStoppedSessionData(nextState.sessionId, summaryRef.current);
          setActiveProfile(loaded.meta.profile);
          if (summaryRef.current === null) {
            setSummary(loaded.summary);
          }
          setSplits(loaded.splits);
          setHeartRateSummary(loaded.heartRateSummary);
        } catch (cause: unknown) {
          simpleLogger.error('Could not load the stopped session', cause);
        }
      }
    };

    try {
      stateSubscription = gpsTrackerEvents.addStateListener(nextState => {
        setState(nextState);
        void handleExternalStateChange(nextState);
      });
      locationSubscription = gpsTrackerEvents.addLocationListener(update => {
        lastFixWallMsRef.current = Date.now();
        slopeCalculatorRef.current ??= new LiveSlopeCalculator();
        const slopePercent = slopeCalculatorRef.current.update(
          update.eleM,
          update.distanceMeters,
          update.t
        );
        const elevationGainM = slopeCalculatorRef.current.getElevationGain();
        setLiveStats({
          elapsedSec: update.elapsedSec,
          distanceMeters: update.distanceMeters,
          currentSpeedMps: update.speedMps,
          altitudeM: update.eleM,
          slopePercent,
          elevationGainM,
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
        setActiveProfile(profile);
        void saveLastRecordingProfile(profile);
        heartRateService.attachRecording(meta);
        splitDetectorRef.current = await createLiveSplitDetector(profile);
        slopeCalculatorRef.current = new LiveSlopeCalculator(
          profile,
          Boolean(capabilities?.hasBarometer && PROFILE_CAPTURE_OPTIONS[profile].useBarometer)
        );
        lastFixWallMsRef.current = 0;
        setLastSplit(null);
        setSplits([]);
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
    [requestPermissions, capabilities]
  );

  const pause = useCallback(async () => {
    setError(null);
    try {
      await GpsTracker.pauseRecording();
      heartRateService.detachRecording();
      slopeCalculatorRef.current?.onPause();
    } catch (cause: unknown) {
      simpleLogger.error('Could not pause recording', cause);
      setError(describeError(cause, 'Could not pause the recording.'));
    }
  }, []);

  const resume = useCallback(async () => {
    setError(null);
    try {
      await GpsTracker.resumeRecording();
      if (state.sessionId) {
        const meta = await GpsTracker.getSessionMeta(state.sessionId);
        heartRateService.attachRecording(meta);
      }
    } catch (cause: unknown) {
      simpleLogger.error('Could not resume recording', cause);
      setError(describeError(cause, 'Could not resume the recording.'));
    }
  }, [state.sessionId]);

  const stop = useCallback(async () => {
    setError(null);
    try {
      const nextSummary = await GpsTracker.stopRecording();
      heartRateService.detachRecording();
      splitDetectorRef.current = null;
      slopeCalculatorRef.current = null;
      setSummary(nextSummary);
      const recordingState = await GpsTracker.getRecordingState();
      const sessionId = recordingState.sessionId;
      if (sessionId) {
        const loaded = await loadStoppedSessionData(sessionId, nextSummary);
        setSummary(loaded.summary);
        setSplits(loaded.splits);
        setHeartRateSummary(loaded.heartRateSummary);
      }
    } catch (cause: unknown) {
      simpleLogger.error('Could not stop recording', cause);
      setError(describeError(cause, 'Could not stop the recording service.'));
    }
  }, []);

  const save = useCallback(
    async (name: string, distanceOverrideMeters?: number): Promise<Activity | null> => {
      const sessionId = state.sessionId;
      if (sessionId === undefined) {
        return null;
      }

      setError(null);
      setIsSaving(true);
      let savedActivity: Activity | null = null;

      try {
        savedActivity = await persistSessionAsActivity(
          sessionId,
          name,
          summary,
          addActivity,
          distanceOverrideMeters
        );
        setSummary(null);
        setSplits([]);
        setHeartRateSummary(null);
        setActiveProfile(null);
        setState(IDLE_STATE);
        setLiveStats(null);
        setLastSplit(null);
      } catch (cause: unknown) {
        simpleLogger.error('Could not save recording', cause);
        setError(describeError(cause, 'Could not save the recording.'));
      }

      setIsSaving(false);
      return savedActivity;
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
      setSplits([]);
      setHeartRateSummary(null);
      setActiveProfile(null);
      setState(IDLE_STATE);
      setLiveStats(null);
      setLastSplit(null);
    } catch (cause: unknown) {
      simpleLogger.error('Could not discard recording', cause);
      setError(describeError(cause, 'Could not discard the recording.'));
    }
  }, [state.sessionId]);

  const saveUnfinished = useCallback(
    async (sessionId: string): Promise<Activity | null> => {
      setError(null);
      setIsSaving(true);
      let savedActivity: Activity | null = null;
      try {
        savedActivity = await persistSessionAsActivity(sessionId, '', null, addActivity);
        setUnfinished(prev => prev.filter(item => item.sessionId !== sessionId));
      } catch (cause: unknown) {
        simpleLogger.error('Could not save unfinished session', cause);
        setError(describeError(cause, 'Could not recover the unfinished recording.'));
      }
      setIsSaving(false);
      return savedActivity;
    },
    [addActivity]
  );

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
    activeProfile,
    liveStats,
    summary,
    splits,
    heartRateSummary,
    lastSplit,
    error,
    isBusy,
    isSaving,
    unfinished,
    saveUnfinished,
    discardUnfinished,
    start,
    pause,
    resume,
    stop,
    save,
    discard
  };
}
