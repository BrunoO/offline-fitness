import {
  computeTrackDistanceMeters,
  GpsPoint,
  haversineDistanceMeters,
  simplifyGpsTrack
} from '@/utils/gpsSmoothing';

describe('gpsSmoothing', () => {
  it('returns input unchanged when track has fewer than 3 points', () => {
    const empty: GpsPoint[] = [];
    const single: GpsPoint[] = [{ latitude: 45.1, longitude: 6.4, altitude: 2000 }];
    const pair: GpsPoint[] = [
      { latitude: 45.1, longitude: 6.4, altitude: 2000 },
      { latitude: 45.11, longitude: 6.41, altitude: 2100 }
    ];

    expect(simplifyGpsTrack(empty, 10)).toEqual([]);
    expect(simplifyGpsTrack(single, 10)).toEqual(single);
    expect(simplifyGpsTrack(pair, 10)).toEqual(pair);
  });

  it('removes collinear intermediate points while preserving endpoints and altitude', () => {
    const straightLine: GpsPoint[] = [
      { latitude: 45.0, longitude: 6.0, altitude: 1000 },
      { latitude: 45.001, longitude: 6.0, altitude: 1020 },
      { latitude: 45.002, longitude: 6.0, altitude: 1040 },
      { latitude: 45.003, longitude: 6.0, altitude: 1060 }
    ];

    const simplified = simplifyGpsTrack(straightLine, 5);
    expect(simplified).toHaveLength(2);
    expect(simplified[0]).toEqual(straightLine[0]);
    expect(simplified[1]).toEqual(straightLine[3]);
  });

  it('retains sharp corner vertices exceeding toleranceMeters', () => {
    const lShape: GpsPoint[] = [
      { latitude: 45.0, longitude: 6.0, altitude: 1500 },
      { latitude: 45.005, longitude: 6.0, altitude: 1600 },
      { latitude: 45.005, longitude: 6.005, altitude: 1700 }
    ];

    const simplified = simplifyGpsTrack(lShape, 10);
    expect(simplified).toHaveLength(3);
    expect(simplified[1]).toEqual(lShape[1]);
  });

  it('computes realistic Haversine distance and cumulative track distance', () => {
    const a: GpsPoint = { latitude: 45.0, longitude: 6.0 };
    const b: GpsPoint = { latitude: 45.001, longitude: 6.0 };
    const segmentMeters = haversineDistanceMeters(a, b);

    expect(segmentMeters).toBeGreaterThan(105);
    expect(segmentMeters).toBeLessThan(115);

    const total = computeTrackDistanceMeters([a, b, { latitude: 45.002, longitude: 6.0 }]);
    expect(total).toBeGreaterThan(210);
    expect(total).toBeLessThan(230);
  });
});
