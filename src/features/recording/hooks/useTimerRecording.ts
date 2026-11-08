import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActivitiesContext, buildTimerActivity } from '@/features/activities';
import { heartRateService } from '@/features/heart-rate';
import type { Activity, EncodableStreamSet } from '@/shared';
import { GpsTracker } from '../services/gpsTracker';
import { writeStreamFile } from '../services/writeStreamFile';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY_TYPE = 'timerRecordingLastType';
const STORAGE_KEY_INTERVAL = 'timerRecordingIntervalMinutes';
const DEFAULT_INTERVAL_MINUTES = 3;
const TICK_MS = 1000;

export type TimerPhase = 'idle' | 'running' | 'paused' | 'stopped';

export interface TimerHeartRateSample {
  readonly elapsedSec: number;
  readonly bpm: number;
}

export interface TimerHeartRateSummary {
  readonly average: number;
  readonly max: number;
}

export interface UseTimerRecordingResult {
  phase: TimerPhase;
  activityType: string;
  intervalMinutes: number;
  elapsedSec: number;
  finalDurationSec: number;
  heartRateSummary: TimerHeartRateSummary | null;
  error: string | null;
  isSaving: boolean;
  setActivityType: (type: string) => void;
  setIntervalMinutes: (minutes: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  save: (name: string) => Promise<Activity | null>;
  discard: () => void;
}

/**
 * Pure helper: builds a summary and encodable stream set from timer-collected
 * heart-rate samples. Multiple readings within the same active elapsed second
 * keep the latest value so `time` is strictly non-decreasing and aligned 1:1
 * with `heartrate`.
 */
export function buildTimerHeartRateData(samples: readonly TimerHeartRateSample[]): {
  summary: TimerHeartRateSummary | null;
  stream: EncodableStreamSet | null;
} {
  if (samples.length === 0) {
    return { summary: null, stream: null };
  }

  let sum = 0;
  let max = samples[0].bpm;
  const bySecond = new Map<number, number>();

  for (const sample of samples) {
    const roundedBpm = Math.round(sample.bpm);
    sum += roundedBpm;
    if (roundedBpm > max) {
      max = roundedBpm;
    }
    bySecond.set(Math.max(0, Math.floor(sample.elapsedSec)), roundedBpm);
  }

  const average = Math.round(sum / samples.length);
  const sortedSeconds = Array.from(bySecond.keys()).sort((a, b) => a - b);
  const time: number[] = [];
  const heartrate: (number | null)[] = [];

  for (const sec of sortedSeconds) {
    time.push(sec);
    heartrate.push(bySecond.get(sec) ?? null);
  }

  const stream: EncodableStreamSet = {
    time: {
      data: time,
      series_type: 'time',
      original_size: time.length,
      resolution: 'high'
    },
    heartrate: {
      data: heartrate,
      series_type: 'time',
      original_size: heartrate.length,
      resolution: 'high'
    }
  };

  return {
    summary: { average, max },
    stream
  };
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
  const [heartRateSummary, setHeartRateSummary] = useState<TimerHeartRateSummary | null>(null);
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
  const hrSamplesRef = useRef<TimerHeartRateSample[]>([]);
  const lastSampleWallMsRef = useRef<number>(0);

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

  // Capture live BLE heart-rate readings while the timer is actively running.
  useEffect(() => {
    if (phase !== 'running') {
      return;
    }
    return heartRateService.subscribe(hrState => {
      if (hrState.liveHr === null || hrState.liveHr <= 0) {
        return;
      }
      const now = Date.now();
      if (now - lastSampleWallMsRef.current < 800) {
        return;
      }
      lastSampleWallMsRef.current = now;
      const segmentSec = Math.max(0, Math.floor((now - segmentStartWallMsRef.current) / 1000));
      const activeElapsedSec = accumulatedSecRef.current + segmentSec;
      hrSamplesRef.current.push({
        elapsedSec: activeElapsedSec,
        bpm: hrState.liveHr
      });
    });
  }, [phase]);

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
    hrSamplesRef.current = [];
    lastSampleWallMsRef.current = 0;
    setHeartRateSummary(null);
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
    const { summary } = buildTimerHeartRateData(hrSamplesRef.current);
    setHeartRateSummary(summary);
    clearTick();
    setPhase('stopped');
    void deactivateKeepAwake();
  }, [phase, clearTick]);

  const save = useCallback(
    async (name: string): Promise<Activity | null> => {
      if (startedAtUtcMs === null) return null;
      const duration =
        finalDurationSecRef.current > 0 ? finalDurationSecRef.current : elapsedSecRef.current;
      if (duration < 1) {
        setError('Duration must be at least 1 second.');
        return null;
      }
      setError(null);
      setIsSaving(true);
      let savedActivity: Activity | null = null;
      try {
        const { summary: hrSummary, stream: hrStream } = buildTimerHeartRateData(
          hrSamplesRef.current
        );
        const activity = buildTimerActivity({
          type: activityTypeRef.current,
          startUtcMs: startedAtUtcMs,
          durationSec: duration,
          name,
          averageHeartRate: hrSummary?.average,
          maxHeartRate: hrSummary?.max
        });
        if (hrStream) {
          writeStreamFile(activity.id, hrStream);
        }
        await addActivity(activity);
        savedActivity = activity;
        // Reset state.
        setPhase('idle');
        setElapsedSec(0);
        setFinalDurationSec(0);
        setStartedAtUtcMs(null);
        setHeartRateSummary(null);
        accumulatedSecRef.current = 0;
        lastAnnouncedMilestoneRef.current = 0;
        elapsedSecRef.current = 0;
        finalDurationSecRef.current = 0;
        hrSamplesRef.current = [];
        lastSampleWallMsRef.current = 0;
        void deactivateKeepAwake();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Could not save the recording.');
      }
      setIsSaving(false);
      return savedActivity;
    },
    [startedAtUtcMs, addActivity]
  );

  const discard = useCallback(() => {
    clearTick();
    setPhase('idle');
    setElapsedSec(0);
    setFinalDurationSec(0);
    setStartedAtUtcMs(null);
    setHeartRateSummary(null);
    accumulatedSecRef.current = 0;
    lastAnnouncedMilestoneRef.current = 0;
    elapsedSecRef.current = 0;
    finalDurationSecRef.current = 0;
    hrSamplesRef.current = [];
    lastSampleWallMsRef.current = 0;
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
    heartRateSummary,
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
