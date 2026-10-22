import { replaySession } from '@/features/recording/services/replaySession';
import type { FixLogEntry, RecordingMeta } from '@/features/recording/services/gpsTracker';

function makeMeta(overrides: Partial<RecordingMeta> = {}): RecordingMeta {
  return {
    sessionId: 's-test-1',
    profile: 'walking',
    startedAtUtcMs: 1_000_000,
    deviceUtcOffsetSeconds: 7200,
    capture: {
      intervalMs: 1000,
      minDistanceM: 2.5,
      accuracyCeilingM: 15,
      useBarometer: true
    },
    pauses: [],
    fixCount: 0,
    logUri: 'file:///tmp/fixes.jsonl',
    libraryVersion: '0.1.0',
    ...overrides
  };
}

function fix(overrides: Partial<FixLogEntry> = {}): FixLogEntry {
  return {
    t: 1_000_000,
    lat: 45.0,
    lon: 6.0,
    ele: 100,
    geoid: null,
    pressure: null,
    hAcc: 5,
    vAcc: 5,
    speed: 1.5,
    bearing: null,
    source: 'fused',
    accepted: true,
    ...overrides
  };
}

describe('replaySession', () => {
  it('produces a stream with rounded coordinates and monotonic time', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.1234567, lon: 6.6543219, ele: 100.04 }),
      fix({ t: 1_002_000, lat: 45.1235, lon: 6.6544, ele: 100.06 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(2);
    expect(result.stream.latlng?.data[0]).toEqual([45.123457, 6.654322]);
    expect(result.stream.altitude?.data[0]).toBe(100);
    expect(result.stream.time?.data).toEqual([0, 2]);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects a fix whose accuracy exceeds the ceiling', () => {
    const fixes = [fix({ t: 1_000_000, hAcc: 5 }), fix({ t: 1_003_000, hAcc: 30 })];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('accuracy');
  });

  it('rejects a fix that is too close to the previous one', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0 }),
      fix({ t: 1_003_000, lat: 45.000001, lon: 6.000001 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(1);
    expect(result.rejected.some(r => r.reason === 'min-distance')).toBe(true);
  });

  it('rejects an unrealistic speed jump', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0 }),
      fix({ t: 1_005_000, lat: 45.1, lon: 6.1 }) // ~15 km in 5 s
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(1);
    expect(result.rejected.some(r => r.reason === 'speed-jump')).toBe(true);
  });

  it('rejects a stale timestamp', () => {
    const fixes = [fix({ t: 1_000_000 }), fix({ t: 999_000 })];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(1);
    expect(result.rejected.some(r => r.reason === 'stale-timestamp')).toBe(true);
  });

  it('rejects an interval that is too short', () => {
    const fixes = [
      fix({ t: 1_000_000 }),
      fix({ t: 1_000_500 }) // 500 ms < 2000 ms min interval for walking
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(1);
    expect(result.rejected.some(r => r.reason === 'interval-too-short')).toBe(true);
  });

  it('suppresses stationary drift', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, speed: 1.5, hAcc: 8 }),
      fix({ t: 1_003_000, lat: 45.00004, lon: 6.00004, speed: 0.1, hAcc: 8 })
    ];
    const result = replaySession(makeMeta(), fixes);
    // The second fix moves ~5 m but is below the stationary threshold and
    // inside the accuracy bubble, so it is suppressed.
    expect(result.stream.latlng?.data).toHaveLength(1);
    expect(result.rejected.some(r => r.reason === 'stationary-drift')).toBe(true);
  });

  it('subtracts manual pause time exactly once', () => {
    const fixes = [
      fix({ t: 1_000_000 }),
      fix({ t: 1_002_000 }),
      fix({ t: 1_004_000 }),
      fix({ t: 1_006_000 })
    ];
    const meta = makeMeta({
      startedAtUtcMs: 1_000_000,
      endedAtUtcMs: 1_006_000,
      pauses: [{ startUtcMs: 1_002_000, endUtcMs: 1_004_000 }]
    });
    const result = replaySession(meta, fixes);
    // elapsed = 6 s, manual pause = 2 s, no auto-pause -> moving = 4 s
    expect(result.stats.elapsedTimeSec).toBe(6);
    expect(result.stats.movingTimeSec).toBe(4);
  });

  it('does not double-count a manual pause as an auto-pause gap', () => {
    const fixes = [
      fix({ t: 1_000_000, speed: 1.5 }),
      fix({ t: 1_002_000, speed: 1.5 }),
      fix({ t: 1_004_000, speed: 1.5 }),
      fix({ t: 1_006_000, speed: 1.5 })
    ];
    const meta = makeMeta({
      startedAtUtcMs: 1_000_000,
      endedAtUtcMs: 1_006_000,
      pauses: [{ startUtcMs: 1_002_000, endUtcMs: 1_004_000 }]
    });
    const result = replaySession(meta, fixes);
    // The manual pause is already subtracted; the remaining 4 s are moving time.
    expect(result.stats.movingTimeSec).toBe(4);
  });

  it('detects an auto-pause gap and subtracts it from moving time', () => {
    const fixes = [
      fix({ t: 1_000_000, speed: 2.0, lat: 45.0, lon: 6.0 }),
      fix({ t: 1_002_000, speed: 2.0, lat: 45.0001, lon: 6.0001 }),
      fix({ t: 1_005_000, speed: 0.1, lat: 45.0001, lon: 6.0001 }),
      fix({ t: 1_009_000, speed: 0.1, lat: 45.0001, lon: 6.0001 }),
      fix({ t: 1_015_000, speed: 2.0, lat: 45.00012, lon: 6.00012 })
    ];
    const meta = makeMeta({
      startedAtUtcMs: 1_000_000,
      endedAtUtcMs: 1_012_000
    });
    const result = replaySession(meta, fixes);
    // elapsed = 12 s, auto-pause gap = ~4 s (from 5 s to 9 s) -> moving ~8 s
    expect(result.stats.elapsedTimeSec).toBe(12);
    expect(result.stats.movingTimeSec).toBeLessThan(12);
    expect(result.stats.movingTimeSec).toBeGreaterThan(0);
    expect(result.segments.length).toBeGreaterThanOrEqual(2);
  });

  it('reports zero average speed when moving time is zero', () => {
    const fixes = [fix({ t: 1_000_000 })];
    const meta = makeMeta({ startedAtUtcMs: 1_000_000, endedAtUtcMs: 1_000_000 });
    const result = replaySession(meta, fixes);
    expect(result.stats.averageSpeedMetersPerSec).toBe(0);
  });

  it('fuses the barometer into the altitude when pressure is present', () => {
    const fixes = [
      fix({ t: 1_000_000, ele: 100, pressure: 1013.25 }),
      fix({ t: 1_002_000, ele: 100, pressure: 1013.25 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.altitude?.data[0]).toBe(100);
    expect(result.stats.elevationGainMeters).toBeGreaterThanOrEqual(0);
  });

  it('uses raw altitude when there is no barometer', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, ele: 123.45, pressure: null }),
      fix({ t: 1_004_000, lat: 45.0001, lon: 6.0001, ele: 124.0, pressure: null })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.altitude?.data[0]).toBe(123.5);
    expect(result.stream.altitude?.data[1]).toBe(123.6); // rounded to 0.1
  });

  it('rounds coordinates to 1e-6', () => {
    const fixes = [fix({ t: 1_000_000, lat: 45.123456789, lon: 6.987654321 })];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data[0]).toEqual([45.123457, 6.987654]);
  });

  it('keeps time monotonic across gaps', () => {
    const fixes = [fix({ t: 1_000_000 }), fix({ t: 1_002_000 }), fix({ t: 1_010_000 })];
    const result = replaySession(makeMeta(), fixes);
    const times = result.stream.time?.data ?? [];
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('writes zero elevation gain for swims', () => {
    const fixes = [fix({ t: 1_000_000, ele: 100 }), fix({ t: 1_002_000, ele: 110 })];
    const meta = makeMeta({ profile: 'swimming' });
    const result = replaySession(meta, fixes);
    expect(result.stats.elevationGainMeters).toBe(0);
    expect(result.stats.elevationLossMeters).toBe(0);
  });

  it('repairs a missing endedAtUtcMs from the last fix', () => {
    const fixes = [fix({ t: 1_000_000 }), fix({ t: 1_005_000 })];
    const meta = makeMeta({ startedAtUtcMs: 1_000_000, endedAtUtcMs: undefined });
    const result = replaySession(meta, fixes);
    expect(result.stats.elapsedTimeSec).toBe(5);
    expect(result.recovered).toBe(true);
  });

  it('does not mark a session recovered when endedAtUtcMs is present', () => {
    const fixes = [fix({ t: 1_000_000 }), fix({ t: 1_005_000 })];
    const meta = makeMeta({ startedAtUtcMs: 1_000_000, endedAtUtcMs: 1_005_000 });
    const result = replaySession(meta, fixes);
    expect(result.recovered).toBe(false);
  });

  it('handles an empty fix list', () => {
    const result = replaySession(makeMeta(), []);
    expect(result.stream.latlng?.data).toHaveLength(0);
    expect(result.stats.distanceMeters).toBe(0);
    expect(result.stats.averageSpeedMetersPerSec).toBe(0);
    expect(result.rejected).toHaveLength(0);
  });

  it('counts rejected fixes and keeps accepted ones', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, hAcc: 5 }),
      fix({ t: 1_003_000, lat: 45.0001, lon: 6.0001, hAcc: 30 }),
      fix({ t: 1_006_000, lat: 45.0002, lon: 6.0002, hAcc: 5 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
  });
});
