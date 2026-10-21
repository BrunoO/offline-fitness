import {
  applySwimMovingTime,
  rowToActivity,
  utcToLocalParts
} from '@/features/strava-import/services/activityMapper';
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

describe('utcToLocalParts', () => {
  // The goldens below are hand-verified offsets for fixed instants — they are
  // what `rowToActivity` fed to `Date` local methods before the zone became a
  // parameter. If a refactor ever derives local fields differently, these
  // break and every record's backup md5 changes with it.
  it('derives summer parts and offset in Europe/Paris', () => {
    // Oct 15 2023 05:50 UTC: CEST is still in force (it ends Oct 29) — 07:50, +7200.
    const parts = utcToLocalParts(Date.UTC(2023, 9, 15, 5, 50, 5), 'Europe/Paris');
    expect(parts).toEqual({
      year: 2023,
      month: 10,
      day: 15,
      hour: 7,
      minute: 50,
      second: 5,
      utcOffsetSeconds: 7200
    });
  });

  it('derives winter parts and offset across the CET switch', () => {
    const parts = utcToLocalParts(Date.UTC(2023, 10, 15, 5, 50, 5), 'Europe/Paris');
    expect(parts).toEqual({
      year: 2023,
      month: 11,
      day: 15,
      hour: 6,
      minute: 50,
      second: 5,
      utcOffsetSeconds: 3600
    });
  });

  it('derives summer parts across the DST switch', () => {
    const parts = utcToLocalParts(Date.UTC(2024, 6, 6, 18, 0, 0), 'Europe/Paris');
    expect(parts.hour).toBe(20);
    expect(parts.utcOffsetSeconds).toBe(7200);
  });

  it('follows the DST transition hour by hour on the switch day', () => {
    // 2024-03-31: Paris moved at 02:00 UTC (01:30 is still winter, 02:30 is already summer).
    const before = utcToLocalParts(Date.UTC(2024, 2, 31, 0, 30, 0), 'Europe/Paris');
    const after = utcToLocalParts(Date.UTC(2024, 2, 31, 2, 30, 0), 'Europe/Paris');
    expect([before.hour, before.utcOffsetSeconds]).toEqual([1, 3600]);
    expect([after.hour, after.utcOffsetSeconds]).toEqual([4, 7200]);
  });

  it('buckets the same instant on different days in different zones', () => {
    const late = Date.UTC(2025, 1, 6, 23, 30, 0); // 23:30 UTC
    const paris = utcToLocalParts(late, 'Europe/Paris');
    const lisbon = utcToLocalParts(late, 'Europe/Lisbon');
    // Paris has already rolled into Feb 7; Lisbon is still Feb 6 — the exact
    // property the travel-zone workstream exists to get right.
    expect([paris.day, lisbon.day]).toEqual([7, 6]);
  });

  it('rejects an unknown zone with the guidance message', () => {
    expect(() => utcToLocalParts(0, 'Mars/Olympus_Mons')).toThrow(/Unknown IANA timezone/);
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
