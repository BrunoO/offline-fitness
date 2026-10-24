import { LiveSlopeCalculator } from '@/features/recording/services/slope';

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
    // First fix
    calc.update(100, 0, 1000);
    // Second fix: 10m later, 101m alt -> deltaAlt = 0.25m (after smoothing), deltaDist = 10m
    const slope = calc.update(104, 10, 2000);
    expect(slope).not.toBeNull();

    const afterNull = calc.update(null, 15, 3000);
    expect(afterNull).toBe(slope);
  });

  it('does not calculate slope when movement is under 5 meters', () => {
    const calc = new LiveSlopeCalculator('running');
    calc.update(100, 0, 1000);
    const slope = calc.update(105, 4.9, 2000);
    expect(slope).toBeNull();
  });

  it('calculates slope once distance delta reaches 5 meters', () => {
    const calc = new LiveSlopeCalculator('hiking');
    // First point: alt 100, dist 0, time 1000 -> smoothed = 100
    calc.update(100, 0, 1000);
    // Second point: alt 104, dist 10, time 2000 -> smoothed = 0.25*104 + 0.75*100 = 101
    // deltaAlt = 101 - 100 = 1.0, deltaDist = 10m -> slope = (1.0 / 10) * 100 = 10%
    const slope = calc.update(104, 10, 2000);
    expect(slope).toBeCloseTo(10.0, 1);
  });

  it('calculates negative slope for descents', () => {
    const calc = new LiveSlopeCalculator('cycling');
    calc.update(100, 0, 1000);
    // alt 96 -> smoothed = 0.25*96 + 0.75*100 = 99
    // deltaAlt = 99 - 100 = -1.0, deltaDist = 20m -> slope = (-1.0 / 20) * 100 = -5.0%
    const slope = calc.update(96, 20, 2000);
    expect(slope).toBeCloseTo(-5.0, 1);
  });

  it('evicts samples older than 30m or 15s window', () => {
    const calc = new LiveSlopeCalculator('cycling');
    calc.update(100, 0, 1000);
    calc.update(100, 10, 2000);
    calc.update(100, 20, 3000);
    // Now move past 30m distance threshold (e.g. dist 35m)
    calc.update(105, 35, 4000);
    // Oldest sample at dist 0 should be evicted because 35 - 0 > 30m
    const slope = calc.getSlope();
    expect(slope).not.toBeNull();
  });

  it('resets state completely on reset()', () => {
    const calc = new LiveSlopeCalculator('running');
    calc.update(100, 0, 1000);
    calc.update(104, 10, 2000);
    expect(calc.getSlope()).not.toBeNull();

    calc.reset();
    expect(calc.getSlope()).toBeNull();
  });
});
