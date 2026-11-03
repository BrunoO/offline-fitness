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
 * verbatim.
 *
 * Distance, speed and elevation default to 0 for GPS-less types (excluded from
 * map/distance views by `isNoGpsActivity` and counted in time-based stats). For
 * types that normally carry a GPS track, the caller may supply `distanceKm` and
 * `elevationGainM` so a forgotten activity can still be recorded retroactively
 * without a track; `average_speed` is then derived from distance/duration.
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
  /** Optional distance in kilometres (for GPS-track types entered without a track). */
  distanceKm?: number;
  /** Optional elevation gain in metres (for GPS-track types entered without a track). */
  elevationGainM?: number;
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

/**
 * Ordered type list for the manual-entry sheet: the last-used type first,
 * then the user's own types by frequency (the archive is the source of
 * truth for what they actually do), then user-declared types, then the
 * built-in defaults. Case-insensitive dedup keeps "yoga" from doubling
 * "Yoga"; the first casing seen wins.
 */
export function buildManualTypeList(args: {
  activities: readonly { type: string }[];
  lastType: string | null;
  customTypes: readonly string[];
  defaults?: readonly string[];
}): string[] {
  const list: string[] = [];
  const seen = new Set<string>();
  const claim = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(trimmed);
  };

  if (args.lastType) claim(args.lastType);

  const counts = new Map<string, { name: string; count: number }>();
  for (const activity of args.activities) {
    const key = activity.type.trim().toLowerCase();
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(key, { name: activity.type.trim(), count: 1 });
    }
  }
  const byFrequency = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
  for (const entry of byFrequency) claim(entry.name);

  for (const custom of args.customTypes) claim(custom);
  for (const fallback of args.defaults ?? MANUAL_ACTIVITY_TYPES) claim(fallback);
  return list;
}

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
  if (!match) throw new TypeError(`Invalid date "${localDate}". Use YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new TypeError(`Invalid date "${localDate}". Use YYYY-MM-DD.`);
  }
  return { year, month, day };
}

function parseTimePart(localTime: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(localTime.trim());
  if (!match) throw new TypeError(`Invalid time "${localTime}". Use HH:MM (24 h).`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new TypeError(`Invalid time "${localTime}". Use HH:MM (24 h).`);
  }
  return { hour, minute };
}

// Monotonic per-session suffix: ids stay unique without any randomness
// (two entries stamped in the same millisecond still differ).
let manualIdCounter = 0;

/**
 * Builds a stored `Activity` record from a manual entry. Throws on invalid
 * date/time/duration so the sheet can report the problem instead of saving.
 */
/**
 * Validates the manual-activity input, throwing a TypeError on invalid values.
 */
function validateManualActivityInput(input: ManualActivityInput): void {
  if (!Number.isFinite(input.durationMin) || input.durationMin < 1) {
    throw new TypeError('Duration must be at least 1 minute.');
  }
  if (
    input.distanceKm !== undefined &&
    (!Number.isFinite(input.distanceKm) || input.distanceKm < 0)
  ) {
    throw new TypeError('Distance must be a non-negative number.');
  }
  if (
    input.elevationGainM !== undefined &&
    (!Number.isFinite(input.elevationGainM) || input.elevationGainM < 0)
  ) {
    throw new TypeError('Elevation gain must be a non-negative number.');
  }
}

interface ManualActivityCore {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  startUtcMs: number;
  type: string;
  name: string;
  localTime: string;
  durationSec: number;
  utcOffsetSeconds: number;
  distanceM: number;
  elevationGainM: number;
  averageSpeed: number;
}

/**
 * Derives all computed fields for a manual activity. Validation of the raw
 * input is handled separately by `validateManualActivityInput`; this helper
 * assumes the input has already passed validation.
 */
function computeManualActivityCore(input: ManualActivityInput): ManualActivityCore {
  const { year, month, day } = parseDatePart(input.localDate);
  const { hour, minute } = parseTimePart(input.localTime);

  // Device-local construction: the entered wall time IS athlete-local time.
  const wallClock = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(wallClock.getTime())) {
    throw new TypeError(`Invalid date/time "${input.localDate} ${input.localTime}".`);
  }
  const startUtcMs = wallClock.getTime();
  const type = input.type.trim() || 'Workout';
  const name = input.name?.trim() || type;
  const localTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const durationSec = Math.round(input.durationMin * 60);
  // getTimezoneOffset is the device offset *at the entered instant*, so DST
  // on the entered date (not today) is what lands in the record.
  const utcOffsetSeconds = -Math.round(wallClock.getTimezoneOffset() * 60);

  const isSwim = type.toLowerCase() === 'swim' || type.toLowerCase() === 'swimming';
  const distanceM = Math.round((input.distanceKm ?? 0) * 1000);
  // Swims canonicalised at write time, like `rowToActivity` does: gain 0,
  // moving = elapsed. Elevation entry is ignored for swims.
  const elevationGainM = isSwim ? 0 : (input.elevationGainM ?? 0);
  const averageSpeed = distanceM > 0 && durationSec > 0 ? distanceM / durationSec : 0;

  return {
    year,
    month,
    day,
    hour,
    minute,
    startUtcMs,
    type,
    name,
    localTime,
    durationSec,
    utcOffsetSeconds,
    distanceM,
    elevationGainM,
    averageSpeed
  };
}

export function buildManualActivity(input: ManualActivityInput): Activity {
  validateManualActivityInput(input);
  const c = computeManualActivityCore(input);

  return {
    id: `manual-${c.startUtcMs}-${(manualIdCounter++).toString(36)}`,
    name: c.name,
    // Same mislabeled-Z convention as imported records (see activityDates.ts).
    start_date_local: `${input.localDate}T${c.localTime}Z`,
    local_date: input.localDate,
    local_time: c.localTime,
    start_date_utc: new Date(c.startUtcMs).toISOString(),
    start_timestamp_utc: c.startUtcMs,
    timezone: input.timezone ?? deviceTimezoneLabel(),
    start_year: c.year,
    start_month: c.month - 1,
    start_day: c.day,
    start_week: week_of_year(c.year, c.month - 1, c.day),
    distance: c.distanceM,
    elapsed_time: c.durationSec,
    // Swims canonicalised at write time, like `rowToActivity` does.
    moving_time: c.durationSec,
    type: c.type,
    average_speed: c.averageSpeed,
    total_elevation_gain: c.elevationGainM,
    elev_high: 0,
    elev_low: 0,
    start_latlng: [],
    end_latlng: [],
    utc_offset: c.utcOffsetSeconds
  };
}

export interface TimerActivityInput {
  /** Canonical type, e.g. 'Yoga'. Falls back to 'Workout' when blank. */
  type: string;
  /** UTC ms of the moment the user pressed Start. */
  startUtcMs: number;
  /** Elapsed duration in seconds (>= 1). */
  durationSec: number;
  /** Optional label; defaults to the type. */
  name?: string;
  /** IANA zone label; defaults to the device zone. */
  timezone?: string;
}

let timerIdCounter = 0;

/**
 * Builds a stored `Activity` from a timer-only recording (no GPS track).
 * Duration is preserved to the second. Distance/elevation stay 0, so the
 * activity is treated as GPS-less by `isNoGpsActivity`-aware views.
 */
export function buildTimerActivity(input: TimerActivityInput): Activity {
  if (!Number.isFinite(input.durationSec) || input.durationSec < 1) {
    throw new TypeError('Duration must be at least 1 second.');
  }
  if (!Number.isFinite(input.startUtcMs)) {
    throw new TypeError('Start time must be a valid timestamp.');
  }

  const wallClock = new Date(input.startUtcMs);
  if (Number.isNaN(wallClock.getTime())) {
    throw new TypeError('Start time must be a valid timestamp.');
  }

  const year = wallClock.getFullYear();
  const month = wallClock.getMonth() + 1;
  const day = wallClock.getDate();
  const hour = wallClock.getHours();
  const minute = wallClock.getMinutes();
  const second = wallClock.getSeconds();

  const pad = (value: number): string => String(value).padStart(2, '0');
  const localDate = `${year}-${pad(month)}-${pad(day)}`;
  const localTime = `${pad(hour)}:${pad(minute)}:${pad(second)}`;

  const type = input.type.trim() || 'Workout';
  const name = input.name?.trim() || type;
  const durationSec = Math.round(input.durationSec);
  const utcOffsetSeconds = -Math.round(wallClock.getTimezoneOffset() * 60);

  return {
    id: `timer-${input.startUtcMs}-${(timerIdCounter++).toString(36)}`,
    name,
    start_date_local: `${localDate}T${localTime}Z`,
    local_date: localDate,
    local_time: localTime,
    start_date_utc: new Date(input.startUtcMs).toISOString(),
    start_timestamp_utc: input.startUtcMs,
    timezone: input.timezone ?? deviceTimezoneLabel(),
    start_year: year,
    start_month: month - 1,
    start_day: day,
    start_week: week_of_year(year, month - 1, day),
    distance: 0,
    elapsed_time: durationSec,
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
