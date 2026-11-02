import { Activity } from '@/shared/types/types';
import {
  activityLocalDate,
  dayOfYearFromParts,
  localDateToDayNumber
} from '@/shared/utils/activityDates';
import { totalWeeksTillToday } from '@/shared/utils/utils';
import { weeksInIsoYear } from '@/shared/utils/isoWeek';

export interface YearConsistencyStats {
  year: number;
  activeDays: number;
  totalDays: number;
  activeDaysPercent: number;
  totalActivities: number;
  activitiesPerWeek: number;
  longestStreakDays: number;
  isCurrentYear: boolean;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Calculates the longest run of consecutive integers (days).
 */
function calculateLongestDayStreak(sortedDayNumbers: number[]): number {
  if (sortedDayNumbers.length === 0) return 0;
  let best = 1;
  let current = 1;

  for (let i = 1; i < sortedDayNumbers.length; i++) {
    const diff = sortedDayNumbers[i] - sortedDayNumbers[i - 1];
    if (diff === 0) {
      continue;
    }
    current = diff === 1 ? current + 1 : 1;
    if (current > best) {
      best = current;
    }
  }

  return best;
}

interface YearAccumulator {
  distinctDates: Set<string>;
  activityCount: number;
}

function aggregateActivitiesByYear(
  activities: readonly Activity[],
  sportFilter?: string
): Map<number, YearAccumulator> {
  const map = new Map<number, YearAccumulator>();

  for (const a of activities) {
    if (sportFilter && sportFilter !== 'All' && a.type !== sportFilter) {
      continue;
    }
    const year = a.start_year;
    if (!year || year <= 0) continue;

    const localDate = activityLocalDate(a);
    if (!localDate) continue;

    const data = map.get(year) ?? {
      distinctDates: new Set<string>(),
      activityCount: 0
    };

    data.distinctDates.add(localDate);
    data.activityCount += 1;
    map.set(year, data);
  }

  return map;
}

function buildYearStat(
  year: number,
  data: YearAccumulator,
  currentYearNow: number,
  now: Date
): YearConsistencyStats {
  const isCurrentYear = year === currentYearNow;
  const activeDays = data.distinctDates.size;
  const totalActivities = data.activityCount;

  let totalDays: number;
  let totalWeeks: number;

  if (isCurrentYear) {
    const dayOfYear = dayOfYearFromParts(now.getFullYear(), now.getMonth(), now.getDate());
    totalDays = Math.max(1, dayOfYear);
    totalWeeks = Math.max(1, totalWeeksTillToday(year, now));
  } else {
    totalDays = isLeapYear(year) ? 366 : 365;
    totalWeeks = weeksInIsoYear(year);
  }

  const activeDaysPercent = Math.min(100, (activeDays / totalDays) * 100);
  const activitiesPerWeek = totalActivities / totalWeeks;

  const sortedDays = Array.from(data.distinctDates)
    .sort((a, b) => a.localeCompare(b))
    .map(localDateToDayNumber);
  const longestStreakDays = calculateLongestDayStreak(sortedDays);

  return {
    year,
    activeDays,
    totalDays,
    activeDaysPercent: Number.isFinite(activeDaysPercent) ? activeDaysPercent : 0,
    totalActivities,
    activitiesPerWeek: Number.isFinite(activitiesPerWeek) ? activitiesPerWeek : 0,
    longestStreakDays,
    isCurrentYear
  };
}

/**
 * Computes annual consistency metrics (active days, % of year, activities/week,
 * longest daily streak) for each year present in activities.
 *
 * @param activities The list of user activities.
 * @param sportFilter Optional sport type. If empty or 'All', includes all sports.
 * @param now Optional date for deterministic testing. Defaults to new Date().
 */
export function computeAnnualConsistencyStats(
  activities: readonly Activity[],
  sportFilter?: string,
  now: Date = new Date()
): YearConsistencyStats[] {
  const currentYearNow = now.getFullYear();
  const yearDataMap = aggregateActivitiesByYear(activities, sportFilter);

  const result: YearConsistencyStats[] = [];
  for (const [year, data] of yearDataMap.entries()) {
    result.push(buildYearStat(year, data, currentYearNow, now));
  }

  return result.sort((a, b) => a.year - b.year);
}
