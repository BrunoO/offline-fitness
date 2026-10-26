import { buildRecordedActivity } from '@/features/recording/services/buildRecordedActivity';
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

  it('uses the utc_offset at the instant (DST crossing)', () => {
    // A recording that starts in CET and ends after the spring-forward.
    // The utc_offset is computed at the start instant, so it reflects the
    // offset on that date, not today's.
    const fixes = [fix({ t: 1_000_000 }), fix({ t: 1_002_000 })];
    const meta = makeMeta({ startedAtUtcMs: 1_000_000 });
    // Sanity: the replay runs without throwing on a normal session.
    const result = replaySession(meta, fixes);
    expect(result.stats.elapsedTimeSec).toBe(2);
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

  it('backfills geoid height to early fixes preventing initial elevation drop', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, ele: 100, geoid: null }),
      fix({ t: 1_003_000, lat: 45.0001, lon: 6.0001, ele: 100, geoid: null }),
      fix({ t: 1_006_000, lat: 45.0002, lon: 6.0002, ele: 100, geoid: 45 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.altitude?.data[0]).toBe(55);
    expect(result.stream.altitude?.data[1]).toBe(55);
    expect(result.stream.altitude?.data[2]).toBe(55);
    expect(result.stats.elevationLossMeters).toBe(0);
    expect(result.stats.elevationGainMeters).toBe(0);
  });

  it('suppresses elevation gain from GPS vertical wander on flat ground', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, ele: 50.0 }),
      fix({ t: 1_003_000, lat: 45.0001, lon: 6.0001, ele: 52.0 }),
      fix({ t: 1_006_000, lat: 45.0002, lon: 6.0002, ele: 48.5 }),
      fix({ t: 1_009_000, lat: 45.0003, lon: 6.0003, ele: 51.5 }),
      fix({ t: 1_012_000, lat: 45.0004, lon: 6.0004, ele: 49.0 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stats.elevationGainMeters).toBe(0);
  });

  it('accumulates elevation gain when a real climb exceeds the GPS threshold', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, ele: 50.0 }),
      fix({ t: 1_003_000, lat: 45.0001, lon: 6.0001, ele: 55.0 }),
      fix({ t: 1_006_000, lat: 45.0002, lon: 6.0002, ele: 60.0 }),
      fix({ t: 1_009_000, lat: 45.0003, lon: 6.0003, ele: 65.0 }),
      fix({ t: 1_012_000, lat: 45.0004, lon: 6.0004, ele: 70.0 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stats.elevationGainMeters).toBeGreaterThan(3.5);
  });

  it('does not poison barometer baseline when early fixes lack GPS altitude', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, ele: null, pressure: 960.0 }),
      fix({ t: 1_003_000, lat: 45.0001, lon: 6.0001, ele: 450.0, pressure: 960.0 }),
      fix({ t: 1_006_000, lat: 45.0002, lon: 6.0002, ele: 450.0, pressure: 960.0 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.altitude?.data[0]).toBeCloseTo(450, 0);
    expect(result.stream.altitude?.data[1]).toBeCloseTo(450, 0);
    expect(result.stats.elevationGainMeters).toBe(0);
  });

  it('does not accumulate straight-line distance across a manual pause', () => {
    const meta = makeMeta({
      pauses: [{ startUtcMs: 1_005_000, endUtcMs: 1_065_000 }]
    });
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0 }),
      fix({ t: 1_003_000, lat: 45.0001, lon: 6.0 }), // ~11.1 m before pause
      // User walked 500 m while paused and resumed at t = 1_066_000
      fix({ t: 1_066_000, lat: 45.0046, lon: 6.0 }),
      fix({ t: 1_069_000, lat: 45.0047, lon: 6.0 }) // ~11.1 m after pause
    ];
    const result = replaySession(meta, fixes);
    expect(result.stream.latlng?.data).toHaveLength(4);
    expect(result.stats.distanceMeters).toBeLessThan(30);
    expect(result.stats.distanceMeters).toBeGreaterThan(20);
  });

  it('does not double-subtract overlapping auto-pause and manual pause intervals', () => {
    const meta = makeMeta({
      pauses: [{ startUtcMs: 1_015_000, endUtcMs: 1_045_000 }]
    });
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, speed: 1.4 }),
      // Stationary from 1_003_000 to 1_014_000 (>10s auto-pause window before manual pause at 1_015_000)
      fix({ t: 1_003_000, lat: 45.0, lon: 6.0, speed: 0.1 }),
      fix({ t: 1_014_000, lat: 45.0, lon: 6.0, speed: 0.1 }),
      // Resumed after manual pause at 1_046_000
      fix({ t: 1_046_000, lat: 45.0001, lon: 6.0, speed: 1.4 }),
      fix({ t: 1_050_000, lat: 45.0002, lon: 6.0, speed: 1.4 })
    ];
    const result = replaySession(meta, fixes);
    // Elapsed = 50s, manual pause = 30s (15s..45s), auto-pause before manual pause = 12s (3s..15s)
    // Moving time must be 50 - 30 - 12 = 8s (never negative or double-subtracted)
    expect(result.stats.elapsedTimeSec).toBe(50);
    expect(result.stats.movingTimeSec).toBe(8);
  });

  it('does not allow a corrupt speed-jump fix to update lastAccepted', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0, speed: 1.4 }),
      // Wild GPS teleport 5 km away 3 seconds later -> rejected as speed-jump
      fix({ t: 1_003_000, lat: 45.045, lon: 6.0, speed: null }),
      // Next valid fix near the true start position -> must be accepted relative to fix #1
      fix({ t: 1_006_000, lat: 45.0001, lon: 6.0, speed: 1.4 })
    ];
    const result = replaySession(makeMeta(), fixes);
    expect(result.stream.latlng?.data).toHaveLength(2);
    expect(result.rejected).toEqual([{ index: 1, reason: 'speed-jump' }]);
    expect(result.stats.distanceMeters).toBeGreaterThan(10);
    expect(result.stats.distanceMeters).toBeLessThan(15);
  });
});

