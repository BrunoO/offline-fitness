import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { ActivityAnalysisView } from '@/features/activities/components/ActivityAnalysisView';
import { makeTestActivity } from '../helpers/testActivities';
import { Activity, ActivityStream } from '@/shared';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialCommunityIcons: 'MaterialCommunityIcons'
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('@react-native-community/slider', () => 'Slider');

const mockGetActivityStreams = jest.fn();
jest.mock('@/features/activities/services/fetchAndStoreStreams', () => ({
  getActivityStreams: (activities: Activity[]) => mockGetActivityStreams(activities)
}));

const mockMiniMapProps: { overlayStream?: ActivityStream } = {};
jest.mock('@/features/maps/components/MiniMapComponent', () => {
  const { View } = require('react-native');
  return function MockMiniMap(props: { overlayStream?: ActivityStream; title?: string }) {
    mockMiniMapProps.overlayStream = props.overlayStream;
    return <View testID="mock-mini-map" />;
  };
});

jest.mock('@/features/profile', () => ({
  useUserProfile: () => null
}));

const sampleStream1: ActivityStream = {
  coordinates: [
    { latitude: 45.0, longitude: 5.0 },
    { latitude: 45.01, longitude: 5.01 }
  ],
  altitude: [100, 120],
  time: [0, 600]
};

const sampleStream2: ActivityStream = {
  coordinates: [
    { latitude: 45.0, longitude: 5.0 },
    { latitude: 45.01, longitude: 5.01 }
  ],
  altitude: [105, 125],
  time: [0, 540]
};

jest.mock('@/features/activities/hooks/useLoadedStream', () => ({
  useLoadedStream: () => ({
    loadedStream: { streamSet: sampleStream1 },
    loadingStream: false
  })
}));

jest.mock('@/shared/services/trackComparison', () => ({
  findSimilarActivitiesByTrack: jest.fn().mockImplementation((_item, similar: Activity[]) =>
    Promise.resolve(
      similar.map(act => ({
        activity: act,
        similarity: 0.95,
        reversed: false
      }))
    )
  )
}));

