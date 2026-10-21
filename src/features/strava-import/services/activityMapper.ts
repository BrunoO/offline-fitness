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
 * timezone column, so the caller supplies the zone per activity: the desktop
 * seeding tool derives it from the track's GPS start, which puts holiday rides
 * in the zone they actually happened in.
 */

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  utcOffsetSeconds: number;
}

// Intl.DateTimeFormat construction is comparatively expensive; archives run
// one lookup per activity (thousands) and the zone set is tiny.
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    zoneFormatters.set(zone, formatter);
  }
  return formatter;
}

/**
 * Wall-clock parts of a UTC instant in an explicit IANA zone.
 *
 * Deliberately not the `Date` local methods: those read the *process* zone,
 * which is right for the phone (device zone == the zone records are derived
 * in) and wrong for the desktop tool, where the laptop's zone is nobody's
 * source of truth. `Intl` with an explicit zone gives every writer — and a
 * future rebuild of the same archive — the same parts, DST included.
 */
export function utcToLocalParts(utcMs: number, zone: string): LocalParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = zoneFormatter(zone).formatToParts(new Date(utcMs));
  } catch {
    // An unknown zone fails at formatter construction; report it as such.
    throw new Error(`Unknown IANA timezone "${zone}". Use a zone like "Europe/Paris" or "UTC".`);
  }
  const value = (type: string): number =>
    Number(parts.find(part => part.type === type)?.value ?? '0');
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = value('hour');
  const minute = value('minute');
  const second = value('second');
  // The zone's offset is the gap between the wall clock read as if it were
  // UTC and the true instant; whole minutes only (sub-minute LMT zones
  // before 1972 would round, matching the app's integer seconds field).
  const wallAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const utcOffsetSeconds = Math.round((wallAsUtcMs - utcMs) / 1000);
  return { year, month, day, hour, minute, second, utcOffsetSeconds };
}

/**
 * Builds the stored activity record from a CSV row, in the given IANA zone.
 * `start_latlng`/`end_latlng` are filled in once the track is read.
 *
 * The swim canonicalisation (see `applySwimMovingTime`: meaningless moving time
 * replaced, gain forced to 0) is applied here so the single archive writer
 * stores the canonical record, and the backup push's hash of the loaded
 * version matches the file on the server.
 */
export function rowToActivity(row: ExportedActivityRow, timezone: string): Activity {
  const local = utcToLocalParts(row.startUtcMs, timezone);
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
 * Strava computes neither moving time nor elevation gain for swimming uploads,
 * so the archive's `Moving Time` for a swim is meaningless (`elapsed_time`
 * approximates better) and its elevation gain is noise forced to 0 — the same
 * rules `loadAllActivities` and the startup backfill apply at read time for
 * records written before they existed.
 *
 * Callers must apply it wherever a record's type can become `Swim` *after*
 * `rowToActivity` ran — the GPX `<type>` fallback only sees the CSV type when
 * it decides the gain — or the stored record diverges from the backup push's
 * hash of it on every sync. That is the 200-swim churn one field over: the
 * moving-time half was fixed first, and the gain half hid behind it because
 * no archive in the test set had a fallback Swim with non-zero gain.
 */
export function applySwimMovingTime(activity: Activity): void {
  if (activity.type !== 'Swim') return;
  // In-place assignments only: both keys exist in the `rowToActivity`
  // literal, so key order — and every writer's md5 — is unchanged.
  activity.moving_time = activity.elapsed_time;
  activity.total_elevation_gain = 0;
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
