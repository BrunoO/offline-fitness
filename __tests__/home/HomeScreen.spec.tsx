import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('react-native-worklets', () => ({}));
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View
    },
    FadeIn: {
      duration: () => ({})
    }
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve())
}));

import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { ThemeProvider } from '@/theme';
import { SettingsProvider } from '@/features/stats/StatsTabSettingsContext';
import { makeTestActivity } from '../helpers/testActivities';
import { Activity } from '@/shared';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1'
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (cb: () => void) => {
    // Run the callback once on mount
    cb();
  }
}));

jest.mock('@/features/maps/components/FlyoverModal', () => () => null);
jest.mock('@/features/home/components/HomeActivityMapSection', () => ({
  HomeActivityMapSection: () => null
}));
jest.mock('@/features/home/components/ActivityCalendarPeriod', () => ({
  ActivityCalendarPeriod: () => null
}));
jest.mock('@/features/activities', () => ({
  LastActivitySummary: () => null,
  DayActivitiesSheet: () => null,
  countStreamsStatus: jest.fn().mockResolvedValue({ downloadedStreams: 0, missingStreams: 0 }),
  loadStreamForActivity: jest.fn().mockResolvedValue(null),
  useManualEntry: () => ({
    isManualEntryVisible: false,
    openManualEntry: jest.fn(),
    closeManualEntry: jest.fn()
  }),
  useActivitiesContext: () => mockUseActivities()
}));

let mockActivities: Activity[] = [];
const mockUseActivities = jest.fn(() => ({
  globalActivities: mockActivities,
  fetchingData: false,
  reloadActivities: jest.fn(),
  getRecentActivity: () => mockActivities[0] ?? null
}));

const mockNavigation: any = {
  navigate: jest.fn(),
  setOptions: jest.fn()
};

const renderScreen = () =>
  render(
    <ThemeProvider>
      <SettingsProvider>
        <HomeScreen navigation={mockNavigation} />
      </SettingsProvider>
    </ThemeProvider>
  );

describe('HomeScreen - Recent Achievements Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to Details screen with selectedActivityId when pressing longest activity or biggest climb', () => {
    // Two recent activities (e.g. within the last week)
    const now = new Date();
    const recentDate1 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate2 = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();

    const longestRun = makeTestActivity({
      id: 'act-longest',
      name: 'Epic Long Run',
      type: 'Run',
      start_date_utc: recentDate1,
      distance: 25000, // 25 km
      total_elevation_gain: 150
    });

    const biggestClimbRide = makeTestActivity({
      id: 'act-climb',
      name: 'Col du Tourmalet',
      type: 'Ride',
      start_date_utc: recentDate2,
      distance: 18000, // 18 km
      total_elevation_gain: 1400 // 1400 m
    });

    mockActivities = [longestRun, biggestClimbRide];

    const { getByLabelText, getByText } = renderScreen();

    // Verify recent achievements display values and names
    expect(getByText(/Longest activity 25\.0 km \(Epic Long Run\)/)).toBeTruthy();
    expect(getByText(/Biggest climb 1400 m \(Col du Tourmalet\)/)).toBeTruthy();

    // Press Longest activity -> navigates to Details
    const longestBtn = getByLabelText('View details for longest activity: Epic Long Run');
    expect(longestBtn).toBeTruthy();
    fireEvent.press(longestBtn);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Details', {
      allActivities: mockActivities,
      selectedActivityId: 'act-longest'
    });

    // Press Biggest climb -> navigates to Details
    const climbBtn = getByLabelText('View details for biggest climb: Col du Tourmalet');
    expect(climbBtn).toBeTruthy();
    fireEvent.press(climbBtn);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Details', {
      allActivities: mockActivities,
      selectedActivityId: 'act-climb'
    });
  });

  it('does not navigate when no activities are recorded', () => {
    mockActivities = [];

    const { getByText, queryByLabelText } = renderScreen();

    expect(getByText(/Longest activity N\/A/)).toBeTruthy();
    expect(getByText(/Biggest climb N\/A/)).toBeTruthy();
    expect(queryByLabelText(/View details for longest activity/)).toBeNull();
    expect(queryByLabelText(/View details for biggest climb/)).toBeNull();
  });
});
