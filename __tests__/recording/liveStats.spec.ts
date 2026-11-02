import {
  computeDisplayDistance,
  tickLiveStats,
  updateMovingTime
} from '@/features/recording/services/liveStats';

describe('tickLiveStats', () => {
  it('increments elapsedSec when a previous sample exists', () => {
    const prev = {
      elapsedSec: 5,
      movingTimeSec: 0,
      distanceMeters: 10,
      currentSpeedMps: 1,
      altitudeM: 100,
      slopePercent: null,
      elevationGainM: 0,
      gpsLost: false,
      hAccM: 3
    };
    const next = tickLiveStats(prev, 1000);
    expect(next.elapsedSec).toBe(6);
    expect(next).not.toBe(prev);
    expect(next.distanceMeters).toBe(10);
  });

  it('derives elapsedSec from the wall clock when no previous sample exists', () => {
    const now = Date.now();
    const next = tickLiveStats(null, now - 2000);
    expect(next.elapsedSec).toBeGreaterThanOrEqual(1);
    expect(next.distanceMeters).toBe(0);
    expect(next.currentSpeedMps).toBeNull();
    expect(next.gpsLost).toBe(false);
  });

  it('clamps elapsedSec to 0 when started in the future', () => {
    const next = tickLiveStats(null, Date.now() + 10_000);
    expect(next.elapsedSec).toBe(0);
  });
});

describe('computeDisplayDistance', () => {
  it('returns 0 until the first move', () => {
    expect(computeDisplayDistance(false, true, 100, 50)).toBe(0);
    expect(computeDisplayDistance(false, false, 100, 50)).toBe(0);
  });

  it('returns the live distance while moving', () => {
    expect(computeDisplayDistance(true, true, 100, 50)).toBe(100);
  });

  it('returns the last known distance while stationary', () => {
    expect(computeDisplayDistance(true, false, 100, 50)).toBe(50);
  });
});

describe('updateMovingTime', () => {
  it('returns unchanged when there is no previous timestamp', () => {
    expect(updateMovingTime(null, 1000, true, 42)).toBe(42);
  });

  it('adds the delta when moving and within the 5s window', () => {
    expect(updateMovingTime(1000, 3000, true, 10)).toBe(12);
  });

  it('ignores deltas larger than 5s', () => {
    expect(updateMovingTime(1000, 7000, true, 10)).toBe(10);
  });

  it('ignores non-positive deltas', () => {
    expect(updateMovingTime(2000, 1000, true, 10)).toBe(10);
  });

  it('ignores deltas while not moving', () => {
    expect(updateMovingTime(1000, 3000, false, 10)).toBe(10);
  });
});
