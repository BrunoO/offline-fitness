import MapsScreen from '@/features/maps/screens/MapsScreen.android';
import { Activity, MapsScreenProps } from '@/shared';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockActivities: Activity[] = [
  {
    id: 1,
    name: 'Morning Run',
    type: 'Run',
    start_date: '2026-05-10T08:00:00Z',
    start_date_local: '2026-05-10T10:00:00',
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3200,
    total_elevation_gain: 150,
    start_latlng: [45.1, 5.7],
    end_latlng: [45.12, 5.72]
  } as unknown as Activity
];

jest.mock('@/features/activities', () => ({
  useActivitiesDataContext: () => ({
    globalActivities: mockActivities,
    myActivitiesDiscovered: new Set(['Run'])
  }),
  getActivityStreams: jest.fn().mockResolvedValue([])
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  MaterialCommunityIcons: 'MaterialCommunityIcons'
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 }
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>
    <ThemeProvider>{ui}</ThemeProvider>
  </SafeAreaProvider>
);

describe('MapsScreen (Android)', () => {
  const mockNavigation = {
    navigate: jest.fn()
  } as unknown as MapsScreenProps['navigation'];

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the bottom year/date filter buttons row and clear tab bar clearance', () => {
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    const { getByText, getByLabelText, getByTestId } = render(
      wrap(<MapsScreen navigation={mockNavigation} />)
    );

    const yearMinusOneBtn = getByLabelText(`Filter to ${lastYear}`);
    const yearBtn = getByLabelText(`Filter to ${currentYear}`);
    const startDateBtn = getByLabelText('Select start date');
    const endDateBtn = getByLabelText('Select end date');

    expect(yearMinusOneBtn).toBeTruthy();
    expect(yearBtn).toBeTruthy();
    expect(startDateBtn).toBeTruthy();
    expect(endDateBtn).toBeTruthy();
    expect(getByText(String(lastYear))).toBeTruthy();
    expect(getByText(String(currentYear))).toBeTruthy();

    // Verify MapView has mapPadding with bottom clearance for tab bar + date buttons
    const mapView = getByTestId('mock-map-view');
    expect(mapView.props.mapPadding).toBeDefined();
    // insets.bottom is 34, so bottomTabBarClearance is 34 + 76 = 110, mapBottomPadding is 110 + 44 = 154
    expect(mapView.props.mapPadding.bottom).toBe(154);

    // Filter to current year
    fireEvent.press(yearBtn);
    // Filter to last year
    fireEvent.press(yearMinusOneBtn);
  });
});
