import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import {
  RecordingScreen,
  computeAverageSpeedMps,
  defaultRateModeForProfile,
  formatElevationGain,
  formatPace,
  formatSpeed
} from '@/features/recording/screens/RecordingScreen';

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
      activeProfile: 'running',
      liveStats: {
        elapsedSec: 500,
        distanceMeters: 2500,
        currentSpeedMps: 5.5,
        altitudeM: 320,
        slopePercent: 4.5,
        elevationGainM: 85.4,
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
      saveUnfinished: jest.fn(),
      discardUnfinished: jest.fn()
    });

    const { getByText, getByLabelText } = render(wrap(<RecordingScreen />));

    // Hero stat defaults to Elapsed time (500s -> 8:20)
    expect(getByText('8:20')).toBeTruthy();
    expect(getByText('Elapsed')).toBeTruthy();
    expect(getByText('Running')).toBeTruthy();

    // Compact tiles show distance, pace (5.5 m/s -> 3:02 /km), avg pace (2500m / 500s = 5.0 m/s -> 3:20 /km), elev gain (+85 m), altitude, and slope
    expect(getByText('2.50 km')).toBeTruthy();
    expect(getByText('Pace')).toBeTruthy();
    expect(getByText('3:02 /km')).toBeTruthy();
    expect(getByText('Avg pace')).toBeTruthy();
    expect(getByText('3:20 /km')).toBeTruthy();
    expect(getByText('Elev gain')).toBeTruthy();
    expect(getByText('+85 m')).toBeTruthy();
    expect(getByText('320 m')).toBeTruthy();
    expect(getByText('+4.5%')).toBeTruthy();
    expect(getByText('Slope')).toBeTruthy();

    // User can toggle Pace -> Speed (km/h) for both instantaneous and average tiles
    fireEvent.press(getByLabelText('Switch to speed (km/h)'));
    expect(getByText('Speed')).toBeTruthy();
    expect(getByText('19.8 km/h')).toBeTruthy();
    expect(getByText('Avg speed')).toBeTruthy();
    expect(getByText('18.0 km/h')).toBeTruthy();

    // Promote Elev gain to hero stat
    fireEvent.press(getByLabelText('Enlarge Elev gain'));
    expect(getByLabelText('Promote Elev gain (currently enlarged)')).toBeTruthy();

    // Promote Avg speed to hero stat
    fireEvent.press(getByLabelText('Enlarge Avg speed'));
    expect(getByLabelText('Promote Avg speed (currently enlarged)')).toBeTruthy();

    // Promote Slope to hero stat
    fireEvent.press(getByLabelText('Enlarge Slope'));

    // Now Slope is hero with +4.5%
    expect(getByLabelText('Promote Slope (currently enlarged)')).toBeTruthy();

    // Tap hero to cycle back to Elapsed
    fireEvent.press(getByLabelText('Promote Slope (currently enlarged)'));
    expect(getByLabelText('Promote Elapsed (currently enlarged)')).toBeTruthy();
  });

  it('allows saving an unfinished recording and shows active profile while paused', () => {
    const saveUnfinished = jest.fn().mockResolvedValue(undefined);
    mockUseRecording.mockReturnValue({
      capabilities: { canRecord: true },
      state: { phase: 'paused', sessionId: 's-live' },
      activeProfile: 'cycling',
      liveStats: null,
      summary: null,
      heartRateSummary: null,
      lastSplit: null,
      error: null,
      isBusy: false,
      isSaving: false,
      unfinished: [
        {
          sessionId: 's-crashed-1',
          profile: 'hiking',
          startedAtUtcMs: 1_700_000_000_000,
          deviceUtcOffsetSeconds: 3600,
          capture: {
            intervalMs: 4000,
            minDistanceM: 4,
            accuracyCeilingM: 20,
            useBarometer: true
          },
          pauses: [],
          fixCount: 42,
          logUri: 'file:///tmp/fixes.jsonl',
          libraryVersion: '0.1.0'
        }
      ],
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
      save: jest.fn(),
      discard: jest.fn(),
      saveUnfinished,
      discardUnfinished: jest.fn()
    });

    const { getByText, getByLabelText } = render(wrap(<RecordingScreen />));

    // Active profile badge stays visible in paused phase
    expect(getByText('Cycling')).toBeTruthy();

    // Unfinished recording card shows Hiking and Save button
    expect(getByText('Hiking')).toBeTruthy();
    fireEvent.press(getByLabelText('Save unfinished recording'));
    expect(saveUnfinished).toHaveBeenCalledWith('s-crashed-1');
  });

  it('defaults swimming to min/100m pace and cycling to km/h speed', () => {
    expect(defaultRateModeForProfile('walking')).toBe('pace');
    expect(defaultRateModeForProfile('running')).toBe('pace');
    expect(defaultRateModeForProfile('hiking')).toBe('pace');
    expect(defaultRateModeForProfile('swimming')).toBe('pace');
    expect(defaultRateModeForProfile('cycling')).toBe('speed');

    expect(formatPace(1.25, 'swimming')).toBe('1:20 /100m');
    expect(formatPace(4.0, 'running')).toBe('4:10 /km');
    expect(formatPace(0.05, 'running')).toBe('—');
    expect(formatPace(null, 'walking')).toBe('—');
    expect(formatSpeed(5.5)).toBe('19.8 km/h');
    expect(formatSpeed(null)).toBe('—');
    expect(formatElevationGain(142.6, 'hiking')).toBe('+143 m');
    expect(formatElevationGain(null, 'hiking')).toBe('—');
    expect(formatElevationGain(50, 'swimming')).toBe('0 m');
    expect(
      computeAverageSpeedMps({
        elapsedSec: 0,
        distanceMeters: 100,
        currentSpeedMps: null,
        altitudeM: null,
        gpsLost: false,
        hAccM: null
      })
    ).toBeNull();

    mockUseRecording.mockReturnValue({
      capabilities: { canRecord: true },
      state: { phase: 'recording' },
      activeProfile: 'swimming',
      liveStats: {
        elapsedSec: 60,
        distanceMeters: 60,
        currentSpeedMps: 1.25,
        altitudeM: null,
        slopePercent: null,
        gpsLost: false,
        hAccM: 5
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
      saveUnfinished: jest.fn(),
      discardUnfinished: jest.fn()
    });

    const { getByText, getByLabelText } = render(wrap(<RecordingScreen />));
    expect(getByText('Pace')).toBeTruthy();
    expect(getByText('1:20 /100m')).toBeTruthy();
    expect(getByText('Avg pace')).toBeTruthy();
    expect(getByText('1:40 /100m')).toBeTruthy();

    fireEvent.press(getByLabelText('Switch to speed (km/h)'));
    expect(getByText('Speed')).toBeTruthy();
    expect(getByText('4.5 km/h')).toBeTruthy();
    expect(getByText('Avg speed')).toBeTruthy();
    expect(getByText('3.6 km/h')).toBeTruthy();
    expect(getByText('Show /100m')).toBeTruthy();
  });
});
