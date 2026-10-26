import { useFlyoverPlayback } from '@/features/maps';
import { ActivityStream } from '@/shared';
import { act, renderHook } from '@testing-library/react-native';

describe('useFlyoverPlayback', () => {
  let frameCallbacks: ((timestamp: number) => void)[] = [];
  let nextFrameId = 1;

  beforeEach(() => {
    frameCallbacks = [];
    nextFrameId = 1;

    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      const id = nextFrameId++;
      frameCallbacks.push(cb);
      return id;
    });

    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((_id?: number | null) => {
      frameCallbacks = [];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const triggerNextFrame = (timestamp: number) => {
    const callbacks = [...frameCallbacks];
    frameCallbacks = [];
    for (const cb of callbacks) {
      cb(timestamp);
    }
  };

  const sampleStream: ActivityStream = {
    coordinates: [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.001, longitude: 5.001 },
      { latitude: 45.002, longitude: 5.002 }
    ],
    altitude: [100, 150, 200],
    time: [0, 10, 20]
  };

  it('initializes with default paused state and starting position', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream));

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.totalDurationSeconds).toBe(20);
    expect(result.current.totalDistanceMeters).toBeGreaterThan(0);
    expect(result.current.speedMultiplier).toBe(1);
    expect(result.current.currentPoint?.latitude).toBe(45.0);
    expect(result.current.traveledCoordinates).toHaveLength(1);
  });

  it('respects autoPlay option on mount', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream, { autoPlay: true }));
    expect(result.current.isPlaying).toBe(true);
  });

  it('handles null stream safely without playing', () => {
    const { result } = renderHook(() => useFlyoverPlayback(null, { autoPlay: true }));

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.totalDurationSeconds).toBe(0);
    expect(result.current.currentPoint).toBeNull();

    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('handles play, pause, and togglePlay transitions', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream));

    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPlaying).toBe(false);

    act(() => {
      result.current.togglePlay();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.togglePlay();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('allows seeking by progress and by elapsed time', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream));

    act(() => {
      result.current.seekTo(0.5);
    });

    expect(result.current.progress).toBe(0.5);
    expect(result.current.elapsedSeconds).toBe(10);
    expect(result.current.currentPoint?.altitude).toBeCloseTo(150, 1);
    expect(result.current.completedDistanceMeters).toBeGreaterThan(0);

    act(() => {
      result.current.seekToTime(15);
    });

    expect(result.current.progress).toBeCloseTo(0.75, 2);
    expect(result.current.elapsedSeconds).toBe(15);
  });

  it('updates speed multiplier correctly', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream, { initialSpeed: 2 }));

    expect(result.current.speedMultiplier).toBe(2);

    act(() => {
      result.current.setSpeed(5);
    });

    expect(result.current.speedMultiplier).toBe(5);
  });

  it('advances progress across animation frames based on target duration', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream));

    act(() => {
      result.current.play();
    });

    // First frame establishes initial timestamp
    act(() => {
      triggerNextFrame(1000);
    });
    expect(result.current.progress).toBe(0);

    // Second frame: 200ms real delta at 1x speed with default 30s target duration
    // advances by 0.2 / 30 = 0.00667 progress
    act(() => {
      triggerNextFrame(1200); // 200ms real delta
    });

    expect(result.current.progress).toBeCloseTo(0.2 / 30, 4);
    expect(result.current.elapsedSeconds).toBeCloseTo((0.2 / 30) * 20, 3);
  });

  it('scales frame advancement according to speedMultiplier and targetDurationSeconds', () => {
    const { result } = renderHook(() =>
      useFlyoverPlayback(sampleStream, { targetDurationSeconds: 20, initialSpeed: 2 })
    );

    act(() => {
      result.current.play();
    });

    act(() => {
      triggerNextFrame(1000);
    });

    act(() => {
      triggerNextFrame(1200); // 200ms delta, speed = 2, targetDuration = 20s -> 0.4 / 20 = 0.02
    });

    expect(result.current.progress).toBeCloseTo(0.02, 4);
  });

  it('stops at end of route when loop is false', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream, { loop: false }));

    act(() => {
      result.current.seekTo(0.999);
      result.current.play();
    });

    act(() => {
      triggerNextFrame(1000);
    });

    // Jump forward enough to exceed target duration (0.25s delta / 30s > 0.001)
    act(() => {
      triggerNextFrame(1250);
    });

    expect(result.current.progress).toBe(1);
    expect(result.current.isPlaying).toBe(false);
  });

  it('loops back to beginning when loop is true', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream, { loop: true }));

    act(() => {
      result.current.seekTo(0.999);
      result.current.play();
    });

    act(() => {
      triggerNextFrame(1000);
    });

    act(() => {
      triggerNextFrame(1250);
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.progress).toBeLessThan(0.1);
  });

  it('restarts playback from the beginning when restart is invoked', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream));

    act(() => {
      result.current.seekTo(0.8);
      result.current.restart();
    });

    expect(result.current.progress).toBe(0);
    expect(result.current.isPlaying).toBe(true);
  });

  it('expands traveledCoordinates as playback progresses', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream));

    expect(result.current.traveledCoordinates).toHaveLength(1);

    act(() => {
      result.current.seekTo(0.5);
    });

    // At 50%, point 0 and point 1 plus interpolated point are included
    expect(result.current.traveledCoordinates.length).toBeGreaterThanOrEqual(2);

    act(() => {
      result.current.seekTo(1.0);
    });

    expect(result.current.traveledCoordinates.length).toBe(3);
  });

  it('safely ignores NaN and non-finite inputs to seekTo, seekToTime, and setSpeed', () => {
    const { result } = renderHook(() => useFlyoverPlayback(sampleStream));

    act(() => {
      result.current.seekTo(0.3);
    });
    expect(result.current.progress).toBe(0.3);

    act(() => {
      result.current.seekTo(NaN);
    });
    expect(result.current.progress).toBe(0.3);

    act(() => {
      result.current.seekToTime(Number.POSITIVE_INFINITY);
    });
    expect(result.current.progress).toBe(0.3);

    act(() => {
      result.current.setSpeed(NaN);
    });
    expect(result.current.speedMultiplier).toBe(1);
  });

  it('resets progress and playback state when stream changes to a different activity', () => {
    const secondStream: ActivityStream = {
      coordinates: [
        { latitude: 46.0, longitude: 6.0 },
        { latitude: 46.002, longitude: 6.002 }
      ],
      altitude: [500, 600],
      time: [0, 40]
    };

    const { result, rerender } = renderHook(
      ({ activeStream }: { activeStream: ActivityStream }) => useFlyoverPlayback(activeStream),
      { initialProps: { activeStream: sampleStream } }
    );

    act(() => {
      result.current.seekTo(0.6);
      result.current.play();
    });
    expect(result.current.progress).toBe(0.6);
    expect(result.current.isPlaying).toBe(true);

    rerender({ activeStream: secondStream });

    expect(result.current.progress).toBe(0);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentPoint?.latitude).toBe(46.0);
    expect(result.current.totalDurationSeconds).toBe(40);
  });
});
