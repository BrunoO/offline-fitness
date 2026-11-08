import React from 'react';
import { render, fireEvent, act, waitFor, renderHook } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { TimerRecordingScreen } from '@/features/recording/screens/TimerRecordingScreen';
import {
  buildTimerHeartRateData,
  countNewMilestones,
  useTimerRecording
} from '@/features/recording/hooks/useTimerRecording';
import type { Activity } from '@/shared';

const mockAsyncStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStore.set(key, value);
  })
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { LANDSCAPE: 'LANDSCAPE' },
  lockAsync: jest.fn().mockResolvedValue(undefined),
  unlockAsync: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

const mockAddActivity = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/activities', () => {
  const actual = jest.requireActual('@/features/activities/services/manualActivity');
  return {
    useActivitiesContext: () => ({ addActivity: mockAddActivity }),
    buildTimerActivity: actual.buildTimerActivity
  };
});

const mockWriteStreamFile = jest.fn();
jest.mock('@/features/recording/services/writeStreamFile', () => ({
  writeStreamFile: (...args: unknown[]) => mockWriteStreamFile(...args)
}));

jest.mock('@/features/recording/services/gpsTracker', () => ({
  GpsTracker: {
    speak: jest.fn().mockResolvedValue(undefined)
  }
}));

type HrListener = (state: { liveHr: number | null; connectionState: string }) => void;
const mockHrListeners = new Set<HrListener>();
let mockLiveHr: number | null = null;

jest.mock('@/features/heart-rate', () => {
  const actualZones = jest.requireActual('@/features/heart-rate/services/heartRateZones');
  return {
    ...actualZones,
    HeartRateCard: () => null,
    useHeartRate: () => ({
      liveHr: mockLiveHr,
      connectionState: mockLiveHr !== null ? 'connected' : 'disconnected'
    }),
    heartRateService: {
      subscribe: (listener: HrListener) => {
        mockHrListeners.add(listener);
        listener({
          liveHr: mockLiveHr,
          connectionState: mockLiveHr !== null ? 'connected' : 'disconnected'
        });
        return () => {
          mockHrListeners.delete(listener);
        };
      }
    }
  };
});

jest.mock('@/features/profile', () => ({
  useUserProfile: () => ({ age: 30, maxHeartRate: 190 })
}));

const emitHr = (bpm: number | null) => {
  mockLiveHr = bpm;
  for (const listener of mockHrListeners) {
    listener({
      liveHr: bpm,
      connectionState: bpm !== null ? 'connected' : 'disconnected'
    });
  }
};

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

describe('buildTimerHeartRateData & countNewMilestones', () => {
  it('returns null summary and stream when no heart-rate samples were collected', () => {
    expect(buildTimerHeartRateData([])).toEqual({ summary: null, stream: null });
    expect(countNewMilestones(180, 3, 0)).toBe(1);
    expect(countNewMilestones(180, 0, 0)).toBe(0);
  });

  it('computes average/max HR and deduplicates samples by elapsed second into a time-aligned stream', () => {
    const { summary, stream } = buildTimerHeartRateData([
      { elapsedSec: 0, bpm: 88 },
      { elapsedSec: 0, bpm: 92 },
      { elapsedSec: 5, bpm: 108 },
      { elapsedSec: 10, bpm: 120 }
    ]);

    expect(summary).toEqual({
      average: Math.round((88 + 92 + 108 + 120) / 4),
      max: 120
    });
    expect(stream).toEqual({
      time: {
        data: [0, 5, 10],
        series_type: 'time',
        original_size: 3,
        resolution: 'high'
      },
      heartrate: {
        data: [92, 108, 120],
        series_type: 'time',
        original_size: 3,
        resolution: 'high'
      }
    });
  });
});

describe('useTimerRecording with BLE heart-rate monitoring', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAsyncStore.clear();
    mockHrListeners.clear();
    mockLiveHr = null;
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  it('collects HR samples only while running (ignoring paused state) and writes stream + summary on save', async () => {
    const { result } = renderHook(() => useTimerRecording());

    act(() => {
      result.current.start();
    });
    expect(result.current.phase).toBe('running');

    act(() => {
      jest.advanceTimersByTime(1000);
      emitHr(95);
    });

    act(() => {
      jest.advanceTimersByTime(2000);
      emitHr(115);
    });

    // Pause and emit a higher HR during pause — should be ignored
    act(() => {
      result.current.pause();
    });
    expect(result.current.phase).toBe('paused');

    act(() => {
      jest.advanceTimersByTime(5000);
      emitHr(165);
    });

    // Resume and emit one more sample
    act(() => {
      mockLiveHr = null;
      result.current.resume();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
      emitHr(120);
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.phase).toBe('stopped');
    expect(result.current.heartRateSummary).toEqual({
      average: 110,
      max: 120
    });

    let saved: Activity | null = null;
    await act(async () => {
      saved = await result.current.save('Morning Yoga');
    });

    expect(saved).not.toBeNull();
    const savedActivity = saved!;
    expect(savedActivity.type).toBe('Yoga');
    expect(savedActivity.name).toBe('Morning Yoga');
    expect(savedActivity.average_heartrate).toBe(110);
    expect(savedActivity.max_heartrate).toBe(120);
    expect(mockWriteStreamFile).toHaveBeenCalledTimes(1);
    expect(mockWriteStreamFile).toHaveBeenCalledWith(
      savedActivity.id,
      expect.objectContaining({
        time: expect.objectContaining({ data: [1, 3, 5] }),
        heartrate: expect.objectContaining({ data: [95, 115, 120] })
      })
    );
    expect(mockAddActivity).toHaveBeenCalledWith(savedActivity);
  });
});

describe('TimerRecordingScreen UI with live HR and zone badge', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAsyncStore.clear();
    mockHrListeners.clear();
    mockLiveHr = 128; // 128 / 190 = 67.4% -> Z2 · Aerobic
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  it('displays live BPM and HR zone in landscape mode and shows HR avg/max in stopped summary before navigating on save', async () => {
    const navigate = jest.fn();
    const { getByText, getByLabelText, getByPlaceholderText } = render(
      wrap(<TimerRecordingScreen navigation={{ navigate }} />)
    );

    fireEvent.press(getByLabelText('Start timer recording'));

    // In running landscape view, live HR (128 bpm) and Z2 · Aerobic badge are rendered
    expect(getByText('128')).toBeTruthy();
    expect(getByText('bpm')).toBeTruthy();
    expect(getByText('Z2 · Aerobic')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3000);
      emitHr(132);
    });

    fireEvent.press(getByLabelText('Stop recording'));

    // Stopped summary shows duration, type, and HR avg/max (128 & 132 -> avg 130 / max 132)
    expect(getByText('Recording complete')).toBeTruthy();
    expect(getByText('130/132')).toBeTruthy();
    expect(getByText('HR avg/max')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Name this activity (optional)'), 'Vinyasa Yoga');
    fireEvent.press(getByLabelText('Save as activity'));

    await waitFor(() => {
      expect(mockAddActivity).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('ActivityDetail', {
        activityId: expect.stringMatching(/^timer-/)
      });
    });
  });
});
