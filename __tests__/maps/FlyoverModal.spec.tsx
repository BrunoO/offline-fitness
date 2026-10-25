import FlyoverModal from '@/features/maps/components/FlyoverModal';
import { ActivityStream } from '@/shared';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockSlider(props: any) {
    return <View testID="mock-slider" {...props} />;
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMapView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn()
    }));
    return (
      <View testID="mock-map-view" {...props}>
        {props.children}
      </View>
    );
  });
  MockMapView.displayName = 'MockMapView';
  return {
    __esModule: true,
    default: MockMapView,
    MapView: MockMapView,
    Marker: (props: any) => (
      <View testID="mock-marker" {...props}>
        {props.children}
      </View>
    ),
    Polyline: (props: any) => <View testID="mock-polyline" {...props} />,
    PROVIDER_GOOGLE: 'google'
  };
});

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

const sampleStream: ActivityStream = {
  coordinates: [
    { latitude: 45.0, longitude: 5.0 },
    { latitude: 45.001, longitude: 5.001 },
    { latitude: 45.002, longitude: 5.002 }
  ],
  altitude: [100, 150, 200],
  time: [0, 10, 20]
};

describe('FlyoverModal', () => {
  it('renders modal content with custom title when visible', () => {
    const { getByText, getByTestId } = render(
      wrap(
        <FlyoverModal
          visible={true}
          onClose={jest.fn()}
          stream={sampleStream}
          title="Morning Ride"
        />
      )
    );

    expect(getByText('Morning Ride')).toBeTruthy();
    expect(getByTestId('mock-map-view')).toBeTruthy();
  });

  it('calls onClose when close button is pressed', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      wrap(
        <FlyoverModal
          visible={true}
          onClose={onClose}
          stream={sampleStream}
          title="Col du Tourmalet"
        />
      )
    );

    const closeBtn = getByLabelText('Close flyover');
    fireEvent.press(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cycles through map types when map type button is pressed', () => {
    const { getByText, getByLabelText } = render(
      wrap(
        <FlyoverModal
          visible={true}
          onClose={jest.fn()}
          stream={sampleStream}
        />
      )
    );

    // Initial is hybrid
    expect(getByText('hybrid')).toBeTruthy();

    const mapTypeBtn = getByLabelText(/Map type:/);
    fireEvent.press(mapTypeBtn);
    expect(getByText('satellite')).toBeTruthy();

    fireEvent.press(mapTypeBtn);
    expect(getByText('terrain')).toBeTruthy();

    fireEvent.press(mapTypeBtn);
    expect(getByText('standard')).toBeTruthy();

    fireEvent.press(mapTypeBtn);
    expect(getByText('hybrid')).toBeTruthy();
  });
});
