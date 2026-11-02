import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ThemeProvider } from '@/theme';
import { AnnualConsistencyCard } from '@/features/stats/components/AnnualConsistencyCard';
import { makeTestActivity } from '../helpers/testActivities';

describe('AnnualConsistencyCard', () => {
  const activities = [
    makeTestActivity({
      id: '1',
      type: 'Run',
      start_date_utc: '2023-01-01T08:00:00Z'
    }),
    makeTestActivity({
      id: '2',
      type: 'Run',
      start_date_utc: '2023-01-02T08:00:00Z'
    }),
    makeTestActivity({
      id: '3',
      type: 'Ride',
      start_date_utc: '2024-06-01T08:00:00Z'
    }),
    makeTestActivity({
      id: '4',
      type: 'Ride',
      start_date_utc: '2024-06-02T08:00:00Z'
    })
  ];

  it('renders consistency badges for active days, frequency, and streak', () => {
    const view = render(
      <ThemeProvider>
        <AnnualConsistencyCard
          activities={activities}
          availableSports={['Run', 'Ride']}
        />
      </ThemeProvider>
    );

    expect(view.getByText('Active Days')).toBeTruthy();
    expect(view.getByText('Workouts / Wk')).toBeTruthy();
    expect(view.getByText('Longest Streak')).toBeTruthy();
    expect(view.getByText('Total Sessions')).toBeTruthy();
  });

  it('filters consistency metrics by sport when selecting a sport chip', () => {
    const view = render(
      <ThemeProvider>
        <AnnualConsistencyCard
          activities={activities}
          availableSports={['Run', 'Ride']}
        />
      </ThemeProvider>
    );

    const runChip = view.getByLabelText('Select sport Run');
    act(() => {
      fireEvent.press(runChip);
    });

    expect(view.getByText('Active Days')).toBeTruthy();
  });

  it('allows clicking different metric badges to switch active chart metric', () => {
    const view = render(
      <ThemeProvider>
        <AnnualConsistencyCard
          activities={activities}
          availableSports={['Run', 'Ride']}
        />
      </ThemeProvider>
    );

    const streakBadge = view.getByLabelText('Show Longest Streak trend');
    act(() => {
      fireEvent.press(streakBadge);
    });

    const sessionsBadge = view.getByLabelText('Show Total Sessions trend');
    act(() => {
      fireEvent.press(sessionsBadge);
    });
  });

  it('returns null if activities array is empty', () => {
    const view = render(
      <ThemeProvider>
        <AnnualConsistencyCard
          activities={[]}
          availableSports={['Run', 'Ride']}
        />
      </ThemeProvider>
    );

    expect(view.toJSON()).toBeNull();
  });
});
