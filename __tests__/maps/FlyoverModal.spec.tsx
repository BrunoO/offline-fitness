import FlyoverModal from '@/features/maps/components/FlyoverModal';
import { ActivityStream } from '@/shared';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import * as MapsModule from 'react-native-maps';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

const mockAnimateCamera = (MapsModule as unknown as { __mockAnimateCamera: jest.Mock })
  .__mockAnimateCamera;
const mockFitToCoordinates = (MapsModule as unknown as { __mockFitToCoordinates: jest.Mock })
  .__mockFitToCoordinates;

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
  beforeEach(() => {
    mockAnimateCamera.mockClear();
    mockFitToCoordinates.mockClear();
  });

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

  it('renders clean empty state when stream has no GPS coordinates', () => {
    const { getByText } = render(
      wrap(
        <FlyoverModal
          visible={true}
          onClose={jest.fn()}
          stream={null}
          title="Indoor Rowing"
        />
      )
    );

    expect(getByText('No GPS Track Data')).toBeTruthy();
    expect(getByText('Indoor Rowing')).toBeTruthy();
  });

  it('triggers animateCamera on onMapReady instead of zooming out to whole route', () => {
    const { getByTestId, queryAllByTestId } = render(
      wrap(
        <FlyoverModal
          visible={true}
          onClose={jest.fn()}
          stream={sampleStream}
          title="Morning Run"
        />
      )
    );

    const mapView = getByTestId('mock-map-view');
    // Initially at progress 0, traveledCoordinates has length 1 so no polyline is rendered
    // (the total route polyline has been removed to avoid ghost traces)
    expect(queryAllByTestId('mock-polyline')).toHaveLength(0);

    mockAnimateCamera.mockClear();
    mapView.props.onMapReady();
    expect(mockAnimateCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { latitude: 45.0, longitude: 5.0 },
        pitch: 45,
        zoom: 16.5
      }),
      { duration: 500 }
    );
  });

  it('cycles through Follow, North-Up, and Overview camera modes', () => {
    const { getByText, getByLabelText } = render(
      wrap(
        <FlyoverModal
          visible={true}
          onClose={jest.fn()}
          stream={sampleStream}
          title="Morning Run"
        />
      )
    );

    // Default mode is Follow
    expect(getByText('Follow')).toBeTruthy();

    const cameraModeBtn = getByLabelText(/Camera mode:/);
    mockAnimateCamera.mockClear();
    fireEvent.press(cameraModeBtn);

    // Second mode is North-Up (heading locked to 0, pitch 35)
    expect(getByText('North-Up')).toBeTruthy();
    expect(mockAnimateCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: 0,
        pitch: 35
      }),
      { duration: 500 }
    );

    // Third mode is Overview (fits entire track, does not call animateCamera)
    mockAnimateCamera.mockClear();
    mockFitToCoordinates.mockClear();
    fireEvent.press(getByLabelText(/Camera mode:/));
    expect(getByText('Overview')).toBeTruthy();
    expect(mockFitToCoordinates).toHaveBeenCalledTimes(1);
    expect(mockAnimateCamera).not.toHaveBeenCalled();

    // Cycles back to Follow
    fireEvent.press(getByLabelText(/Camera mode:/));
    expect(getByText('Follow')).toBeTruthy();
  });

  it('resets progress to 0 when modal is closed after scrubbing', () => {
    const onClose = jest.fn();
    const { getByTestId, getByLabelText } = render(
      wrap(
        <FlyoverModal
          visible={true}
          onClose={onClose}
          stream={sampleStream}
          title="Morning Run"
        />
      )
    );

    const slider = getByTestId('mock-slider');
    fireEvent(slider, 'onValueChange', 0.5);
    expect(getByTestId('mock-slider').props.value).toBe(0.5);

    const closeBtn = getByLabelText('Close flyover');
    fireEvent.press(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getByTestId('mock-slider').props.value).toBe(0);
  });
});
