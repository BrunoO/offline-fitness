import { Activity } from '@/shared/types/types';
import { week_of_year } from '@/shared/utils/utils';
import { ExportedActivityRow } from '../types/import.types';

/**
 * Part of the portable import core: `week_of_year` and the `Activity` type come
 * from their defining modules rather than the `@/shared` barrel, because the
 * barrel re-exports React Native components and would drag the platform into
 * any runtime that loads this file (see `docs/desktop-import-plan.md`).
 */

/**
 * Mapping from archive rows to the app's canonical `Activity` shape.
 *
 * `activities.csv` stores the start instant in UTC (verified: it matches the
 * `Z` timestamps inside each activity's GPX to the second), while the app
 * buckets activities by athlete-local calendar date. The archive carries no
 * timezone column, so the device timezone is used — the same assumption the
 * rest of the app makes when it renders "today" for the current user.
 */

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** IANA zone name of the device, when the JS engine exposes it. */
export function deviceTimezoneLabel(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved && resolved.length > 0 ? resolved : 'UTC';
  } catch {
    return 'UTC';
  }
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  utcOffsetSeconds: number;
}

/** Athlete-local wall clock of a UTC instant, in the device timezone. */
function localPartsFromUtcMs(utcMs: number): LocalParts {
  const date = new Date(utcMs);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    // getTimezoneOffset is minutes *behind* UTC (Paris in summer = -120).
    utcOffsetSeconds: -date.getTimezoneOffset() * 60
  };
}

/**
 * Builds the stored activity record from a CSV row.
 * `start_latlng`/`end_latlng` are filled in once the track is read.
 *
 * The swim `moving_time := elapsed_time` rule (see `applySwimMovingTime`) is
 * applied here so every writer — the phone importer, the desktop tool —
 * stores the canonical record, and the backup push's hash of the loaded
 * version matches the file on the server.
 */
export function rowToActivity(row: ExportedActivityRow, timezone: string): Activity {
  const local = localPartsFromUtcMs(row.startUtcMs);
  const localDate = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
  const localTime = `${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}`;

  return {
    id: row.id,
    name: row.name,
    // Strava mislabels athlete-local wall clock with a Z suffix; keep the app's
    // existing convention so date helpers behave identically for imported data.
    start_date_local: `${localDate}T${localTime}Z`,
    local_date: localDate,
    local_time: localTime,
    start_date_utc: new Date(row.startUtcMs).toISOString(),
    start_timestamp_utc: row.startUtcMs,
    timezone,
    start_year: local.year,
    start_month: local.month - 1,
    start_day: local.day,
    start_week: week_of_year(local.year, local.month - 1, local.day),
    distance: row.distance,
    elapsed_time: row.elapsedTime,
    // Swims get the canonical moving time at write time (see applySwimMovingTime),
    // but the key keeps its literal position either way, so the serialised record
    // — and its backup md5 — is stable across every writer.
    moving_time: row.type === 'Swim' ? row.elapsedTime : row.movingTime,
    type: row.type || 'Workout',
    average_speed: row.averageSpeed,
    total_elevation_gain: row.type === 'Swim' ? 0 : row.elevationGain,
    elev_high: row.elevHigh,
    elev_low: row.elevLow,
    start_latlng: [],
    end_latlng: [],
    utc_offset: local.utcOffsetSeconds
  };
}

/**
 * Strava does not compute moving time for swimming uploads, so the archive's
 * `Moving Time` for a swim is meaningless and `elapsed_time` is the better
 * approximation — the same rule `loadAllActivities` applies at read time for
 * records written before this existed.
 *
 * Callers must apply it wherever a record's type can become `Swim` *after*
 * `rowToActivity` ran — the GPX `<type>` fallback in both importers — so the
 * stored record is canonical on every path and the backup push hashes the
 * exact bytes that are on the server instead of re-uploading its read-time
 * version every sync (the 200-swim sync churn).
 */
export function applySwimMovingTime(activity: Activity): void {
  if (activity.type === 'Swim') {
    activity.moving_time = activity.elapsed_time;
  }
}

/**
 * Guards against the archive's summary columns (kilometres) being picked up
 * instead of the canonical metres column: when distance and speed disagree by
 * roughly 1000x, the value is kilometres.
 */
export function repairDistanceUnit(row: ExportedActivityRow, warnings: string[]): void {
  if (row.distance <= 0 || row.movingTime <= 0 || row.averageSpeed <= 0) return;

  const expectedMeters = row.averageSpeed * row.movingTime;
  if (expectedMeters <= 0) return;

  const metersError = Math.abs(row.distance - expectedMeters) / expectedMeters;
  if (metersError <= 0.35) return;

  const kilometresError = Math.abs(row.distance * 1000 - expectedMeters) / expectedMeters;
  if (kilometresError <= 0.35) {
    warnings.push(`Activity ${row.id}: distance looked like kilometres, converted to metres`);
    row.distance *= 1000;
  }
}