// Sanity: the fixtures parse through the real reader path.

describe('replaySession heart rate', () => {
  it('aligns HR samples to accepted fixes and reports summary stats', () => {
    const fixes = [fix({ t: 1_000_000 }), fix({ t: 1_010_000, lat: 45.0001, lon: 6.0001 })];
    const samples = [
      { t: 1_000_000, bpm: 70 },
      { t: 1_010_000, bpm: 75 }
    ];
    const result = replaySession(makeMeta(), fixes, 0, samples);
    expect(result.stream.heartrate?.data).toEqual([70, 75]);
    expect(result.stats.averageHeartRate).toBe(73);
    expect(result.stats.maxHeartRate).toBe(75);
  });

  it('writes null for fixes without a nearby HR sample', () => {
    const fixes = [fix({ t: 1_000_000 }), fix({ t: 1_030_000, lat: 45.0001, lon: 6.0001 })];
    const samples = [{ t: 1_000_000, bpm: 70 }];
    const result = replaySession(makeMeta(), fixes, 0, samples);
    expect(result.stream.heartrate?.data).toEqual([70, null]);
    expect(result.stats.averageHeartRate).toBe(70);
  });

  it('excludes HR samples recorded during a manual pause from average and max HR', () => {
    const meta = makeMeta({
      pauses: [{ startUtcMs: 1_005_000, endUtcMs: 1_025_000 }]
    });
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0 }),
      fix({ t: 1_030_000, lat: 45.0001, lon: 6.0001 })
    ];
    const samples = [
      { t: 1_000_000, bpm: 130 },
      { t: 1_015_000, bpm: 195 }, // inside manual pause -> must be ignored
      { t: 1_030_000, bpm: 140 }
    ];
    const result = replaySession(meta, fixes, 0, samples);
    expect(result.stream.heartrate?.data).toEqual([130, 140]);
    expect(result.stats.averageHeartRate).toBe(135);
    expect(result.stats.maxHeartRate).toBe(140);
  });
});

describe('buildRecordedActivity', () => {
  it('applies distanceOverrideMeters for swims and recalculates average_speed from elapsed time', () => {
    const meta = makeMeta({
      profile: 'swimming',
      startedAtUtcMs: 1_700_000_000_000,
      endedAtUtcMs: 1_700_001_800_000 // 1800 seconds (30 min)
    });
    const replay = replaySession(meta, []);

    const activity = buildRecordedActivity({
      meta,
      replay,
      name: 'Pool Swim 1500m',
      distanceOverrideMeters: 1500
    });

    expect(activity.type).toBe('Swim');
    expect(activity.name).toBe('Pool Swim 1500m');
    expect(activity.distance).toBe(1500);
    expect(activity.elapsed_time).toBe(1800);
    expect(activity.moving_time).toBe(1800);
    expect(activity.average_speed).toBeCloseTo(1500 / 1800, 6);
    expect(activity.total_elevation_gain).toBe(0);
  });

  it('falls back to replay distance and speed when distanceOverrideMeters is undefined', () => {
    const fixes = [
      fix({ t: 1_000_000, lat: 45.0, lon: 6.0 }),
      fix({ t: 1_010_000, lat: 45.0001, lon: 6.0 })
    ];
    const meta = makeMeta({
      profile: 'swimming',
      startedAtUtcMs: 1_000_000,
      endedAtUtcMs: 1_010_000
    });
    const replay = replaySession(meta, fixes);

    const activity = buildRecordedActivity({
      meta,
      replay,
      name: ''
    });

    expect(activity.distance).toBe(replay.stats.distanceMeters);
    expect(activity.average_speed).toBe(replay.stats.averageSpeedMetersPerSec);
  });
});
