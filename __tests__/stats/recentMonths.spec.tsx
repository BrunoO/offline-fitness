import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { makeTestActivity } from '../helpers/testActivities';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate
  })
}));

const now = new Date();
const currentYear = now.getFullYear();

const mockActivities = [
  makeTestActivity({
    id: '1',
    type: 'Run',
    start_date_utc: `${currentYear}-06-15T08:00:00Z`,
    distance: 10000,
    total_elevation_gain: 150
  }),
  makeTestActivity({
    id: '2',
    type: 'Ride',
    start_date_utc: `${currentYear}-06-20T10:00:00Z`,
    distance: 35000,
    total_elevation_gain: 400
  })
];

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve())
}));

jest.mock('@/features/activities', () => ({
  useActivitiesContext: () => ({
    globalActivities: mockActivities,
    myActivitiesDiscovered: new Set(['Run', 'Ride']),
    refreshActivities: jest.fn(),
    fetchingData: false
  }),
  useProcessedActivities: () => ({
    myActivitiesToUse: ['Run', 'Ride'],
    allActivitiesToUse: mockActivities
  }),
  MERGED_ACTIVITY_TYPES: {
    EBikeRide: 'Ride',
    Hike: 'Walk',
    Workout: 'Yoga'
  }
}));

jest.mock('@/features/activities/ActivitiesContext', () => ({
  useActivitiesDataContext: () => ({
    globalActivities: mockActivities,
    myActivitiesDiscovered: new Set(['Run', 'Ride'])
  })
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecentMonthsScreen } = require('@/features/stats/screens/RecentMonthsScreen');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ThemeProvider } = require('@/theme');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SettingsProvider } = require('@/features/stats/StatsTabSettingsContext');

async function renderMonthsScreen() {
  const view = render(
    <ThemeProvider>
      <SettingsProvider>
        <RecentMonthsScreen />
      </SettingsProvider>
    </ThemeProvider>
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('RecentMonthsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing and displays the interactive chart hint', async () => {
    const view = await renderMonthsScreen();
    expect(view.getByText('Tap any month to view its activities')).toBeTruthy();
  });

  it('navigates to Details when a month row is tapped', async () => {
    const view = await renderMonthsScreen();

    // Find the touchable row for Jun
    const juneButtons = view.getAllByLabelText(/View activities for Jun/);
    expect(juneButtons.length).toBeGreaterThan(0);

    // Tap the first matching chart's June row (Distance chart)
    act(() => {
      fireEvent.press(juneButtons[0]);
    });

    expect(mockNavigate).toHaveBeenCalledWith('Details', {
      allActivities: expect.arrayContaining([
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '2' })
      ]),
      filterLabel: `Jun ${currentYear}`,
      useElapsedTime: true
    });
  });

  it('filters by selected activity type chip and only navigates with matching activities', async () => {
    const view = await renderMonthsScreen();

    // Toggle "Run" chip
    const runChip = view.getByLabelText('Toggle Run');
    act(() => {
      fireEvent.press(runChip);
    });

    const juneButtons = view.getAllByLabelText(/View activities for Jun/);
    act(() => {
      fireEvent.press(juneButtons[0]);
    });

    expect(mockNavigate).toHaveBeenCalledWith('Details', {
      allActivities: [expect.objectContaining({ id: '1', type: 'Run' })],
      filterLabel: `Jun ${currentYear}`,
      useElapsedTime: true
    });
  });
});
