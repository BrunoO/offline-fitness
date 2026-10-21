import { ActivityAccessor, Activity } from '@/shared';
import { simpleLogger } from '@/shared/services/SimpleLogger';
import { activityIsoWeekKey, formatIsoWeekKey } from '@/shared/utils/isoWeek';
import {
  isMonthBetween,
  lastMonthsFrom,
  lastWeeksFrom,
  totalWeeksTillToday
} from '@/shared/utils/utils';

/**
 * Calculates yearly statistics for activities based on a specified field.
 *
 * @param myActivities - Array of activity type strings to analyze
 * @param allActivities - Array of activity objects containing the data
 * @param activityField - Accessor function to extract the numeric field to analyze from activities
 * @returns A 2D array where each row contains:
 *  - Index 0: Year number (or -1 for the total row)
 *  - Index 1..n-2: Sum of activityField values per activity type
 *  - Index n-1: Total sum for the row
 *  - Index n: Average per week for the row
 *
 * The last row contains column totals, with:
 *  - First value set to -1 (indicating "Total")
 *  - Last value containing the average of all yearly averages
 */
export function yearlyData(
  myActivities: string[],
  allActivities: Activity[],
  activityField: ActivityAccessor<number>
): number[][] {
  const allYearsMap = new Map<number, Map<string, number>>();

  allActivities.forEach(ga => {
    // initialization of a map for the year if needed
    if (!allYearsMap.get(ga.start_year)) {
      const m = new Map();
      myActivities.forEach(la => m.set(la, 0));

      allYearsMap.set(ga.start_year, m);
    }
    // add the activity field to (year, activity) position in the table
    const yearMap = allYearsMap.get(ga.start_year)!;
    // Two inputs must not reach the cell as NaN: a type the list never
    // initialised, and a field that is not a number. The yearly charts feed
    // these values straight into victory-native paths, whose native parser on
    // Android crashes on NaN, so a broken cell is worse than a zero here.
    const value = activityField(ga);
    yearMap.set(ga.type, (yearMap.get(ga.type) ?? 0) + (Number.isFinite(value) ? value : 0));
  });

  // transform the map into a array of arrays
  const tableData = Array.from(allYearsMap, function (entry) {
    let total_row = 0;
    const row = Array.from(entry[1], function (submap) {
      total_row = total_row + submap[1];
      return submap[1];
    });
    const fixed_total_weeks = totalWeeksTillToday(entry[0], new Date());

    return [entry[0], ...row, total_row, total_row / fixed_total_weeks];
  });
  //compute total of columns
  const sumCols = tableData.reduce(function (r, a) {
    a.forEach(function (b, i) {
      r[i] = (r[i] || 0) + b;
    });
    return r;
  }, []);
  // correct first value (sum of years)
  sumCols[0] = -1; // -1 Magic value to indicate "Total" to the formatting function
  // correct last value (sum of averages)
  const numberRows = tableData.length;
  const lastColIndex = sumCols.length - 1;
  sumCols[lastColIndex] = numberRows > 0 ? sumCols[lastColIndex] / numberRows : 0;

  tableData.push(sumCols);
  return tableData;
}

export type WeekSummary = {
  start_week: number;
  isoDate: Date;
  summary: { type: string; value: number }[];
  extraValues: Map<string, number>;
  activities: Activity[];
};

/**
 * Sorts weekly data in reverse chronological order.
 *
 * @param ax - First WeekSummary object to compare
 * @param ay - Second WeekSummary object to compare
 * @returns -1 if ax is more recent, 1 if ay is more recent, 0 if equal
 */
function weekSort(ax: WeekSummary, ay: WeekSummary): number {
  if (ax.isoDate < ay.isoDate) {
    return 1;
  }
  if (ax.isoDate > ay.isoDate) {
    return -1;
  }
  return 0;
}

/**
 * Generates weekly statistics for activities over the last specified weeks.
 *
 * @param myActivities - Array of activity type strings to analyze
 * @param allActivities - Array of activity objects containing the data
 * @param numberRecentWeeks - Number of past weeks to analyze
 * @returns Array of WeekSummary objects containing:
 *  - start_week: Week number
 *  - isoDate: ISO date for the week
 *  - value: Array of activity types and their elapsed times
 *  - extraValues: Map containing additional statistics:
 *    - 'dist': Total distance
 *    - 'elev': Total elevation gain
 *    - 'nbA': Number of activities
 *    - 'totalH': Total elapsed time
 *
 * Results are sorted in reverse chronological order (most recent first)
 */

