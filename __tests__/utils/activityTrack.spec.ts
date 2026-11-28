import { activityToFlyoverCoordinates } from '@/utils/activityTrack';
import type { StreamSet } from '@/features/activities/types/stravaActivityStream.model';

describe('activityToFlyoverCoordinates', () => {
  it('returns an empty array when the stream is null', () => {
    expect(activityToFlyoverCoordinates(null)).toEqual([]);
  });

  it('returns an empty array when latlng is missing', () => {
    const stream = { latlng: undefined } as unknown as StreamSet;
    expect(activityToFlyoverCoordinates(stream)).toEqual([]);
  });

  it('returns an empty array when latlng data is empty', () => {
    const stream = { latlng: { data: [], series_type: 'latlng', original_size: 0, resolution: 'high' } } as unknown as StreamSet;
    expect(activityToFlyoverCoordinates(stream)).toEqual([]);
  });

  it('converts latlng points with missing altitude to 0', () => {
    const stream = {
      latlng: { data: [[45.0, 6.0], [45.1, 6.1]], series_type: 'latlng', original_size: 2, resolution: 'high' },
      altitude: undefined
    } as unknown as StreamSet;
    expect(activityToFlyoverCoordinates(stream)).toEqual([
      { latitude: 45.0, longitude: 6.0, altitude: 0 },
      { latitude: 45.1, longitude: 6.1, altitude: 0 }
    ]);
  });

  it('pads trailing points with 0 when altitude is shorter than latlng', () => {
    const stream = {
      latlng: { data: [[45.0, 6.0], [45.1, 6.1], [45.2, 6.2]], series_type: 'latlng', original_size: 3, resolution: 'high' },
      altitude: { data: [1000], series_type: 'altitude', original_size: 1, resolution: 'high' }
    } as unknown as StreamSet;
    expect(activityToFlyoverCoordinates(stream)).toEqual([
      { latitude: 45.0, longitude: 6.0, altitude: 1000 },
      { latitude: 45.1, longitude: 6.1, altitude: 0 },
      { latitude: 45.2, longitude: 6.2, altitude: 0 }
    ]);
  });

  it('truncates altitude when it is longer than latlng', () => {
    const stream = {
      latlng: { data: [[45.0, 6.0]], series_type: 'latlng', original_size: 1, resolution: 'high' },
      altitude: { data: [1000, 1100, 1200], series_type: 'altitude', original_size: 3, resolution: 'high' }
    } as unknown as StreamSet;
    expect(activityToFlyoverCoordinates(stream)).toEqual([
      { latitude: 45.0, longitude: 6.0, altitude: 1000 }
    ]);
  });

  it('drops points with non-finite lat/lon', () => {
    const stream = {
      latlng: { data: [[45.0, 6.0], [NaN, 6.1], [45.2, Infinity]], series_type: 'latlng', original_size: 3, resolution: 'high' },
      altitude: { data: [1000, 1100, 1200], series_type: 'altitude', original_size: 3, resolution: 'high' }
    } as unknown as StreamSet;
    expect(activityToFlyoverCoordinates(stream)).toEqual([
      { latitude: 45.0, longitude: 6.0, altitude: 1000 }
    ]);
  });

  it('treats non-finite altitude as 0', () => {
    const stream = {
      latlng: { data: [[45.0, 6.0]], series_type: 'latlng', original_size: 1, resolution: 'high' },
      altitude: { data: [NaN], series_type: 'altitude', original_size: 1, resolution: 'high' }
    } as unknown as StreamSet;
    expect(activityToFlyoverCoordinates(stream)).toEqual([
      { latitude: 45.0, longitude: 6.0, altitude: 0 }
    ]);
  });
});
