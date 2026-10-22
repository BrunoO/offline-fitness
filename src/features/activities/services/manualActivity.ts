import { Activity } from '@/shared/types/types';
import { week_of_year } from '@/shared/utils/utils';

/**
 * Builder for manually entered activities (no GPS track: Yoga, strength, …).
 *
 * The record mirrors what `rowToActivity` produces for archive rows, except the
 * athlete-local wall clock is entered by the user on this phone — so the
 * device zone *is* the source of truth here (unlike the desktop seeder, where
 * the laptop zone is nobody's truth). `start_timestamp_utc` is the entered
 * wall time read in the device zone; `local_date`/`local_time` echo the entry
 * verbatim. Distance, speed and elevation stay 0: GPS-less types are excluded
 * from map/distance views by `isNoGpsActivity` and counted in time-based stats.
 */

export interface ManualActivityInput {
  /** Canonical type, e.g. 'Yoga'. Falls back to 'Workout' when blank. */
  type: string;
  /** Athlete-local date 'YYYY-MM-DD'. */
  localDate: string;
  /** Athlete-local time 'HH:MM' (24 h). Seconds are stored as :00. */
  localTime: string;
  /** Duration in whole minutes, >= 1. */
  durationMin: number;
  /** Optional label; defaults to the type (e.g. "Yoga"). */
  name?: string;
  /** IANA zone label; defaults to the device zone. */
  timezone?: string;
}

/**
 * Canonical types offered in the manual-entry sheet. They match the keys of
 * `ACTIVITY_TYPE_ALIASES` in the archive CSV parser, so a manually entered
 * "Yoga" merges, filters and stats exactly like an imported one. To support a
 * new GPS-less type, add its Strava string to `NO_GPS_ACTIVITY_TYPES` too.
 */
export const MANUAL_ACTIVITY_TYPES = [
  'Yoga',
  'Workout',
  'WeightTraining',
  'Run',
  'Walk',
  'Hike',
  'Ride',
  'Swim',
  'Rowing',
  'Pilates',
  'Crossfit',
  'Skiing'
];

/** One-tap duration choices (minutes) in the manual-entry sheet. */
export const MANUAL_DURATION_PRESETS_MIN = [15, 30, 45, 60, 90, 120];

/** Device IANA zone, e.g. "Europe/Paris". Never throws — falls back to UTC. */
export function deviceTimezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

function parseDatePart(localDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error(`Invalid date "${localDate}". Use YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid date "${localDate}". Use YYYY-MM-DD.`);
  }
  return { year, month, day };
}

function parseTimePart(localTime: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(localTime.trim());
  if (!match) throw new Error(`Invalid time "${localTime}". Use HH:MM (24 h).`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid time "${localTime}". Use HH:MM (24 h).`);
  }
  return { hour, minute };
}

/**
 * Builds a stored `Activity` record from a manual entry. Throws on invalid
 * date/time/duration so the sheet can report the problem instead of saving.
 */
export function buildManualActivity(input: ManualActivityInput): Activity {
  if (!Number.isFinite(input.durationMin) || input.durationMin < 1) {
    throw new Error('Duration must be at least 1 minute.');
  }
  const { year, month, day } = parseDatePart(input.localDate);
  const { hour, minute } = parseTimePart(input.localTime);

  // Device-local construction: the entered wall time IS athlete-local time.
  const wallClock = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(wallClock.getTime())) {
    throw new Error(`Invalid date/time "${input.localDate} ${input.localTime}".`);
  }
  const startUtcMs = wallClock.getTime();
  const type = input.type.trim() || 'Workout';
  const name = input.name?.trim() || type;
  const localTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const durationSec = Math.round(input.durationMin * 60);
  // getTimezoneOffset is the device offset *at the entered instant*, so DST
  // on the entered date (not today) is what lands in the record.
  const utcOffsetSeconds = -Math.round(wallClock.getTimezoneOffset() * 60);

  return {
    id: `manual-${startUtcMs}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    // Same mislabeled-Z convention as imported records (see activityDates.ts).
    start_date_local: `${input.localDate}T${localTime}Z`,
    local_date: input.localDate,
    local_time: localTime,
    start_date_utc: new Date(startUtcMs).toISOString(),
    start_timestamp_utc: startUtcMs,
    timezone: input.timezone ?? deviceTimezoneLabel(),
    start_year: year,
    start_month: month - 1,
    start_day: day,
    start_week: week_of_year(year, month - 1, day),
    distance: 0,
    elapsed_time: durationSec,
    // Swims canonicalised at write time, like `rowToActivity` does.
    moving_time: durationSec,
    type,
    average_speed: 0,
    total_elevation_gain: 0,
    elev_high: 0,
    elev_low: 0,
    start_latlng: [],
    end_latlng: [],
    utc_offset: utcOffsetSeconds
  };
}
