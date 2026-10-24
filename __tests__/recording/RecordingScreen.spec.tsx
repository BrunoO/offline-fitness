import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RecordingScreen } from '@/features/recording/screens/RecordingScreen';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn()
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock('@/features/heart-rate', () => ({
  HeartRateCard: () => null
}));

const mockUseRecording = jest.fn();
jest.mock('@/features/recording/hooks/useRecording', () => ({
  useRecording: () => mockUseRecording()
}));

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

describe('RecordingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders live stats including slope and allows promoting slope to hero', () => {
    mockUseRecording.mockReturnValue({
      capabilities: { canRecord: true },
      state: { phase: 'recording' },
      liveStats: {
        elapsedSec: 125,
        distanceMeters: 2500,
        currentSpeedMps: 5.5,
        altitudeM: 320,
        slopePercent: 4.5,
        gpsLost: false,
        hAccM: 3
      },
      summary: null,
      heartRateSummary: null,
      lastSplit: null,
      error: null,
      isBusy: false,
      isSaving: false,
      unfinished: [],
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
      save: jest.fn(),
      discard: jest.fn(),
      discardUnfinished: jest.fn()
    });

    const { getByText, getByLabelText } = render(wrap(<RecordingScreen />));

    // Hero stat defaults to Elapsed time (125s -> 2:05)
    expect(getByText('2:05')).toBeTruthy();
    expect(getByText('Elapsed')).toBeTruthy();

    // Compact tiles show distance, speed, altitude, and slope
    expect(getByText('2.50 km')).toBeTruthy();
    expect(getByText('19.8 km/h')).toBeTruthy();
    expect(getByText('320 m')).toBeTruthy();
    expect(getByText('+4.5%')).toBeTruthy();
    expect(getByText('Slope')).toBeTruthy();

    // Promote Slope to hero stat
    fireEvent.press(getByLabelText('Enlarge Slope'));

    // Now Slope is hero with +4.5%
    expect(getByLabelText('Promote Slope (currently enlarged)')).toBeTruthy();

    // Tap hero to cycle back to Elapsed
    fireEvent.press(getByLabelText('Promote Slope (currently enlarged)'));
    expect(getByLabelText('Promote Elapsed (currently enlarged)')).toBeTruthy();
  });
});
