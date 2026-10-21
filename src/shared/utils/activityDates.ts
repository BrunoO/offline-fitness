import { Activity } from '@/shared/types/types';

/**
 * Canonical date helpers for Strava activities.
 *
 * Strava semantics:
 * - `start_date_utc` is the TRUE UTC instant.
 * - `start_date_local` is athlete-local wall-clock time MISLABELED with a Z
 *   suffix, so `new Date(start_date_local)` is off by `utc_offset` and then
 *   re-shifted by the DEVICE timezone. Never use it for bucketing or sorting.
 *
 * Rules:
 * - Bucketing (day/week/month/year, calendar, streaks, YTD): `local_date`.
 * - Sorting / filtering / recency: `start_timestamp_utc`.
 * - Display: `local_date` / `local_time` strings, never `new Date(...).toLocale*`.
 *
 * No fallbacks for pre-migration cache: stale records must be wiped via
 * `removeAllActivities` (drawer UI) and re-downloaded.
 */

/** Athlete-local calendar date (YYYY-MM-DD) for bucketing and display. */
export function activityLocalDate(activity: Activity): string {
  return activity.local_date;
}

/** Athlete-local wall time (HH:MM:SS). */
export function activityLocalTime(activity: Activity): string {
  return activity.local_time;
}

/** True UTC instant in ms for sorting, filtering and recency. */
export function activityUtcMs(activity: Activity): number {
  return activity.start_timestamp_utc;
}

/** Descending sort comparator (most recent first) by true UTC instant. */
export function compareActivitiesByUtcDesc(a: Activity, b: Activity): number {
  return activityUtcMs(b) - activityUtcMs(a);
}

/** Ascending sort comparator (oldest first) by true UTC instant. */
export function compareActivitiesByUtcAsc(a: Activity, b: Activity): number {
  return activityUtcMs(a) - activityUtcMs(b);
}

/** Display string from athlete-local fields, e.g. "2023-02-25 16:14:44". */
export function formatActivityLocalDateTime(activity: Activity): string {
  const date = activityLocalDate(activity);
  const time = activityLocalTime(activity);
  return time ? `${date} ${time}` : date;
}

/** Device-local "today" as YYYY-MM-DD. Device TZ is correct here by definition. */
export function deviceTodayLocalDateString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Format a device-local Date as YYYY-MM-DD (for picker comparisons). */
export function toLocalDateString(date: Date): string {
  return deviceTodayLocalDateString(date);
}

/**
 * Whole-day number for a YYYY-MM-DD calendar date (days since Unix epoch, UTC).
 * DST-safe alternative to `new Date(date).getTime()` diffs for consecutiveness.
 */
export function localDateToDayNumber(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

/** Leap-aware day-of-year (1-366) from athlete-local parts, no `Date` involved. */
export function dayOfYearFromParts(year: number, monthZeroIndexed: number, day: number): number {
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (isLeap) monthLengths[1] = 29;
  let dayOfYear = day;
  for (let m = 0; m < monthZeroIndexed; m++) dayOfYear += monthLengths[m];
  return dayOfYear;
}

/** Day-of-year (1-366) for an activity from its athlete-local calendar parts. */
export function activityDayOfYear(activity: Activity): number {
  return dayOfYearFromParts(activity.start_year, activity.start_month, activity.start_day);
}
