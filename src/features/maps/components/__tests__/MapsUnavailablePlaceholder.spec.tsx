import MapsUnavailablePlaceholder from '../MapsUnavailablePlaceholder';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 }
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>
    <ThemeProvider>{ui}</ThemeProvider>
  </SafeAreaProvider>
);

describe('MapsUnavailablePlaceholder', () => {
  it('renders the unavailable message instead of a map', () => {
    const { getByText, queryByTestId } = render(wrap(<MapsUnavailablePlaceholder />));

    expect(getByText('Maps unavailable')).toBeTruthy();
    expect(getByText(/EXPO_PUBLIC_GOOGLE_MAPS_API_KEY/)).toBeTruthy();
    // No map view at all.
    expect(queryByTestId('mock-map-view')).toBeNull();
  });
});