describe('ActivityAnalysisView - Similar Activity Comparison', () => {
  const baseActivity: Activity = {
    ...makeTestActivity({
      id: 'base-1',
      name: 'Morning 10k Run',
      type: 'Run',
      distance: 10000,
      moving_time: 3000, // 5:00 min/km
      elapsed_time: 3000,
      total_elevation_gain: 100
    }),
    bounding_box: [
      [45.0, 5.0],
      [45.01, 5.01]
    ]
  };

  const similarActivity1: Activity = {
    ...makeTestActivity({
      id: 'sim-1',
      name: 'Tempo Run Yesterday',
      type: 'Run',
      distance: 10200,
      moving_time: 2700, // 4:24 min/km (faster)
      elapsed_time: 2700,
      total_elevation_gain: 120
    }),
    bounding_box: [
      [45.0, 5.0],
      [45.01, 5.01]
    ]
  };

  const similarActivity2: Activity = {
    ...makeTestActivity({
      id: 'sim-2',
      name: 'Easy Recovery Run',
      type: 'Run',
      distance: 9800,
      moving_time: 3300, // 5:36 min/km (slower)
      elapsed_time: 3300,
      total_elevation_gain: 90
    }),
    bounding_box: [
      [45.0, 5.0],
      [45.01, 5.01]
    ]
  };

  const allActivities = [baseActivity, similarActivity1, similarActivity2];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActivityStreams.mockImplementation((activities: Activity[]) => {
      const act = activities[0];
      if (act?.id === 'sim-1') {
        return Promise.resolve([{ id: 'sim-1', streamSet: sampleStream2 }]);
      }
      return Promise.resolve([{ id: act?.id, streamSet: sampleStream1 }]);
    });
  });

  it('initially displays the base activity in the hero card without comparison', async () => {
    const { getByTestId, findByText } = render(
      <ThemeProvider>
        <ActivityAnalysisView item={baseActivity} allActivities={allActivities} />
      </ThemeProvider>
    );

    // Wait for similar activities to load
    await findByText('Tempo Run Yesterday');

    // Initial hero card displays base activity
    await waitFor(() => {
      expect(getByTestId('hero-title').props.children).toBe('Morning 10k Run');
    });
  });

  it('updates the hero card to display similar activity info and comparison deltas when pressed', async () => {
    const { getByTestId, getByText, findByText } = render(
      <ThemeProvider>
        <ActivityAnalysisView item={baseActivity} allActivities={allActivities} />
      </ThemeProvider>
    );

    // Wait for similar activities to load
    const similarCardButton = await findByText('Tempo Run Yesterday');
    expect(similarCardButton).toBeTruthy();

    // Press the similar activity card
    await act(async () => {
      fireEvent.press(similarCardButton);
    });

    // The hero card now displays the similar activity's info
    expect(getByTestId('hero-title').props.children).toBe('Tempo Run Yesterday');
    expect(getByText('10.20 km')).toBeTruthy();

    // Deltas and base reference labels are shown
    expect(getByText('+0.20 km')).toBeTruthy();
    expect(getByText('Distance (Base: 10.00 km)')).toBeTruthy();

    // Overlay stream was loaded and passed to MiniMapComponent
    await waitFor(() => {
      expect(mockMiniMapProps.overlayStream).toEqual(sampleStream2);
    });
  });

  it('toggles comparison off when the same similar activity is pressed again', async () => {
    const { getByTestId, findByText } = render(
      <ThemeProvider>
        <ActivityAnalysisView item={baseActivity} allActivities={allActivities} />
      </ThemeProvider>
    );

    const similarCardButton = await findByText('Tempo Run Yesterday');

    // Press to select
    await act(async () => {
      fireEvent.press(similarCardButton);
    });
    expect(getByTestId('hero-title').props.children).toBe('Tempo Run Yesterday');

    // Press again to toggle off
    await act(async () => {
      fireEvent.press(similarCardButton);
    });

    // Reverted back to base activity
    expect(getByTestId('hero-title').props.children).toBe('Morning 10k Run');
    expect(mockMiniMapProps.overlayStream).toBeUndefined();
  });

  it('resets comparison when the base activity prop changes', async () => {
    const { getByTestId, findByText, rerender } = render(
      <ThemeProvider>
        <ActivityAnalysisView item={baseActivity} allActivities={allActivities} />
      </ThemeProvider>
    );

    const similarCardButton = await findByText('Tempo Run Yesterday');

    // Press to select
    await act(async () => {
      fireEvent.press(similarCardButton);
    });
    expect(getByTestId('hero-title').props.children).toBe('Tempo Run Yesterday');

    // Change base activity
    await act(async () => {
      rerender(
        <ThemeProvider>
          <ActivityAnalysisView item={similarActivity2} allActivities={allActivities} />
        </ThemeProvider>
      );
    });

    // Reverted back to new base activity
    await waitFor(() => {
      expect(getByTestId('hero-title').props.children).toBe('Easy Recovery Run');
      expect(mockMiniMapProps.overlayStream).toBeUndefined();
    });
  });

  it('switches to a different similar activity when another card is pressed', async () => {
    const { getByTestId, getByText, findByText } = render(
      <ThemeProvider>
        <ActivityAnalysisView item={baseActivity} allActivities={allActivities} />
      </ThemeProvider>
    );

    const card1 = await findByText('Tempo Run Yesterday');
    const card2 = await findByText('Easy Recovery Run');

    // Press first similar activity
    await act(async () => {
      fireEvent.press(card1);
    });
    expect(getByTestId('hero-title').props.children).toBe('Tempo Run Yesterday');
    expect(getByText('10.20 km')).toBeTruthy();

    // Press second similar activity
    await act(async () => {
      fireEvent.press(card2);
    });
    expect(getByTestId('hero-title').props.children).toBe('Easy Recovery Run');
    expect(getByText('9.80 km')).toBeTruthy();
    expect(getByText('-0.20 km')).toBeTruthy();
  });
});
