import { parseGpx, toStreamSet } from '@/features/strava-import/services/gpxParser';
import {
  buildFlyoverTrack,
  calculateBearing,
  circularMean,
  getFlyoverPointAtProgress,
  getFlyoverPointAtTime,
  haversineDistance,
  interpolateAngle,
  interpolateFlyoverPoint,
  resampleTrackByDistance,
  shortestAngularDifference
} from '@/features/maps';
import { FlyoverPoint } from '@/features/maps/types/flyover.types';
import { ActivityStream, LatLng } from '@/shared';

const SAMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <trk>
  <name>Col du Galibier</name>
  <type>cycling</type>
  <trkseg>
   <trkpt lat="45.0500" lon="6.4000"><ele>1800.0</ele><time>2023-07-14T09:00:00Z</time></trkpt>
   <trkpt lat="45.0505" lon="6.4005"><ele>1820.0</ele><time>2023-07-14T09:00:10Z</time></trkpt>
   <trkpt lat="45.0510" lon="6.4010"><ele>1845.0</ele><time>2023-07-14T09:00:20Z</time></trkpt>
   <trkpt lat="45.0515" lon="6.4015"><ele>1870.0</ele><time>2023-07-14T09:00:30Z</time></trkpt>
  </trkseg>
 </trk>
