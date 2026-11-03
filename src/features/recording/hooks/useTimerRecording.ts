import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActivitiesContext, buildTimerActivity } from '@/features/activities';
import { GpsTracker } from '../services/gpsTracker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY_TYPE = 'timerRecordingLastType';
const STORAGE_KEY_INTERVAL = 'timerRecordingIntervalMinutes';
const DEFAULT_INTERVAL_MINUTES = 3;
const TICK_MS = 1000;

export type TimerPhase = 'idle' | 'running' | 'paused' | 'stopped';

export interface UseTimerRecordingResult {
  phase: TimerPhase;
  activityType: string;
  intervalMinutes: number;
  elapsedSec: number;
  finalDurationSec: number;
  error: string | null;
  isSaving: boolean;
  setActivityType: (type: string) => void;
  setIntervalMinutes: (minutes: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  save: (name: string) => Promise<void>;
  discard: () => void;
}

/**
 * Pure helper: returns the number of whole interval milestones crossed
 * between `previousMilestone` and `elapsedSec`. Used to decide when to
 * announce. Exported for unit testing.
 */
export function countNewMilestones(
  elapsedSec: number,
  intervalMinutes: number,
  previousMilestone: number
): number {
  if (intervalMinutes <= 0) return 0;
  const intervalSec = intervalMinutes * 60;
  const current = Math.floor(elapsedSec / intervalSec);
  return Math.max(0, current - previousMilestone);
}

const speakSafely = async (text: string): Promise<void> => {
  try {
    await GpsTracker.speak(text);
  } catch {
    // Native module may be unavailable; timer still works silently.
  }
};

export function useTimerRecording(): UseTimerRecordingResult {
  const { addActivity } = useActivitiesContext();

  const [phase, setPhase] = useState<TimerPhase>('idle');
  const [activityTypeState, setActivityTypeState] = useState<string>('Yoga');
  const [intervalMinutesState, setIntervalMinutesState] =
    useState<number>(DEFAULT_INTERVAL_MINUTES);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [finalDurationSec, setFinalDurationSec] = useState<number>(0);
  const [startedAtUtcMs, setStartedAtUtcMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const accumulatedSecRef = useRef<number>(0);
  const segmentStartWallMsRef = useRef<number>(0);
  const lastAnnouncedMilestoneRef = useRef<number>(0);
  const intervalHandleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalMinutesRef = useRef<number>(DEFAULT_INTERVAL_MINUTES);
  const activityTypeRef = useRef<string>('Yoga');
  const elapsedSecRef = useRef<number>(0);
  const finalDurationSecRef = useRef<number>(0);

  useEffect(() => {
    intervalMinutesRef.current = intervalMinutesState;
  }, [intervalMinutesState]);

  useEffect(() => {
    activityTypeRef.current = activityTypeState;
  }, [activityTypeState]);

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    finalDurationSecRef.current = finalDurationSec;
  }, [finalDurationSec]);

