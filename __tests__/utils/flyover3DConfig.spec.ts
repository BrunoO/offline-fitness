import {
  NEXT_3D_CAMERA_PRESET,
  resolve3DCameraParams,
  resolveSport3DProfile
} from '@/utils/flyover3DConfig';

describe('flyover3DConfig', () => {
  it('uses closer range and slower speed for foot sports', () => {
    const hike = resolveSport3DProfile('Hike', 8_000);
    const run = resolveSport3DProfile('Trail Run', 12_000);

    expect(hike).toEqual({ baseRangeMeters: 500, baseSpeedMps: 50 });
    expect(run).toEqual({ baseRangeMeters: 500, baseSpeedMps: 50 });
  });

  it('uses wider range and faster speed for cycling and ski sports', () => {
    const ride = resolveSport3DProfile('Ride', 15_000);
    const ski = resolveSport3DProfile('AlpineSki', 18_000);

    expect(ride).toEqual({ baseRangeMeters: 850, baseSpeedMps: 110 });
    expect(ski).toEqual({ baseRangeMeters: 850, baseSpeedMps: 110 });
  });

  it('scales base speed up gently for long endurance activities', () => {
    const shortRide = resolveSport3DProfile('Ride', 15_000);
    const longRide = resolveSport3DProfile('Ride', 100_000);

    expect(longRide.baseSpeedMps).toBeGreaterThan(shortRide.baseSpeedMps);
    expect(longRide.baseSpeedMps).toBeLessThanOrEqual(260);
  });

  it('combines sport profile with camera presets and cycles presets cleanly', () => {
    const profile = resolveSport3DProfile('Ride', 10_000);
    const drone = resolve3DCameraParams(profile, 'drone');
    const heli = resolve3DCameraParams(profile, 'helicopter');
    const chase = resolve3DCameraParams(profile, 'chase');

    expect(drone).toEqual({ tilt: 65, range: 850, label: 'Drone' });
    expect(heli.tilt).toBe(45);
    expect(heli.range).toBeGreaterThan(drone.range);
    expect(chase.tilt).toBe(72);
    expect(chase.range).toBeLessThan(drone.range);

    expect(NEXT_3D_CAMERA_PRESET.drone).toBe('helicopter');
    expect(NEXT_3D_CAMERA_PRESET.helicopter).toBe('chase');
    expect(NEXT_3D_CAMERA_PRESET.chase).toBe('drone');
  });
});