/**
 * Generates weekly statistics for activities over the last specified weeks.
 *
 * @param myActivities - Array of activity type strings to analyze
 * @param allActivities - Array of activity objects containing the data
 * @param numberRecentWeeks - Number of past weeks to analyze
 * @returns Array of WeekSummary objects containing:
 *  - start_week: Week number
 *  - isoDate: ISO date for the week
 *  - value: Array of activity types and their elapsed times
 *  - extraValues: Map containing additional statistics:
 *    - 'dist': Total distance
 *    - 'elev': Total elevation gain
 *    - 'nbA': Number of activities
 *    - 'totalH': Total elapsed time
 *
 * Results are sorted in reverse chronological order (most recent first)
 */
export function weeklyData(
  myActivities: string[],
  allActivities: Activity[],
  numberRecentWeeks: number,
  useElapsedTime: boolean = true
): WeekSummary[] {
  const recentWeeks = lastWeeksFrom(new Date(), numberRecentWeeks);
  simpleLogger.log('stored activities ' + allActivities.length);

  const weekKeySet = new Set(recentWeeks.map(week => formatIsoWeekKey(week.year, week.weekNumber)));

  const allWeeksMap = new Map<string, Map<string, number>>();
  const extraMap = new Map<string, Map<string, number>>();
  const activitiesByWeek = new Map<string, Activity[]>();

  recentWeeks.forEach(item => {
    const weekKey = formatIsoWeekKey(item.year, item.weekNumber);
    const typeTotals = new Map<string, number>();
    myActivities.forEach(activityType => typeTotals.set(activityType, 0));

    const extraValues = new Map<string, number>();
    extraValues.set('dist', 0).set('elev', 0).set('nbA', 0).set('totalH', 0);

    allWeeksMap.set(weekKey, typeTotals);
    extraMap.set(weekKey, extraValues);
    activitiesByWeek.set(weekKey, []);
  });

  const recentActivities = allActivities.filter(activity =>
    weekKeySet.has(activityIsoWeekKey(activity))
  );
  simpleLogger.log('found recent activities ' + recentActivities.length);

  recentActivities.forEach(activity => {
    const weekKey = activityIsoWeekKey(activity);
    const weekMap = allWeeksMap.get(weekKey);
    if (!weekMap) return;

    weekMap.set(
      activity.type,
      weekMap.get(activity.type)! + (useElapsedTime ? activity.elapsed_time : activity.moving_time)
    );

    const extraValues = extraMap.get(weekKey)!;
    extraValues.set('dist', extraValues.get('dist')! + activity.distance);
    extraValues.set('elev', extraValues.get('elev')! + activity.total_elevation_gain);
    extraValues.set(
      'totalH',
      extraValues.get('totalH')! + (useElapsedTime ? activity.elapsed_time : activity.moving_time)
    );
    extraValues.set('nbA', extraValues.get('nbA')! + 1);

    activitiesByWeek.get(weekKey)!.push(activity);
  });

  const arr = recentWeeks.map(item => {
    const weekKey = formatIsoWeekKey(item.year, item.weekNumber);
    const weekMap = allWeeksMap.get(weekKey)!;
    return {
      start_week: item.weekNumber,
      isoDate: item.weekIsoDate,
      summary: Array.from(weekMap, function (submap) {
        return { type: submap[0], value: submap[1] };
      }),
      extraValues: extraMap.get(weekKey)!,
      activities: activitiesByWeek.get(weekKey)!
    };
  });
  return arr.sort(weekSort);
}

/**
 * Generates monthly statistics for activities over the last 13 months based on a specified field.
 *
 * @param allActivities - Array of activity objects containing the data to analyze
 * @param activityField - Accessor function to extract the numeric field to analyze from activities
 * @returns Array of objects containing:
 *  - month: Date object representing the first day of the month
 *  - distance: Sum of the specified activity field for the month, divided by 1000
 *
 * The data covers the last 13 months up to the current date.
 * Results include only activities that fall within the specified month range.
 */

/**
 * Generates monthly statistics for activities over the last 13 months based on a specified field.
 *
 * @param allActivities - Array of activity objects containing the data to analyze
 * @param activityField - Accessor function to extract the numeric field to analyze from activities
 * @returns Array of objects containing:
 *  - month: Date object representing the first day of the month
 *  - distance: Sum of the specified activity field for the month, divided by 1000
 *
 * The data covers the last 13 months up to the current date.
 * Results include only activities that fall within the specified month range.
 */
