import { HomeActivityMapSection } from '@/features/home/components/HomeActivityMapSection';
import { createStyles } from '@/features/home/screens/HomeScreen.styles';
import { ActivityStream } from '@/shared';
import { resolveThemeById } from '@/theme';
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('@/features/maps/components/MiniMapComponent', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function MockMiniMapComponent(props: any) {
    return (
      <View testID="mock-mini-map">
        <Text>{props.title ?? 'MiniMap'}</Text>
      </View>
    );
  };
});

const theme = resolveThemeById('charcoal', 'dark');
const styles = createStyles(theme);

const sampleStream: ActivityStream = {
  coordinates: [
    { latitude: 45.0, longitude: 5.0 },
    { latitude: 45.001, longitude: 5.001 }
  ],
  altitude: [100, 110],
  time: [0, 10]
};

describe('HomeActivityMapSection', () => {
  it('renders Activity Map section when GPS track exists', () => {
    const { getByText, getByTestId } = render(
      <HomeActivityMapSection
        stream={sampleStream}
        isLoading={false}
        mapRefreshKey={1}
        activityTitle="Morning Run"
        styles={styles}
      />
    );

    expect(getByText('Activity Map')).toBeTruthy();
    expect(getByTestId('mock-mini-map')).toBeTruthy();
    expect(getByText('Morning Run')).toBeTruthy();
  });

  it('does not display Flyover button when stream has no coordinates', () => {
    const { getByText, queryByTestId } = render(
      <HomeActivityMapSection
        stream={undefined}
        isLoading={false}
        mapRefreshKey={1}
        activityTitle="Gym Session"
        styles={styles}
      />
    );

    expect(getByText('Activity Map')).toBeTruthy();
    expect(queryByTestId('mock-mini-map')).toBeNull();
    expect(getByText('No map data available')).toBeTruthy();
  });

  it('displays loading indicator when isLoading is true', () => {
    const { getByText, queryByTestId } = render(
      <HomeActivityMapSection
        stream={sampleStream}
        isLoading={true}
        mapRefreshKey={1}
        activityTitle="Morning Run"
        styles={styles}
      />
    );

    expect(getByText('Loading map...')).toBeTruthy();
    expect(queryByTestId('mock-mini-map')).toBeNull();
  });
});
