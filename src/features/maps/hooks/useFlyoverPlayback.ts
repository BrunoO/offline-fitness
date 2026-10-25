import { ActivityStream, LatLng } from '@/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFlyoverTrack, getFlyoverPointAtTime } from '../services/flyoverInterpolator';
import {
  FlyoverPlaybackOptions,
  FlyoverPlaybackState,
  FlyoverPoint,
  FlyoverTrack
} from '../types/flyover.types';

const DEFAULT_SPEED_MULTIPLIER = 1;
const MIN_SPEED_MULTIPLIER = 0.1;
const MAX_DELTA_REAL_SECONDS = 0.25;
const PROGRESS_START = 0;
const PROGRESS_END = 1;

/**
 * Derives the list of traveled coordinates up to the current interpolated point for breadcrumbs.
 */
function deriveTraveledCoordinates(
  track: FlyoverTrack,
  currentPoint: FlyoverPoint | null
): LatLng[] {
  if (!currentPoint || track.points.length === 0) {
    return [];
  }

  const result: LatLng[] = [];
  const targetDistance = currentPoint.distance;

  for (const pt of track.points) {
    if (pt.distance <= targetDistance) {
      result.push({ latitude: pt.latitude, longitude: pt.longitude });
    } else {
      break;
    }
  }

  const lastTraveled = result.at(-1);
  if (
    lastTraveled?.latitude !== currentPoint.latitude ||
    lastTraveled?.longitude !== currentPoint.longitude
  ) {
    result.push({
      latitude: currentPoint.latitude,
      longitude: currentPoint.longitude
    });
  }

  return result;
}

/**
 * Custom hook managing the playback state, controls, and frame advancement of a route flyover.
 * @param stream Source activity stream containing coordinates, altitude, and time.
 * @param options Playback options such as speed multiplier, autoPlay, and smoothing.
 * @returns FlyoverPlaybackState containing current position, statistics, and playback controls.
 */
export function useFlyoverPlayback(
  stream: ActivityStream | undefined | null,
  options?: FlyoverPlaybackOptions
): FlyoverPlaybackState {
  const stableOptions = useMemo(
    () => options,
    [
      options?.initialSpeed,
      options?.autoPlay,
      options?.loop,
      options?.smoothingWindow,
      options?.defaultPitch,
      options?.minMovementMeters
    ]
  );

  const initialSpeed = stableOptions?.initialSpeed ?? DEFAULT_SPEED_MULTIPLIER;
  const autoPlay = stableOptions?.autoPlay ?? false;
  const loop = stableOptions?.loop ?? false;

  const track = useMemo(() => buildFlyoverTrack(stream, stableOptions), [stream, stableOptions]);

  const [isPlaying, setIsPlaying] = useState(autoPlay && track.totalDuration > 0);
  const [progress, setProgress] = useState(PROGRESS_START);
  const [speedMultiplier, setSpeedMultiplier] = useState(
    Math.max(MIN_SPEED_MULTIPLIER, initialSpeed)
  );

  const animFrameIdRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const speedRef = useRef(speedMultiplier);
  const progressRef = useRef(progress);

  useEffect(() => {
    speedRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const totalDurationSeconds = track.totalDuration;
  const elapsedSeconds = progress * totalDurationSeconds;

  const currentPoint = useMemo(() => {
    if (track.points.length === 0) {
      return null;
    }
    const startTime = track.points[0].time;
    return getFlyoverPointAtTime(track, startTime + elapsedSeconds);
  }, [track, elapsedSeconds]);

  const traveledCoordinates = useMemo(
    () => deriveTraveledCoordinates(track, currentPoint),
    [track, currentPoint]
  );
  const totalDistanceMeters = track.totalDistance;
  const completedDistanceMeters = currentPoint ? currentPoint.distance : 0;

  const play = useCallback(() => {
    if (track.totalDuration <= 0) return;
    setProgress(prev => (prev >= PROGRESS_END ? PROGRESS_START : prev));
    setIsPlaying(true);
  }, [track.totalDuration]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (track.totalDuration <= 0) return;
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setProgress(prev => (prev >= PROGRESS_END ? PROGRESS_START : prev));
      setIsPlaying(true);
    }
  }, [isPlaying, track.totalDuration]);

  const seekTo = useCallback((targetProgress: number) => {
    if (!Number.isFinite(targetProgress)) return;
    const clamped = Math.max(PROGRESS_START, Math.min(PROGRESS_END, targetProgress));
    setProgress(clamped);
  }, []);

  const seekToTime = useCallback(
    (timeSeconds: number) => {
      if (!Number.isFinite(timeSeconds)) return;
      if (totalDurationSeconds <= 0) {
        seekTo(PROGRESS_START);
        return;
      }
      seekTo(timeSeconds / totalDurationSeconds);
    },
    [totalDurationSeconds, seekTo]
  );

  const setSpeed = useCallback((multiplier: number) => {
    if (!Number.isFinite(multiplier)) return;
    const sanitized = Math.max(MIN_SPEED_MULTIPLIER, multiplier);
    setSpeedMultiplier(sanitized);
  }, []);

  const restart = useCallback(() => {
    lastTimestampRef.current = null;
    setProgress(PROGRESS_START);
    if (track.totalDuration > 0) {
      setIsPlaying(true);
    }
  }, [track.totalDuration]);

  // Frame ticker
  useEffect(() => {
    if (!isPlaying || totalDurationSeconds <= 0) {
      lastTimestampRef.current = null;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      return;
    }

    const onFrame = (timestamp: number) => {
      if (lastTimestampRef.current !== null) {
        const deltaRealSeconds = Math.min(
          MAX_DELTA_REAL_SECONDS,
          (timestamp - lastTimestampRef.current) / 1000
        );
        const deltaSimSeconds = deltaRealSeconds * speedRef.current;

        const currentElapsed = progressRef.current * totalDurationSeconds;
        const nextElapsed = currentElapsed + deltaSimSeconds;

        if (nextElapsed >= totalDurationSeconds) {
          if (loop) {
            const wrappedElapsed = nextElapsed % totalDurationSeconds;
            setProgress(wrappedElapsed / totalDurationSeconds);
          } else {
            setProgress(PROGRESS_END);
            setIsPlaying(false);
          }
        } else {
          setProgress(nextElapsed / totalDurationSeconds);
        }
      }

      lastTimestampRef.current = timestamp;
      animFrameIdRef.current = requestAnimationFrame(onFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(onFrame);

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      lastTimestampRef.current = null;
    };
  }, [isPlaying, totalDurationSeconds, loop]);

  return {
    track,
    isPlaying,
    progress,
    speedMultiplier,
    currentPoint,
    elapsedSeconds,
    totalDurationSeconds,
    completedDistanceMeters,
    totalDistanceMeters,
    traveledCoordinates,
    play,
    pause,
    togglePlay,
    seekTo,
    seekToTime,
    setSpeed,
    restart
  };
}
