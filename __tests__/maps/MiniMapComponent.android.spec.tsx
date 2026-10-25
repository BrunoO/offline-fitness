import MiniMapComponent from '@/features/maps/components/MiniMapComponent.android';
import { ActivityStream } from '@/shared';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialCommunityIcons: 'MaterialCommunityIcons'
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    }
  };
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 }
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>
    <ThemeProvider>{ui}</ThemeProvider>
  </SafeAreaProvider>
);

const sampleStream: ActivityStream = {
  coordinates: [
    { latitude: 45.0, longitude: 5.0 },
    { latitude: 45.001, longitude: 5.001 },
    { latitude: 45.002, longitude: 5.002 }
  ],
  altitude: [100, 150, 200],
  time: [0, 10, 20]
};

describe('MiniMapComponent (Android)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders map with polylines and shows Flyover pill once map is ready', () => {
    const { getByTestId, queryByText, getByText } = render(
      wrap(<MiniMapComponent stream={sampleStream} title="Mountain Stage" />)
    );

    expect(getByTestId('mock-map-view')).toBeTruthy();
    expect(queryByText('Flyover')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(getByText('Flyover')).toBeTruthy();
  });

  it('does not display Flyover pill when allowFlyover is false', () => {
    const { queryByText } = render(
      wrap(
        <MiniMapComponent
          stream={sampleStream}
          title="Mountain Stage"
          allowFlyover={false}
        />
      )
    );

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(queryByText('Flyover')).toBeNull();
  });

  it('does not display Flyover pill when stream has no coordinates', () => {
    const { queryByText } = render(
      wrap(<MiniMapComponent stream={undefined} title="No Track" />)
    );

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(queryByText('Flyover')).toBeNull();
  });

  it('opens FlyoverModal when Flyover pill is pressed', () => {
    const { getByText } = render(
      wrap(<MiniMapComponent stream={sampleStream} title="Alpe d'Huez" />)
    );

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    const pill = getByText('Flyover');
    fireEvent.press(pill);

    expect(getByText("Alpe d'Huez")).toBeTruthy();
  });
});
