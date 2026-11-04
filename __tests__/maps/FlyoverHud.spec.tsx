import FlyoverHud from '@/features/maps/components/FlyoverHud';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { render } from '@testing-library/react-native';
import React from 'react';

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

describe('FlyoverHud', () => {
  it('renders correctly with given flight metrics', () => {
    const { getByText } = render(
      wrap(
        <FlyoverHud
          speedMps={10} // 36 km/h
          completedDistanceMeters={5000} // 5.0 km
          totalDistanceMeters={10000} // 10.0 km
          altitudeMeters={1820.4} // 1820 m
          elapsedSeconds={1200} // 20m 00s
          totalDurationSeconds={3600} // 1h 00m 00s
        />
      )
    );

    expect(getByText('36.0 km/h')).toBeTruthy();
    expect(getByText('5.0 / 10.0 km')).toBeTruthy();
    expect(getByText('1820 m')).toBeTruthy();
    expect(getByText('Time')).toBeTruthy();
    expect(getByText('Speed')).toBeTruthy();
    expect(getByText('Distance')).toBeTruthy();
    expect(getByText('Elevation')).toBeTruthy();
  });

  it('renders Pace (min/km) instead of Speed (km/h) for pace sports', () => {
    const { getByText, queryByText } = render(
      wrap(
        <FlyoverHud
          speedMps={1000 / 300} // 3.333 m/s => 5:00 /km
          completedDistanceMeters={2000}
          totalDistanceMeters={5000}
          altitudeMeters={120}
          elapsedSeconds={600}
          totalDurationSeconds={1500}
          activityType="Run"
        />
      )
    );

    expect(getByText('Pace')).toBeTruthy();
    expect(getByText('5:00 /km')).toBeTruthy();
    expect(queryByText('Speed')).toBeNull();
  });
});