</gpx>`;

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    const p = { latitude: 45.0, longitude: 5.0 };
    expect(haversineDistance(p, p)).toBe(0);
  });

  it('calculates expected distance along a meridian', () => {
    // 1 degree of latitude is roughly 111.195 km
    const p1 = { latitude: 45.0, longitude: 5.0 };
    const p2 = { latitude: 46.0, longitude: 5.0 };
    const distanceMeters = haversineDistance(p1, p2);
    expect(distanceMeters).toBeGreaterThan(111_000);
    expect(distanceMeters).toBeLessThan(112_000);
  });
});

describe('calculateBearing', () => {
  it('computes 0 degrees for due North', () => {
    const p1 = { latitude: 45.0, longitude: 5.0 };
    const p2 = { latitude: 46.0, longitude: 5.0 };
    expect(calculateBearing(p1, p2)).toBeCloseTo(0, 1);
  });

  it('computes 90 degrees for due East on the equator', () => {
    const p1 = { latitude: 0.0, longitude: 0.0 };
    const p2 = { latitude: 0.0, longitude: 1.0 };
    expect(calculateBearing(p1, p2)).toBeCloseTo(90, 1);
  });

  it('computes 180 degrees for due South', () => {
    const p1 = { latitude: 46.0, longitude: 5.0 };
    const p2 = { latitude: 45.0, longitude: 5.0 };
    expect(calculateBearing(p1, p2)).toBeCloseTo(180, 1);
  });

  it('computes 270 degrees for due West on the equator', () => {
    const p1 = { latitude: 0.0, longitude: 1.0 };
    const p2 = { latitude: 0.0, longitude: 0.0 };
    expect(calculateBearing(p1, p2)).toBeCloseTo(270, 1);
  });
});

describe('shortestAngularDifference', () => {
  it('calculates straightforward positive difference', () => {
    expect(shortestAngularDifference(10, 50)).toBe(40);
  });

  it('calculates straightforward negative difference', () => {
    expect(shortestAngularDifference(50, 10)).toBe(-40);
  });

  it('handles clockwise wrap around 0 / 360', () => {
    expect(shortestAngularDifference(350, 10)).toBe(20);
  });

  it('handles counter-clockwise wrap around 0 / 360', () => {
    expect(shortestAngularDifference(10, 350)).toBe(-20);
  });
});

describe('interpolateAngle', () => {
  it('correctly crosses the North boundary without full rotation', () => {
    // Halfway between 350 and 10 is 0 (due North)
    const mid = interpolateAngle(350, 10, 0.5);
    expect(mid).toBeCloseTo(0, 1);
  });

  it('interpolates counter-clockwise wrap', () => {
    const mid = interpolateAngle(10, 350, 0.5);
    expect(mid).toBeCloseTo(0, 1);
  });

  it('clamps ratio below 0 to start angle and above 1 to end angle', () => {
    expect(interpolateAngle(40, 80, -0.5)).toBe(40);
    expect(interpolateAngle(40, 80, 1.5)).toBe(80);
  });
});

describe('circularMean', () => {
  it('returns 0 for empty array', () => {
    expect(circularMean([])).toBe(0);
  });

  it('returns the same angle for a single element', () => {
    expect(circularMean([120])).toBeCloseTo(120, 1);
  });

  it('averages angles spanning North meridian correctly', () => {
    expect(circularMean([350, 10])).toBeCloseTo(0, 1);
    expect(circularMean([355, 0, 5])).toBeCloseTo(0, 1);
  });

  it('averages standard angles correctly', () => {
    expect(circularMean([80, 100])).toBeCloseTo(90, 1);
  });

  it('falls back to first angle when vectors completely cancel out', () => {
    expect(circularMean([0, 180])).toBe(0);
  });
});

describe('interpolateFlyoverPoint', () => {
  const p1: FlyoverPoint = {
    latitude: 45.0,
    longitude: 5.0,
    altitude: 1000,
    time: 0,
    distance: 0,
    speed: 5.0,
    bearing: 350,
    smoothBearing: 350,
    pitch: 60
  };

  const p2: FlyoverPoint = {
    latitude: 45.1,
    longitude: 5.1,
    altitude: 1200,
    time: 60,
    distance: 1000,
    speed: 15.0,
    bearing: 10,
    smoothBearing: 10,
    pitch: 50
  };

  it('interpolates midway at ratio 0.5', () => {
    const mid = interpolateFlyoverPoint(p1, p2, 0.5);
    expect(mid.latitude).toBeCloseTo(45.05, 4);
    expect(mid.longitude).toBeCloseTo(5.05, 4);
    expect(mid.altitude).toBe(1100);
    expect(mid.time).toBe(30);
    expect(mid.distance).toBe(500);
    expect(mid.speed).toBe(10);
    expect(mid.bearing).toBeCloseTo(0, 1);
    expect(mid.smoothBearing).toBeCloseTo(0, 1);
    expect(mid.pitch).toBe(55);
  });

  it('clamps ratio at boundaries', () => {
    const atStart = interpolateFlyoverPoint(p1, p2, -0.2);
    expect(atStart.distance).toBe(0);

    const atEnd = interpolateFlyoverPoint(p1, p2, 1.2);
    expect(atEnd.distance).toBe(1000);
  });
});

describe('buildFlyoverTrack', () => {
  it('returns empty track when stream is null or has no coordinates', () => {
    expect(buildFlyoverTrack(null).points).toHaveLength(0);
    expect(buildFlyoverTrack({ coordinates: [], altitude: [], time: [] }).points).toHaveLength(0);
  });

  it('returns single point track when only 1 coordinate is supplied', () => {
    const stream: ActivityStream = {
      coordinates: [{ latitude: 45.0, longitude: 5.0 }],
      altitude: [500],
      time: [0]
    };
    const track = buildFlyoverTrack(stream);
    expect(track.points).toHaveLength(1);
    expect(track.totalDistance).toBe(0);
    expect(track.minAltitude).toBe(500);
    expect(track.maxAltitude).toBe(500);
  });

  it('processes realistic stream and computes distance and duration', () => {
    const stream: ActivityStream = {
      coordinates: [
        { latitude: 45.0, longitude: 5.0 },
        { latitude: 45.001, longitude: 5.001 },
        { latitude: 45.002, longitude: 5.002 }
      ],
      altitude: [300, 310, 325],
      time: [0, 10, 20]
    };
    const track = buildFlyoverTrack(stream);

    expect(track.points).toHaveLength(3);
    expect(track.totalDistance).toBeGreaterThan(0);
    expect(track.totalDuration).toBe(20);
    expect(track.minAltitude).toBe(300);
    expect(track.maxAltitude).toBe(325);
    expect(track.maxSpeed).toBeGreaterThan(0);
    expect(track.points[0].distance).toBe(0);
    expect(track.points[2].distance).toBe(track.totalDistance);
  });

  it('preserves prior bearing when stationary or movement is below threshold', () => {
    const coords: LatLng[] = [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.001, longitude: 5.0 }, // moves North
      { latitude: 45.0010001, longitude: 5.0 } // barely moved (< 1.5m)
    ];
    const stream: ActivityStream = {
      coordinates: coords,
      altitude: [100, 100, 100],
      time: [0, 5, 10]
    };
    const track = buildFlyoverTrack(stream, { minMovementMeters: 1.5 });
    expect(track.points[2].bearing).toBeCloseTo(track.points[1].bearing, 1);
  });

  it('smooths noisy heading oscillations using circular window', () => {
    // Zig-zag heading oscillating around North (bearing alternating between 340 and 20)
    const coords: LatLng[] = [
      { latitude: 45.000, longitude: 5.000 },
      { latitude: 45.001, longitude: 4.999 }, // ~340 deg
      { latitude: 45.002, longitude: 5.001 }, // ~20 deg
      { latitude: 45.003, longitude: 4.999 }, // ~340 deg
      { latitude: 45.004, longitude: 5.001 }  // ~20 deg
    ];
    const stream: ActivityStream = {
      coordinates: coords,
      altitude: [100, 100, 100, 100, 100],
      time: [0, 5, 10, 15, 20]
    };
    const track = buildFlyoverTrack(stream, { smoothingWindow: 5 });

    // The middle point smoothBearing should be close to 0 (North) despite individual oscillations
    const middleSmooth = track.points[2].smoothBearing;
    expect(Math.min(middleSmooth, 360 - middleSmooth)).toBeLessThan(15);
  });

  it('handles missing altitude and time gracefully', () => {
    const stream: ActivityStream = {
      coordinates: [
        { latitude: 45.0, longitude: 5.0 },
        { latitude: 45.001, longitude: 5.001 }
      ],
      altitude: [],
      time: []
    };
    const track = buildFlyoverTrack(stream);
    expect(track.points[0].altitude).toBe(0);
    expect(track.points[1].time).toBeGreaterThan(0);
    expect(track.totalDistance).toBeGreaterThan(0);
  });

  it('builds a track successfully from a parsed Strava GPX fixture', () => {
    const parsed = parseGpx(SAMPLE_GPX);
    const converted = toStreamSet(parsed.points);
    expect(converted).toBeDefined();

    const stream: ActivityStream = {
      coordinates: converted!.stream.latlng.data.map(([latitude, longitude]) => ({
        latitude,
        longitude
      })),
      altitude: converted!.stream.altitude.data,
      time: converted!.stream.time.data
    };
    const track = buildFlyoverTrack(stream);

    expect(track.points).toHaveLength(4);
    expect(track.minAltitude).toBe(1800);
    expect(track.maxAltitude).toBe(1870);
    expect(track.totalDuration).toBe(30);
    expect(track.totalDistance).toBeGreaterThan(200);
  });
});

describe('getFlyoverPointAtProgress', () => {
  const stream: ActivityStream = {
    coordinates: [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.002, longitude: 5.0 }
    ],
    altitude: [100, 200],
    time: [0, 20]
  };
  const track = buildFlyoverTrack(stream);

  it('returns null on empty track', () => {
    expect(getFlyoverPointAtProgress({ points: [] } as any, 0.5)).toBeNull();
  });

  it('returns start point on progress <= 0', () => {
    const pt = getFlyoverPointAtProgress(track, -0.1);
    expect(pt?.distance).toBe(0);
    expect(pt?.altitude).toBe(100);
  });

  it('returns end point on progress >= 1', () => {
    const pt = getFlyoverPointAtProgress(track, 1.2);
    expect(pt?.distance).toBeCloseTo(track.totalDistance, 1);
    expect(pt?.altitude).toBe(200);
  });

  it('interpolates precisely at progress 0.5', () => {
    const pt = getFlyoverPointAtProgress(track, 0.5);
    expect(pt?.altitude).toBeCloseTo(150, 1);
    expect(pt?.time).toBeCloseTo(10, 1);
    expect(pt?.distance).toBeCloseTo(track.totalDistance / 2, 1);
  });
});

describe('getFlyoverPointAtTime', () => {
  const stream: ActivityStream = {
    coordinates: [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.002, longitude: 5.0 }
    ],
    altitude: [100, 200],
    time: [0, 40]
  };
  const track = buildFlyoverTrack(stream);

  it('returns start point when requested time is before or at start', () => {
    const pt = getFlyoverPointAtTime(track, -5);
    expect(pt?.time).toBe(0);
    expect(pt?.altitude).toBe(100);
  });

  it('returns end point when requested time is beyond end', () => {
    const pt = getFlyoverPointAtTime(track, 100);
    expect(pt?.time).toBe(40);
    expect(pt?.altitude).toBe(200);
  });

  it('interpolates midway at time 20s', () => {
    const pt = getFlyoverPointAtTime(track, 20);
    expect(pt?.altitude).toBeCloseTo(150, 1);
    expect(pt?.distance).toBeCloseTo(track.totalDistance / 2, 1);
  });
});

describe('resampleTrackByDistance', () => {
  const stream: ActivityStream = {
    coordinates: [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.01, longitude: 5.0 } // ~1110 meters
    ],
    altitude: [100, 200],
    time: [0, 100]
  };
  const track = buildFlyoverTrack(stream);

  it('returns original points if track distance is smaller than interval', () => {
    const resampled = resampleTrackByDistance(track, 5000);
    expect(resampled).toHaveLength(track.points.length);
  });

  it('resamples track into consistent distance increments', () => {
    const intervalMeters = 200;
    const resampled = resampleTrackByDistance(track, intervalMeters);

    expect(resampled.length).toBeGreaterThan(4);
    expect(resampled[0].distance).toBe(0);
    expect(resampled.at(-1)!.distance).toBeCloseTo(track.totalDistance, 1);

    // Verify distance steps
    for (let i = 1; i < resampled.length - 1; i++) {
      expect(resampled[i].distance).toBeCloseTo(i * intervalMeters, 1);
    }
  });
});
