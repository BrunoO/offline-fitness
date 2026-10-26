import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { saveLastRecordingProfile } from '@/features/recording/services/profiles';
import {
  RecordingScreen,
  computeAverageSpeedMps,
  defaultRateModeForProfile,
  formatElevationGain,
  formatPace,
  formatSpeed,
  parseSwimDistanceOverride
} from '@/features/recording/screens/RecordingScreen';

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
    mockAsyncStore.clear();
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

  it('renders richer post-workout summary and splits breakdown table in stopped-unsaved phase', () => {
    mockUseRecording.mockReturnValue({
      capabilities: { canRecord: true },
      state: { phase: 'stopped-unsaved', sessionId: 's-done' },
      activeProfile: 'running',
      liveStats: null,
      summary: {
        sessionId: 's-done',
        fixCount: 180,
        logUri: 'file:///tmp/s-done/fixes.jsonl',
        meta: {
          sessionId: 's-done',
          profile: 'running',
          startedAtUtcMs: 1_700_000_000_000,
          deviceUtcOffsetSeconds: 3600,
          capture: {
            intervalMs: 2000,
            minDistanceM: 3,
            accuracyCeilingM: 20,
            useBarometer: true
          },
          pauses: [],
          fixCount: 180,
          logUri: 'file:///tmp/s-done/fixes.jsonl',
          libraryVersion: '0.1.0'
        },
        liveStats: {
          elapsedSec: 660,
          movingTimeSec: 600,
          distanceMeters: 2500,
          currentSpeedMps: 2500 / 600,
          altitudeM: 310,
          elevationGainM: 42,
          gpsLost: false,
          hAccM: 4
        }
      },
      heartRateSummary: { average: 152, max: 171 },
      splits: [
        {
          splitNumber: 1,
          splitDistanceMeters: 1000,
          splitDurationMs: 235_000,
          paceSecondsPerKm: 235,
          paceFormatted: '3:55 /km',
          totalDistanceMeters: 1000,
          totalElapsedTimeMs: 235_000
        },
        {
          splitNumber: 2,
          splitDistanceMeters: 1000,
          splitDurationMs: 245_000,
          paceSecondsPerKm: 245,
          paceFormatted: '4:05 /km',
          totalDistanceMeters: 2000,
          totalElapsedTimeMs: 480_000
        },
        {
          splitNumber: 3,
          splitDistanceMeters: 500,
          splitDurationMs: 125_000,
          paceSecondsPerKm: 250,
          paceFormatted: '4:10 /km',
          totalDistanceMeters: 2500,
          totalElapsedTimeMs: 605_000
        }
      ],
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

    const { getByText } = render(wrap(<RecordingScreen />));

    // Summary grid items
    expect(getByText('2.50 km')).toBeTruthy();
    expect(getByText('distance')).toBeTruthy();
    expect(getByText('10:00')).toBeTruthy();
    expect(getByText('moving time')).toBeTruthy();
    expect(getByText('11:00')).toBeTruthy();
    expect(getByText('duration')).toBeTruthy();
    expect(getByText('4:00 /km')).toBeTruthy();
    expect(getByText('avg pace')).toBeTruthy();
    expect(getByText('+42 m')).toBeTruthy();
    expect(getByText('elev gain')).toBeTruthy();
    expect(getByText('152/171')).toBeTruthy();
    expect(getByText('HR avg/max')).toBeTruthy();

    // Splits breakdown table
    expect(getByText('Splits')).toBeTruthy();
    expect(getByText('#1')).toBeTruthy();
    expect(getByText('3:55')).toBeTruthy();
    expect(getByText('3:55 /km')).toBeTruthy();
    expect(getByText('#2')).toBeTruthy();
    expect(getByText('4:05')).toBeTruthy();
    expect(getByText('4:05 /km')).toBeTruthy();
    expect(getByText('#3')).toBeTruthy();
    expect(getByText('500 m')).toBeTruthy();
    expect(getByText('2:05')).toBeTruthy();
    expect(getByText('4:10 /km')).toBeTruthy();
  });

  describe('Pocket / Rain Lock Mode', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      act(() => {
        jest.clearAllTimers();
      });
      jest.useRealTimers();
    });

    it('locks screen, disables ghost touches, shows hint on transient tap, and unlocks on 1.5s hold', () => {
      mockUseRecording.mockReturnValue({
        capabilities: { canRecord: true },
        state: { phase: 'recording' },
        activeProfile: 'running',
        liveStats: {
          elapsedSec: 300,
          distanceMeters: 1000,
          currentSpeedMps: 4.0,
          altitudeM: 200,
          slopePercent: 2.0,
          elevationGainM: 30,
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

      const { getByText, getByLabelText, queryByText, queryByLabelText } = render(
        wrap(<RecordingScreen />)
      );

      // Unlocked state: action buttons are visible
      expect(getByLabelText('Pause recording')).toBeTruthy();
      expect(getByLabelText('Stop recording')).toBeTruthy();
      expect(getByLabelText('Lock screen against accidental touches')).toBeTruthy();
      expect(queryByText('Screen locked')).toBeNull();

      // Lock screen
      fireEvent.press(getByLabelText('Lock screen against accidental touches'));

      // Screen locked state: normal action buttons replaced by Hold to unlock
      expect(queryByLabelText('Pause recording')).toBeNull();
      expect(queryByLabelText('Stop recording')).toBeNull();
      expect(getByText('Screen locked')).toBeTruthy();
      expect(getByText('Screen locked · Touch controls disabled')).toBeTruthy();

      const unlockButton = getByLabelText('Hold to unlock screen');
      expect(unlockButton).toBeTruthy();

      // Stats remain visible and alive
      expect(getByText('5:00')).toBeTruthy();
      expect(getByText('1.00 km')).toBeTruthy();
      expect(getByText('4:10 /km')).toBeTruthy();

      // Touching stat tiles while locked does not promote or toggle
      const elevTile = getByLabelText('Enlarge Elev gain');
      expect(elevTile.props.accessibilityState?.disabled).toBe(true);

      // Transient tap (pressIn followed immediately by pressOut) does not unlock
      fireEvent(unlockButton, 'pressIn');
      act(() => {
        jest.advanceTimersByTime(300);
      });
      fireEvent(unlockButton, 'pressOut');

      // Still locked, and early-release hint is shown
      expect(getByText('Keep holding until unlocked')).toBeTruthy();
      expect(queryByLabelText('Pause recording')).toBeNull();

      // Hold continuously for 1.5 seconds to unlock
      fireEvent(unlockButton, 'pressIn');
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      // Screen is now unlocked: normal controls restored
      expect(getByLabelText('Pause recording')).toBeTruthy();
      expect(getByLabelText('Stop recording')).toBeTruthy();
      expect(getByLabelText('Lock screen against accidental touches')).toBeTruthy();
      expect(queryByText('Screen locked')).toBeNull();
      expect(queryByText('Hold to unlock')).toBeNull();
    });

    it('allows locking during paused phase and restores Resume/Stop on unlock', () => {
      mockUseRecording.mockReturnValue({
        capabilities: { canRecord: true },
        state: { phase: 'paused' },
        activeProfile: 'cycling',
        liveStats: null,
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

      const { getByText, getByLabelText, queryByLabelText } = render(wrap(<RecordingScreen />));

      // In paused phase, lock button is available
      expect(getByLabelText('Resume recording')).toBeTruthy();
      expect(getByLabelText('Stop recording')).toBeTruthy();
      fireEvent.press(getByLabelText('Lock screen against accidental touches'));

      // Locked: Resume and Stop are replaced
      expect(queryByLabelText('Resume recording')).toBeNull();
      expect(queryByLabelText('Stop recording')).toBeNull();
      expect(getByText('Screen locked')).toBeTruthy();

      // Full hold unlocks and restores Resume/Stop
      const unlockButton = getByLabelText('Hold to unlock screen');
      fireEvent(unlockButton, 'pressIn');
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      expect(getByLabelText('Resume recording')).toBeTruthy();
      expect(getByLabelText('Stop recording')).toBeTruthy();
    });
  });

  it('restores last-used profile from AsyncStorage, persists changes, and navigates to Details on save', async () => {
    await saveLastRecordingProfile('cycling');
    const start = jest.fn().mockResolvedValue(undefined);

    mockUseRecording.mockReturnValue({
      capabilities: { canRecord: true },
      state: { phase: 'idle' },
      activeProfile: null,
      liveStats: null,
      summary: null,
      splits: [],
      heartRateSummary: null,
      lastSplit: null,
      error: null,
      isBusy: false,
      isSaving: false,
      unfinished: [],
      start,
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
      save: jest.fn(),
      discard: jest.fn(),
      saveUnfinished: jest.fn(),
      discardUnfinished: jest.fn()
    });

    const { getByLabelText, unmount } = render(wrap(<RecordingScreen />));

    // Restores 'cycling' from AsyncStorage so Start uses 'cycling'
    await waitFor(() => {
      expect(getByLabelText('Cycling').props.accessibilityState?.selected).toBe(true);
    });

    // Selecting 'Hiking' updates selection and persists to AsyncStorage
    fireEvent.press(getByLabelText('Hiking'));
    fireEvent.press(getByLabelText('Start recording'));
    expect(start).toHaveBeenCalledWith('hiking');
    unmount();

    // Saving a stopped session navigates to Details with selectedActivityId
    const save = jest.fn().mockResolvedValue({ id: 'recorded-1700000000000-1' });
    const navigate = jest.fn();
    mockUseRecording.mockReturnValue({
      capabilities: { canRecord: true },
      state: { phase: 'stopped-unsaved', sessionId: 's-done' },
      activeProfile: 'hiking',
      liveStats: null,
      summary: null,
      splits: [],
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
      save,
      discard: jest.fn(),
      saveUnfinished: jest.fn(),
      discardUnfinished: jest.fn()
    });

    const { getByLabelText: getStoppedLabel } = render(
      wrap(<RecordingScreen navigation={{ navigate }} />)
    );
    fireEvent.press(getStoppedLabel('Save as activity'));

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith('', undefined);
      expect(navigate).toHaveBeenCalledWith('Details', {
        allActivities: undefined,
        selectedActivityId: 'recorded-1700000000000-1'
      });
    });
  });

  it('allows overriding distance in meters on save for swimming and live-updates summary distance and /100m pace', async () => {
    expect(parseSwimDistanceOverride('')).toBeUndefined();
    expect(parseSwimDistanceOverride('   ')).toBeUndefined();
    expect(parseSwimDistanceOverride('-100')).toBeUndefined();
    expect(parseSwimDistanceOverride('abc')).toBeUndefined();
    expect(parseSwimDistanceOverride('1500')).toBe(1500);
    expect(parseSwimDistanceOverride('1250,5')).toBe(1250.5);

    const save = jest.fn().mockResolvedValue({ id: 'recorded-1700000000000-2' });
    mockUseRecording.mockReturnValue({
      capabilities: { canRecord: true },
      state: { phase: 'stopped-unsaved', sessionId: 's-swim' },
      activeProfile: 'swimming',
      liveStats: null,
      summary: {
        meta: {
          sessionId: 's-swim',
          profile: 'swimming',
          startedAtUtcMs: 1_700_000_000_000,
          deviceUtcOffsetSeconds: 3600,
          capture: {
            intervalMs: 3000,
            minDistanceM: 4,
            accuracyCeilingM: 30,
            useBarometer: false
          },
          pauses: [],
          fixCount: 0,
          logUri: 'file:///tmp/s-swim/fixes.jsonl',
          libraryVersion: '0.1.0'
        },
        liveStats: {
          elapsedSec: 1800,
          movingTimeSec: 1800,
          distanceMeters: 0,
          currentSpeedMps: 0,
          altitudeM: null,
          elevationGainM: 0,
          gpsLost: true,
          hAccM: null
        }
      },
      splits: [],
      heartRateSummary: { average: 138, max: 156 },
      lastSplit: null,
      error: null,
      isBusy: false,
      isSaving: false,
      unfinished: [],
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
      save,
      discard: jest.fn(),
      saveUnfinished: jest.fn(),
      discardUnfinished: jest.fn()
    });

    const { getByText, getByLabelText, getByPlaceholderText } = render(wrap(<RecordingScreen />));

    // Before entering an override, GPS distance is 0.00 km and pace is '—'
    expect(getByText('0.00 km')).toBeTruthy();
    const swimDistanceInput = getByLabelText('Swim distance in meters');
    expect(swimDistanceInput).toBeTruthy();

    // Enter 1500 meters -> 1.50 km in 1800s (30:00) = 2:00 /100m
    fireEvent.changeText(swimDistanceInput, '1500');
    expect(getByText('1.50 km')).toBeTruthy();
    expect(getByText('2:00 /100m')).toBeTruthy();

    fireEvent.changeText(
      getByPlaceholderText('Name this activity (optional)'),
      'Morning Pool Swim'
    );
    fireEvent.press(getByLabelText('Save as activity'));

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith('Morning Pool Swim', 1500);
    });
  });
});
