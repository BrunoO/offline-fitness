import { Activity, LatLng } from '@/shared/types/types';
import { activityUtcMs } from './activityDates';

/**
 * Calculates the week number of a given date.
 * @param year The year of the date.
 * @param month The month of the date (0-indexed).
 * @param day The day of the month.
 * @returns The week number of the year.
 */
export function week_of_year(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  // January 4 is always in week 1.
  const week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return (
    1 +
    Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

/**
 * Converts a number of seconds into a string in the format "HH:MM".
 * @param seconds The number of seconds to convert.
 * @returns A string in the format "HH:MM".
 */
export function seconds_to_label(seconds: number) {
  const hours = Math.trunc(seconds / 3600);
  const reminder = seconds % 3600;
  const minutes = Math.trunc(reminder / 60);
  return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0');
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Turns an ISO timestamp into a compact "how long ago" label.
 *
 * Where the age of something matters more than the moment it happened — the
 * header's backup freshness, for instance — "2 h ago" reads at a glance and a
 * `toLocaleString()` does not. Past a month the age stops being the point, so
 * the date itself is shown instead.
 * @param iso An ISO-8601 timestamp, e.g. the stored `backup_last_sync`.
 * @param nowMs Injected for deterministic tests; defaults to the device clock.
 * @returns The label, or null when `iso` is missing or not a timestamp.
 */
export function relative_time_label(
  iso: string | null | undefined,
  nowMs: number = Date.now()
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;

  const age = nowMs - then;
  // A future timestamp (clock skew, a manual edit) is as fresh as it gets.
  if (age < MINUTE_MS) return 'just now';
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} min ago`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)} h ago`;

  const days = Math.floor(age / DAY_MS);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString();
}

/**
 * Gets the date of the first day (Monday) of a given ISO week number and year.
 * Constructed purely in UTC: mixing a UTC instant with device-local
 * `getDay()`/`setDate()` shifts the result by the device timezone.
 * @param w The ISO week number.
 * @param y The year.
 * @returns Monday 00:00 UTC of the ISO week.
 */
export function getDateOfISOWeek(w: number, y: number) {
  // Jan 4 is always in ISO week 1; back up to its Monday, then add (w-1) weeks.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  return new Date(jan4.getTime() + ((w - 1) * 7 - jan4Day) * 86400000);
}

const UTC_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const UTC_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

/**
 * Formats a Date as "Mon May 01 2023" using UTC parts (same shape as
 * `Date.toDateString()` but device-TZ independent — a UTC-midnight Monday
 * would otherwise render as Sunday in western timezones).
 */
export function formatUtcDateString(date: Date): string {
  const weekday = UTC_WEEKDAYS[date.getUTCDay()];
  const month = UTC_MONTHS[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${weekday} ${month} ${day} ${date.getUTCFullYear()}`;
}

/**
 * Gets the current week number.
 * @param date The date to get the week number for. Defaults to the current date.
 * @returns The current week number.
 */
export function getCurrentWeekNumber(date: Date | undefined = undefined) {
  const today = date ? date : new Date();
  // https://stackoverflow.com/questions/13359294/date-getday-javascript-returns-wrong-day
  // The value returned by getDay is an integer corresponding to the day of the week:
  // 0 for Sunday, 1 for Monday, 2 for Tuesday, and so on.
  return week_of_year(today.getFullYear(), today.getMonth(), today.getDate());
}

/**
 * Gets the ISO week number for a given date string in YYYY-MM-DD format.
 * Parses the calendar parts directly — never via `new Date()`, which would
 * interpret date-only strings as UTC midnight and shift the day by device TZ.
 * @param dateString The date string in YYYY-MM-DD format.
 * @returns The ISO week number.
 */
export function getISOWeekNumber(dateString: string): number {
  const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
  return week_of_year(year, month - 1, day);
}

/**
 * Gets the last x months from a given date.
 * @param today The date to start from.
 * @param numberMonths The number of months to get.
 * @returns An array of dates representing the first day of the last x months.
 */
export function lastMonthsFrom(today: Date, numberMonths: number): Date[] {
  let currentMonth = today.getMonth();
  let currentYear = today.getFullYear();
  const result = [];

  while (result.length < numberMonths) {
    const firstDayCurrentMonth = new Date(currentYear, currentMonth, 1);
    result.push(firstDayCurrentMonth);
    currentMonth = currentMonth - 1;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear = currentYear - 1;
    }
  }

  return result;
}

export type WeekIdentifier = {
  weekNumber: number;
  year: number;
  weekIsoDate: Date;
};

/**
 * Gets the last x weeks from a given date.
 * @param date The date to start from.
 * @param numberWeeks The number of weeks to get.
 * @returns An array of week identifiers.
 */
export function lastWeeksFrom(date: Date, numberWeeks: number): WeekIdentifier[] {
  const result = [];
  const currentDay = date;
  while (result.length < numberWeeks) {
    const year = currentDay.getFullYear();
    const month = currentDay.getMonth();
    const day = currentDay.getDate();
    const computeWeekNumber = week_of_year(year, month, day);
    // Thursday in current week decides the year.
    const thursday = new Date(currentDay);
    thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
    result.unshift({
      weekNumber: computeWeekNumber,
      year: thursday.getFullYear(),
      weekIsoDate: getDateOfISOWeek(computeWeekNumber, thursday.getFullYear())
    });
    currentDay.setDate(day - 7);
  }
  return result;
}

/**
 * Converts an activity object to a string representation.
 *
 * @param {Activity} activity - The activity object to convert.
 * @returns {string} A string representation of the activity in the format:
 *                   "Activity Name (Activity Type) on Day/Month/Year for Elapsed Time".
 *
 * @example
 * const activity = {
 *   name: "Morning Run",
 *   type: "Run",
 *   start_day: 15,
 *   start_month: 6, // July (months are 0-indexed)
 *   start_year: 2023,
 *   elapsed_time: 3600, // 1 hour in seconds
 * };
 *
 * const activityString = activityToString(activity);
 * console.log(activityString); // "Morning Run (Run) on 15/7/2023 at 16:14 for 1h 0m 0s"
 */
export function activityToString(activity: Activity): string {
  const at = activity.local_time ? ` at ${activity.local_time.slice(0, 5)}` : ''; // HH:MM, seconds dropped for compactness
  return `${activity.name} (${activity.type}) on ${activity.start_day}/${
    activity.start_month + 1
  }/${activity.start_year}${at} for ${seconds_to_label(activity.elapsed_time)}`;
}

/**
 * Checks if a given month is between two other months.
 * @param startYear The year of the month to check.
 * @param startMonth The month to check (0-indexed).
 * @param oldestMonth The oldest month in the range.
 * @param newestMonth The newest month in the range.
 * @returns True if the month is between the two other months, false otherwise.
 */
export function isMonthBetween(
  startYear: number,
  startMonth: number,
  oldestMonth: Date,
  newestMonth: Date
): boolean {
  const testDate = new Date(startYear, startMonth, 1);
  return testDate >= oldestMonth && testDate <= newestMonth;
}

/**
 * Checks if a given week is between two other weeks.
 * @param year The year of the week to check.
 * @param weekNumber The week number to check.
 * @param oldestWeek The oldest week in the range.
 * @param newestWeek The newest week in the range.
 * @returns True if the week is between the two other weeks, false otherwise.
 */
export function matchingWeekNumber(
  year: number,
  weekNumber: number,
  oldestWeek: WeekIdentifier,
  newestWeek: WeekIdentifier
): boolean {
  const testDate = getDateOfISOWeek(weekNumber, year);
  return testDate >= oldestWeek.weekIsoDate && testDate <= newestWeek.weekIsoDate;
}

/**
 * Sorts an array of arrays based on the first element of each inner array in descending order.
 * @param arrX The first array to compare.
 * @param arrY The second array to compare.
 * @returns -1 if arrX should come before arrY, 1 if arrX should come after arrY, and 0 if they are equal.
 */
export function sortRowsOnYearDescending(arrX: number[], arrY: number[]) {
  if (arrX[0] > arrY[0]) {
    return -1;
  }
  if (arrX[0] < arrY[0]) {
    return 1;
  }
  return 0;
}

/**
 * Drops a column from a 2D array.
 * @param table The 2D array to drop a column from.
 * @param dropIndex The index of the column to drop.
 * @returns A new 2D array with the column dropped.
 */
export function dropColumn<T>(table: T[][], dropIndex: number): T[][] {
  return table.map((row: T[]) => {
    const nextRow: T[] = [];
    row.forEach((cell: T, index: number) => {
      if (index !== dropIndex) {
        nextRow.push(cell);
      }
    });
    return nextRow;
  });
}

/**
 * Formats a 2D array of numbers as a 2D array of strings, applying a given formatting function to all cells except the first column.
 * @param table The 2D array of numbers to format.
 * @param formatFunction The function to apply to each cell.
 * @returns A new 2D array of strings with the formatting applied.
 */
export function formatYearlyTable(
  table: number[][],
  formatFunction: (arg0: number) => string
): string[][] {
  return table.map((row: number[]) => {
    return row.map((cell: number, index: number) => {
      if (index === 0) {
        // year or Total if -1
        return cell < 0 ? 'Total' : cell.toString();
      } else {
        return formatFunction(cell);
      }
    });
  });
}

/**
 * Calculates the total number of weeks in a year up to a given date.
 * @param entry The year to calculate the number of weeks for.
 * @param today The date to calculate the number of weeks up to.
 * @returns The total number of weeks in the year up to the given date.
 */
export function totalWeeksTillToday(entry: number, today: Date) {
  const total_weeks = entry === today.getFullYear() ? getCurrentWeekNumber(today) : 52;
  const fixed_total_weeks = today.getMonth() === 11 && total_weeks === 1 ? 52 : total_weeks;
  return fixed_total_weeks;
}

/**
 * Gets the minimum and maximum date from an array of activities.
 * @param activities The array of activities.
 * @returns An object with the minimum and maximum date.
 */
export function minMaxDateRange(activities: Activity[]) {
  if (activities.length > 0) {
    let minDate = new Date(
      activities[0].start_year,
      activities[0].start_month,
      activities[0].start_day
    );
    let maxDate = new Date(
      activities[0].start_year,
      activities[0].start_month,
      activities[0].start_day
    );

    for (const activity of activities) {
      const activityDate = new Date(activity.start_year, activity.start_month, activity.start_day);
      if (activityDate < minDate) {
        minDate = activityDate;
      }
      if (activityDate > maxDate) {
        maxDate = activityDate;
      }
    }
    return { minDate: minDate, maxDate: maxDate };
  } else {
    const now = new Date();
    return { minDate: now, maxDate: now };
  }
}

/**
 * Calculates the bounding box of a set of coordinates.
 * @param coordinates The array of coordinates.
 * @returns The bounding box as a tuple of two coordinates, or undefined if the input is empty.
 */
export function calculateBoundingBox(
  coordinates: LatLng[]
): [[number, number], [number, number]] | undefined {
  if (coordinates.length === 0) {
    return undefined;
  }

  let minLat = coordinates[0].latitude;
  let maxLat = coordinates[0].latitude;
  let minLng = coordinates[0].longitude;
  let maxLng = coordinates[0].longitude;

  for (const coord of coordinates) {
    if (coord.latitude < minLat) minLat = coord.latitude;
    if (coord.latitude > maxLat) maxLat = coord.latitude;
    if (coord.longitude < minLng) minLng = coord.longitude;
    if (coord.longitude > maxLng) maxLng = coord.longitude;
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng]
  ];
}

/**
 * Calculates the Intersection over Union (IoU) of two bounding boxes.
 * @param boxA The first bounding box.
 * @param boxB The second bounding box.
 * @returns The IoU of the two bounding boxes.
 */
function calculateIoU(
  boxA: [[number, number], [number, number]],
  boxB: [[number, number], [number, number]]
): number {
  // Determine the coordinates of the intersection rectangle
  const xA = Math.max(boxA[0][1], boxB[0][1]);
  const yA = Math.max(boxA[0][0], boxB[0][0]);
  const xB = Math.min(boxA[1][1], boxB[1][1]);
  const yB = Math.min(boxA[1][0], boxB[1][0]);

  // Compute the area of intersection
  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);

  // Compute the area of both bounding boxes
  const boxAArea = (boxA[1][1] - boxA[0][1]) * (boxA[1][0] - boxA[0][0]);
  const boxBArea = (boxB[1][1] - boxB[0][1]) * (boxB[1][0] - boxB[0][0]);

  // Compute the IoU
  const iou = interArea / (boxAArea + boxBArea - interArea);

  return iou;
}

/**
 * Finds activities with a similar location to a given activity.
 * @param activity The activity to find similar activities for.
 * @param allActivities The array of all activities.
 * @param iouThreshold The IoU threshold to use for similarity.
 * @returns An array of similar activities.
 */
export function findSimilarActivities(
  activity: Activity,
  allActivities: Activity[],
  iouThreshold: number = 0.8
): Activity[] {
  if (!activity.bounding_box) {
    return [];
  }

  return allActivities.filter(otherActivity => {
    if (
      otherActivity.id === activity.id ||
      !otherActivity.bounding_box ||
      otherActivity.type !== activity.type
    ) {
      return false;
    }

    const iou = calculateIoU(activity.bounding_box!, otherActivity.bounding_box!);

    return iou >= iouThreshold;
  });
}

/**
 * Calculates the speed in km/h from a distance in meters and a time in seconds.
 * @param distance The distance in meters.
 * @param moving_time The time in seconds.
 * @returns The speed in km/h.
 */
export function calculateSpeedKmh(distance: number, moving_time: number): number {
  if (moving_time === 0) {
    return 0;
  }
  return (distance / moving_time) * 3.6;
}

/**
 * Calculates the trend line of a set of activities.
 * @param activities The array of activities.
 * @returns An array of two points representing the trend line.
 */
export const calculateTrendLine = (activities: Activity[]) => {
  const data = activities
    .map(a => ({
      x: activityUtcMs(a),
      y: calculateSpeedKmh(a.distance, a.moving_time)
    }))
    .sort((a, b) => a.x - b.x);

  if (data.length < 2) {
    return [];
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  const n = data.length;

  for (const point of data) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const firstPoint = {
    x: new Date(data[0].x),
    y: slope * data[0].x + intercept
  };
  const lastPoint = {
    x: new Date(data[n - 1].x),
    y: slope * data[n - 1].x + intercept
  };

  return [firstPoint, lastPoint];
};
