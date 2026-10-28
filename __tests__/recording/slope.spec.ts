import {
  LiveSlopeCalculator,
  SLOPE_DEADBAND_BARO_M,
  SLOPE_DEADBAND_GPS_M,
  SLOPE_MIN_DISTANCE_M,
  SLOPE_WINDOW_METERS,
  SLOPE_WINDOW_MS
} from '@/features/recording/services/slope';

describe('LiveSlopeCalculator', () => {
  it('initializes with null slope', () => {
    const calc = new LiveSlopeCalculator('walking');
    expect(calc.getSlope()).toBeNull();
  });

  it('always returns 0 for swimming profile', () => {
    const calc = new LiveSlopeCalculator('swimming');
    const slope = calc.update(150, 10, 1000);
    expect(slope).toBe(0);
    expect(calc.getSlope()).toBe(0);

    const slope2 = calc.update(200, 30, 2000);
    expect(slope2).toBe(0);
  });

  it('preserves existing slope when elevation is null', () => {
    const calc = new LiveSlopeCalculator('cycling');
    calc.update(100, 0, 1000);
    // Significant climb: alt 120 at 30m -> smoothed = 105, deltaAlt = 5.0m
    const slope = calc.update(120, 30, 2000);
    expect(slope).not.toBeNull();

    const afterNull = calc.update(null, 35, 3000);
    expect(afterNull).toBe(slope);
  });

  it('does not calculate slope when movement is under min distance', () => {
    const calc = new LiveSlopeCalculator('running');
    calc.update(100, 0, 1000);
    const slope = calc.update(105, SLOPE_MIN_DISTANCE_M - 0.1, 2000);
    expect(slope).toBeNull();
  });

  it('calculates slope once distance delta reaches min distance with climb exceeding deadband', () => {
    const calc = new LiveSlopeCalculator('hiking');
    // First point: alt 100, dist 0, time 1000 -> smoothed = 100
    calc.update(100, 0, 1000);
    // Second point at 25m: alt 112 -> smoothed = 0.25*112 + 0.75*100 = 103 (+3m)
    // spanDist = 25m >= 10m, fittedDeltaAlt = 3.0m
    // GPS deadband = 1.0m -> effectiveDeltaAlt = 2.0m
    // effectiveDist = max(25, 22.5) = 25m -> slope = (2.0 / 25) * 100 = 8.0%
    const slope = calc.update(112, 25, 2000);
    expect(slope).toBeCloseTo(8.0, 1);
  });

  it('calculates negative slope for descents', () => {
    const calc = new LiveSlopeCalculator('cycling');
    calc.update(100, 0, 1000);
    // alt 88 at 25m -> smoothed = 0.25*88 + 0.75*100 = 97 (-3m)
    // effectiveDeltaAlt = -2.0m, effectiveDist = 25m -> slope = -8.0%
    const slope = calc.update(88, 25, 2000);
    expect(slope).toBeCloseTo(-8.0, 1);
  });

  it('suppresses slope on mostly flat ground around 210m +/- 2m over a 40m walk at 4.7 km/h', () => {
    // 40m walk at 4.7 km/h (1.3 m/s) with fixes every 2s (~2.6m per step).
    // Altitude wanders between 208m and 212m (+/- 2m around 210m) on flat ground.
    const calc = new LiveSlopeCalculator('walking');
    const stepM = 2.6;
    const elevations = [
      210.0, 211.5, 212.0, 210.8, 209.0, 208.2, 208.0, 209.5,
      211.0, 211.8, 210.5, 208.8, 208.1, 209.2, 210.6, 210.0
    ];

    for (let i = 0; i < elevations.length; i++) {
      const dist = i * stepM;
      const t = 1000 + i * 2000;
      const slope = calc.update(elevations[i], dist, t);
      if (dist >= SLOPE_MIN_DISTANCE_M) {
        expect(slope).not.toBeNull();
        // The slope must stay tightly contained around 0%, never swinging to -5% or +3%
        expect(Math.abs(slope!)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('ignores duplicate-distance updates when stationary', () => {
    const calc = new LiveSlopeCalculator('walking');
    calc.update(100, 0, 1000);
    calc.update(110, 20, 2000);
    const slopeBefore = calc.getSlope();
    expect(slopeBefore).not.toBeNull();

    // Fix with the exact same distance (GPS drift while stationary)
    const slopeAfter = calc.update(150, 20, 3000);
    expect(slopeAfter).toBe(slopeBefore);
    expect(calc.getSmoothedAltitude()).toBeCloseTo(102.5, 1);
  });

  it('fuses live barometer pressure when available and uses tighter deadband', () => {
    // Pressure at sea level ~1013.25 hPa -> baroAlt = 0
    // Pressure at 988.5 hPa -> baroAlt ~ 210m
    const calc = new LiveSlopeCalculator('hiking', true);
    // First fix calibrates baseline
    calc.update(210, 0, 1000, 988.5);
    // At 30m, elevation climbs to 213m via barometer
    // Barometer changes by +3m, tighter baro deadband = 0.4m applies
    calc.update(210, 30, 2000, 988.15);
    const slope = calc.getSlope();
    expect(slope).not.toBeNull();
    expect(slope!).toBeGreaterThan(0);
  });

  it('evicts samples older than max distance window while maintaining min distance span', () => {
    const calc = new LiveSlopeCalculator('cycling');
    calc.update(100, 0, 1000);
    calc.update(100, 15, 2000);
    calc.update(100, 30, 3000);
    // Move past SLOPE_WINDOW_METERS (45m)
    calc.update(105, 50, 4000);
    const slope = calc.getSlope();
    expect(slope).not.toBeNull();
  });

  it('resets state completely on reset()', () => {
    const calc = new LiveSlopeCalculator('running');
    calc.update(100, 0, 1000);
    calc.update(110, 25, 2000);
    expect(calc.getSlope()).not.toBeNull();

    calc.reset();
    expect(calc.getSlope()).toBeNull();
    expect(calc.getElevationGain()).toBe(0);
    expect(calc.getSmoothedAltitude()).toBeNull();
  });

  it('accumulates elevation gain with hysteresis and preserves it across onPause()', () => {
    const calc = new LiveSlopeCalculator('hiking', true); // barometer threshold = 1.5 m
    calc.update(100, 0, 1000);
    calc.update(110, 20, 2000); // smoothed = 102.5 (+2.5 m >= 1.5 m threshold)
    const gainBeforePause = calc.getElevationGain();
    expect(gainBeforePause).toBeCloseTo(2.5, 2);

    calc.onPause();
    expect(calc.getSlope()).toBeNull();
    expect(calc.getElevationGain()).toBeCloseTo(gainBeforePause, 2);

    // Resuming at a higher altitude (e.g. chairlift during pause) re-anchors without adding pause climb
    calc.update(500, 20, 60_000);
    expect(calc.getElevationGain()).toBeCloseTo(gainBeforePause, 2);
  });
});