export function monthlyData(allActivities: Activity[], activityField: ActivityAccessor<number>) {
  const recentMonths = lastMonthsFrom(new Date(), 13);

  const recentActivities = allActivities.filter(activity =>
    isMonthBetween(activity.start_year, activity.start_month, recentMonths.at(-1)!, recentMonths[0])
  );

  const allMonthsDistanceMap = new Map<number, number>();
  recentActivities.forEach(a => {
    const keyDate = new Date(a.start_year, a.start_month, 1).getTime();
    if (!allMonthsDistanceMap.has(keyDate)) {
      allMonthsDistanceMap.set(keyDate, 0);
    }
    allMonthsDistanceMap.set(keyDate, allMonthsDistanceMap.get(keyDate)! + activityField(a));
  });

  const arr = Array.from(allMonthsDistanceMap, function (entry) {
    return { month: new Date(entry[0]), distance: entry[1] / 1000.0 };
  });

  return arr;
}

export type MonthSummary = {
  month: Date;
  distance: number;
  elevation: number;
  time?: number;
};

/**
 * Generates monthly statistics for activities over a specified number of past months, calculating two metrics.
 *
 * @param allActivities - Array of activity objects containing the data to analyze
 * @param activityField1 - Accessor function to extract the first numeric metric (typically distance) from activities
 * @param activityField2 - Accessor function to extract the second numeric metric (typically elevation) from activities
 * @param numberRecentMonths - Number of past months to analyze
 * @returns Array of MonthSummary objects containing:
 *  - month: Date object representing the first day of the month
 *  - distance: Sum of the first metric for the month, divided by 1000
 *  - elevation: Sum of the second metric for the month
 *
 * The data covers the specified number of months up to the current date.
 * Results include only activities that fall within the specified month range.
 * Results are ordered chronologically by month.
 */

/**
 * Generates monthly statistics for activities over a specified number of past months, calculating two metrics.
 *
 * @param allActivities - Array of activity objects containing the data to analyze
 * @param activityField1 - Accessor function to extract the first numeric metric (typically distance) from activities
 * @param activityField2 - Accessor function to extract the second numeric metric (typically elevation) from activities
 * @param numberRecentMonths - Number of past months to analyze
 * @returns Array of MonthSummary objects containing:
 *  - month: Date object representing the first day of the month
 *  - distance: Sum of the first metric for the month, divided by 1000
 *  - elevation: Sum of the second metric for the month
 *
 * The data covers the specified number of months up to the current date.
 * Results include only activities that fall within the specified month range.
 * Results are ordered chronologically by month.
 */
export function monthlyData2(
  allActivities: Activity[],
  activityField1: ActivityAccessor<number>,
  activityField2: ActivityAccessor<number>,
  numberRecentMonths: number,
  useElapsedTime: boolean = true
): MonthSummary[] {
  const recentMonths = lastMonthsFrom(new Date(), numberRecentMonths);
  const recentActivities = allActivities.filter(activity =>
    isMonthBetween(activity.start_year, activity.start_month, recentMonths.at(-1)!, recentMonths[0])
  );

  // Initialize the map with ALL requested months so missing months appear with 0 values
  const allMonthsDistanceMap = new Map<number, number[]>();
  for (const m of recentMonths) {
    const key = new Date(m.getFullYear(), m.getMonth(), 1).getTime();
    allMonthsDistanceMap.set(key, [0, 0]);
  }

  recentActivities.forEach(a => {
    const keyDate = new Date(a.start_year, a.start_month, 1).getTime();
    if (!allMonthsDistanceMap.has(keyDate)) {
      allMonthsDistanceMap.set(keyDate, [0, 0]);
    }
    const currentValues = allMonthsDistanceMap.get(keyDate)!;
    const updatedValues = [
      currentValues[0] + activityField1(a),
      currentValues[1] + activityField2(a),
      (currentValues[2] || 0) + (useElapsedTime ? a.elapsed_time : a.moving_time) / 3600 // hours
    ];
    allMonthsDistanceMap.set(keyDate, updatedValues);
  });

  const arr = Array.from(allMonthsDistanceMap, function (entry) {
    return {
      month: new Date(entry[0]),
      distance: entry[1][0] / 1000.0,
      elevation: entry[1][1],
      time: entry[1][2] || 0
    };
  });

  // Ensure chronological order (oldest first)
  return arr.sort((a, b) => a.month.getTime() - b.month.getTime());
}