  // Hydrate persisted preferences on mount.
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const [typeRaw, intervalRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TYPE),
          AsyncStorage.getItem(STORAGE_KEY_INTERVAL)
        ]);
        if (!isMounted) return;
        if (typeRaw) {
          setActivityTypeState(typeRaw);
          activityTypeRef.current = typeRaw;
        }
        if (intervalRaw) {
          const parsed = Number.parseInt(intervalRaw, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            setIntervalMinutesState(parsed);
            intervalMinutesRef.current = parsed;
          }
        }
      } catch {
        // Ignore storage errors; defaults remain.
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const clearTick = useCallback(() => {
    if (intervalHandleRef.current !== null) {
      clearInterval(intervalHandleRef.current);
      intervalHandleRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const now = Date.now();
    const segmentSec = Math.floor((now - segmentStartWallMsRef.current) / 1000);
    const total = accumulatedSecRef.current + segmentSec;
    setElapsedSec(total);

    const interval = intervalMinutesRef.current;
    if (interval > 0) {
      const milestones = countNewMilestones(total, interval, lastAnnouncedMilestoneRef.current);
      if (milestones > 0) {
        const newMilestone = lastAnnouncedMilestoneRef.current + milestones;
        lastAnnouncedMilestoneRef.current = newMilestone;
        const minutes = newMilestone * interval;
        void speakSafely(`${minutes} minutes`);
      }
    }
  }, []);

  const start = useCallback(() => {
    setError(null);
    const now = Date.now();
    accumulatedSecRef.current = 0;
    segmentStartWallMsRef.current = now;
    lastAnnouncedMilestoneRef.current = 0;
    elapsedSecRef.current = 0;
    finalDurationSecRef.current = 0;
    setElapsedSec(0);
    setFinalDurationSec(0);
    setStartedAtUtcMs(now);
    setPhase('running');
    void activateKeepAwakeAsync();
    clearTick();
    intervalHandleRef.current = setInterval(tick, TICK_MS);
  }, [clearTick, tick]);

  const pause = useCallback(() => {
    if (phase !== 'running') return;
    const now = Date.now();
    const segmentSec = Math.floor((now - segmentStartWallMsRef.current) / 1000);
    accumulatedSecRef.current += segmentSec;
    setElapsedSec(accumulatedSecRef.current);
    clearTick();
    setPhase('paused');
  }, [phase, clearTick]);

  const resume = useCallback(() => {
    if (phase !== 'paused') return;
    segmentStartWallMsRef.current = Date.now();
    setPhase('running');
    intervalHandleRef.current = setInterval(tick, TICK_MS);
  }, [phase, tick]);

  const stop = useCallback(() => {
    if (phase === 'running') {
      const now = Date.now();
      const segmentSec = Math.floor((now - segmentStartWallMsRef.current) / 1000);
      accumulatedSecRef.current += segmentSec;
    }
    const total = accumulatedSecRef.current;
    setElapsedSec(total);
    setFinalDurationSec(total);
    clearTick();
    setPhase('stopped');
    void deactivateKeepAwake();
  }, [phase, clearTick]);

  const save = useCallback(
    async (name: string) => {
      if (startedAtUtcMs === null) return;
      const duration =
        finalDurationSecRef.current > 0 ? finalDurationSecRef.current : elapsedSecRef.current;
      if (duration < 1) {
        setError('Duration must be at least 1 second.');
        return;
      }
      setError(null);
      setIsSaving(true);
      try {
        const activity = buildTimerActivity({
          type: activityTypeRef.current,
          startUtcMs: startedAtUtcMs,
          durationSec: duration,
          name
        });
        await addActivity(activity);
        // Reset state.
        setPhase('idle');
        setElapsedSec(0);
        setFinalDurationSec(0);
        setStartedAtUtcMs(null);
        accumulatedSecRef.current = 0;
        lastAnnouncedMilestoneRef.current = 0;
        elapsedSecRef.current = 0;
        finalDurationSecRef.current = 0;
        void deactivateKeepAwake();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Could not save the recording.');
      }
      setIsSaving(false);
    },
    [startedAtUtcMs, addActivity]
  );

  const discard = useCallback(() => {
    clearTick();
    setPhase('idle');
    setElapsedSec(0);
    setFinalDurationSec(0);
    setStartedAtUtcMs(null);
    accumulatedSecRef.current = 0;
    lastAnnouncedMilestoneRef.current = 0;
    elapsedSecRef.current = 0;
    finalDurationSecRef.current = 0;
    void deactivateKeepAwake();
  }, [clearTick]);

  const setActivityType = useCallback((type: string) => {
    setActivityTypeState(type);
    activityTypeRef.current = type;
    void AsyncStorage.setItem(STORAGE_KEY_TYPE, type).catch(() => {
      // Ignore persistence errors.
    });
  }, []);

  const setIntervalMinutes = useCallback((minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    setIntervalMinutesState(minutes);
    intervalMinutesRef.current = minutes;
    void AsyncStorage.setItem(STORAGE_KEY_INTERVAL, String(minutes)).catch(() => {
      // Ignore persistence errors.
    });
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTick();
      void deactivateKeepAwake();
    };
  }, [clearTick]);

  return {
    phase,
    activityType: activityTypeState,
    intervalMinutes: intervalMinutesState,
    elapsedSec,
    finalDurationSec,
    error,
    isSaving,
    setActivityType,
    setIntervalMinutes,
    start,
    pause,
    resume,
    stop,
    save,
    discard
  };
}
