import { Activity } from '@/shared/types/types';
import { activityLocalDate } from './activityDates';
import { week_of_year } from './utils';

export interface IsoWeekTuple {
  year: number;
  week: number;
}

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export function formatIsoWeekKey(year: number, week: number): string {
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

export function parseIsoWeekKey(key: string): IsoWeekTuple {
  const [y, w] = key.split('-W');
  return { year: Number(y), week: Number(w) };
}

/**
 * Parses the calendar date from a Strava-style local timestamp.
 * Uses the YYYY-MM-DD prefix only — this is the athlete-local calendar day and
 * must not be derived from `Date.get*()` (device timezone can shift the day).
 */
export function parseActivityLocalDate(dateString: string): LocalDateParts {
  const datePart = dateString.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return { year, month: month - 1, day };
}

/**
 * ISO week key from explicit calendar date parts (month is 0-indexed).
 */
export function isoWeekKeyFromLocalParts(year: number, month: number, day: number): string {
  const weekNo = week_of_year(year, month, day);
  const calendarDate = new Date(year, month, day);
  const thursday = new Date(calendarDate);
  thursday.setDate(calendarDate.getDate() + 3 - ((calendarDate.getDay() + 6) % 7));
  const isoYear = thursday.getFullYear();
  return formatIsoWeekKey(isoYear, weekNo);
}

/**
 * ISO week key for the device-local calendar day of `date` (used for "this week").
 */
export function isoWeekKeyForDeviceDate(date: Date): string {
  return isoWeekKeyFromLocalParts(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * ISO week key from a date/datetime string using its YYYY-MM-DD prefix only.
 */
export function isoWeekKeyFromDateString(dateString: string): string {
  const { year, month, day } = parseActivityLocalDate(dateString);
  return isoWeekKeyFromLocalParts(year, month, day);
}

/**
 * ISO week bucket for an activity, using Strava's athlete-local calendar date.
 */
export function activityIsoWeekKey(activity: Activity): string {
  return isoWeekKeyFromDateString(activityLocalDate(activity));
}

/**
 * Legacy bucket key from stored activity fields (used before weeklyData alignment).
 */
export function activityStoredWeekKey(activity: Activity): string {
  let isoYear = activity.start_year;
  if (activity.start_month === 11 && activity.start_week === 1) {
    isoYear = activity.start_year + 1;
  } else if (activity.start_month === 0 && activity.start_week >= 52) {
    isoYear = activity.start_year - 1;
  }
  return formatIsoWeekKey(isoYear, activity.start_week);
}

export function weeksInIsoYear(isoYear: number): number {
  return week_of_year(isoYear, 11, 28);
}

export function nextIsoWeekKey(key: string): string {
  const { year, week } = parseIsoWeekKey(key);
  if (week < weeksInIsoYear(year)) {
    return formatIsoWeekKey(year, week + 1);
  }
  return formatIsoWeekKey(year + 1, 1);
}

export function isContiguousIsoWeek(previousKey: string, nextKey: string): boolean {
  const prev = parseIsoWeekKey(previousKey);
  const curr = parseIsoWeekKey(nextKey);
  return (
    (curr.year === prev.year && curr.week === prev.week + 1) ||
    (curr.year === prev.year + 1 && prev.week >= 52 && curr.week === 1)
  );
}

export function getIsoWeeksBetweenExclusive(fromKey: string, toKey: string): string[] {
  const result: string[] = [];
  let cursor = fromKey;
  let guard = 0;

  while (cursor !== toKey && guard < 60) {
    const next = nextIsoWeekKey(cursor);
    if (next === toKey) break;
    result.push(next);
    cursor = next;
    guard += 1;
  }

  return result;
}
