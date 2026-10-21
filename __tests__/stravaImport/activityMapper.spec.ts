import { applySwimMovingTime, rowToActivity } from '@/features/strava-import/services/activityMapper';
import { ExportedActivityRow } from '@/features/strava-import/types/import.types';

/**
 * The swim moving-time rule is canonical at write time (it used to be a
 * read-time-only fix in `loadAllActivities`, which made every backup push
 * re-hash swims differently from the file on the server). These tests pin the
 * write-side behaviour for both ways a record can become a Swim: a mapped CSV
 * type, and `applySwimMovingTime` after the GPX `<type>` fallback.
 */

function makeRow(overrides: Partial<ExportedActivityRow> = {}): ExportedActivityRow {
  return {
    id: '1',
    startUtcMs: Date.UTC(2024, 0, 14, 10, 0, 0),
    name: 'Session',
    type: 'Ride',
    distance: 20000,
    movingTime: 3000,
    elapsedTime: 3600,
    elevationGain: 250,
    elevHigh: 300,
    elevLow: 20,
    averageSpeed: 6.67,
    fileName: 'activities/1.gpx',
    ...overrides
  };
}

describe('rowToActivity', () => {
  it('stores a swim with elapsed_time as the canonical moving time', () => {
    const activity = rowToActivity(makeRow({ type: 'Swim' }), 'Europe/Paris');
    expect(activity.type).toBe('Swim');
    expect(activity.moving_time).toBe(3600); // not the CSV's 3000
    expect(activity.elapsed_time).toBe(3600);
    expect(activity.total_elevation_gain).toBe(0);
  });

  it('leaves non-swim moving times untouched', () => {
    const activity = rowToActivity(makeRow({ type: 'Ride' }), 'Europe/Paris');
    expect(activity.moving_time).toBe(3000);
  });

  it('keeps the same key order for swims, so every writer hashes identically', () => {
    const ride = rowToActivity(makeRow({ type: 'Ride' }), 'Europe/Paris');
    const swim = rowToActivity(makeRow({ type: 'Swim' }), 'Europe/Paris');
    expect(Object.keys(swim)).toEqual(Object.keys(ride));
  });
});

describe('applySwimMovingTime', () => {
  it('rewrites moving_time when the record is a swim', () => {
    const activity = rowToActivity(makeRow({ type: 'Workout' }), 'Europe/Paris');
    activity.type = 'Swim'; // the GPX <type> fallback path
    applySwimMovingTime(activity);
    expect(activity.moving_time).toBe(activity.elapsed_time);
  });

  it('is a no-op for other types (safe to call unconditionally)', () => {
    const activity = rowToActivity(makeRow({ type: 'Run' }), 'Europe/Paris');
    applySwimMovingTime(activity);
    expect(activity.moving_time).toBe(3000);
  });

  it('is idempotent — re-applying changes nothing (and no key moves)', () => {
    const activity = rowToActivity(makeRow({ type: 'Swim' }), 'Europe/Paris');
    const before = JSON.stringify(activity);
    applySwimMovingTime(activity);
    expect(JSON.stringify(activity)).toBe(before);
  });
});
