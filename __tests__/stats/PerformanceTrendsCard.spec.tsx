import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ThemeProvider } from '@/theme';
import { PerformanceTrendsCard } from '@/features/stats/components/PerformanceTrendsCard';
import { makeTestActivity } from '../helpers/testActivities';

describe('PerformanceTrendsCard', () => {
  const activities = [
    makeTestActivity({
      id: '1',
      type: 'Run',
      start_date_utc: '2023-05-10T08:00:00Z',
      distance: 10000,
      moving_time: 3000, // 5:00 min/km
      elapsed_time: 3000,
      total_elevation_gain: 100
    }),
    makeTestActivity({
      id: '2',
      type: 'Run',
      start_date_utc: '2024-05-10T08:00:00Z',
      distance: 10000,
      moving_time: 2700, // 4:30 min/km (faster)
      elapsed_time: 2700,
      total_elevation_gain: 150
    }),
    makeTestActivity({
      id: '3',
      type: 'Ride',
      start_date_utc: '2024-06-10T08:00:00Z',
      distance: 30000,
      moving_time: 3600, // 30 km/h
      elapsed_time: 3600,
      total_elevation_gain: 300
    })
  ];

  it('renders pace badges for a running sport', () => {
    const view = render(
      <ThemeProvider>
        <PerformanceTrendsCard
          activities={activities}
          availableSports={['Run', 'Ride']}
          useElapsedTime={false}
        />
      </ThemeProvider>
    );

    // Should show Avg Pace badge label
    expect(view.getByText('Avg Pace')).toBeTruthy();
    // Latest run was 4:30
    expect(view.getByText('4:30')).toBeTruthy();
    // Elevation per 10km for latest run: 150m
    expect(view.getByText('150 m')).toBeTruthy();
  });

  it('switches to speed when selecting cycling', () => {
    const view = render(
      <ThemeProvider>
        <PerformanceTrendsCard
          activities={activities}
          availableSports={['Run', 'Ride']}
          useElapsedTime={false}
        />
      </ThemeProvider>
    );

    const rideChip = view.getByLabelText('Select sport Ride');
    act(() => {
      fireEvent.press(rideChip);
    });

    // Should now show Avg Speed
    expect(view.getByText('Avg Speed')).toBeTruthy();
    expect(view.getByText('30.0 km/h')).toBeTruthy();
  });

  it('allows clicking different metric badges to switch active trend', () => {
    const view = render(
      <ThemeProvider>
        <PerformanceTrendsCard
          activities={activities}
          availableSports={['Run', 'Ride']}
          useElapsedTime={false}
        />
      </ThemeProvider>
    );

    const elevBadge = view.getByLabelText('Show Elev / 10km trend');
    act(() => {
      fireEvent.press(elevBadge);
    });

    const distBadge = view.getByLabelText('Show Avg Distance trend');
    act(() => {
      fireEvent.press(distBadge);
    });
  });

  it('returns null if activities array is empty', () => {
    const view = render(
      <ThemeProvider>
        <PerformanceTrendsCard
          activities={[]}
          availableSports={['Run', 'Ride']}
          useElapsedTime={false}
        />
      </ThemeProvider>
    );

    expect(view.toJSON()).toBeNull();
  });
});
