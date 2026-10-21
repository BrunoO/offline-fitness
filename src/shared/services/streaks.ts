import { evaluateGoal } from '@/features/stats/services/GoalService';
import { Activity } from '@/shared';
import {
  activityLocalDate,
  deviceTodayLocalDateString,
  localDateToDayNumber
} from '@/shared/utils/activityDates';
import {
  activityIsoWeekKey,
  activityStoredWeekKey,
  getIsoWeeksBetweenExclusive,
  isoWeekKeyForDeviceDate,
  isContiguousIsoWeek
} from '@/shared/utils/isoWeek';
import { simpleLogger } from './SimpleLogger';

interface StreakResult {
  current: number;
  best: number;
}

interface WeeklyGoalStreakGapDetail {
  previousMetWeek: string;
  nextMetWeek: string;
  gapWeek: string;
  reason: 'no_activities' | 'goal_not_met';
  activityCount?: number;
  elapsedTimeSeconds?: number;
  yogaElapsedSeconds?: number;
}

interface WeeklyGoalStreakWeekKeyMismatch {
  activityId: string;
  activityName: string;
  streakWeekKey: string;
  storedWeekKey: string;
}

/**
 * Athlete-local calendar day for an activity (YYYY-MM-DD from `local_date`).
 * Never derived via `new Date()` — the device timezone must not shift the day.
 */

function sumElapsedTime(activities: Activity[]): number {
  return activities.reduce((total, activity) => total + activity.elapsed_time, 0);
}

function sumElapsedTimeForType(activities: Activity[], type: string): number {
  return activities
    .filter(activity => activity.type === type)
    .reduce((total, activity) => total + activity.elapsed_time, 0);
}

function collectWeeklyGoalStreakGaps(
  weekToActivities: Map<string, Activity[]>,
  metWeeks: string[]
): WeeklyGoalStreakGapDetail[] {
  const gaps: WeeklyGoalStreakGapDetail[] = [];

  for (let i = 1; i < metWeeks.length; i++) {
    const previousMetWeek = metWeeks[i - 1];
    const nextMetWeek = metWeeks[i];
    if (isContiguousIsoWeek(previousMetWeek, nextMetWeek)) continue;

    for (const gapWeek of getIsoWeeksBetweenExclusive(previousMetWeek, nextMetWeek)) {
      const gapActivities = weekToActivities.get(gapWeek);
      if (!gapActivities || gapActivities.length === 0) {
        gaps.push({
          previousMetWeek,
          nextMetWeek,
          gapWeek,
          reason: 'no_activities'
        });
        continue;
      }

      gaps.push({
        previousMetWeek,
        nextMetWeek,
        gapWeek,
        reason: 'goal_not_met',
        activityCount: gapActivities.length,
        elapsedTimeSeconds: sumElapsedTime(gapActivities),
        yogaElapsedSeconds: sumElapsedTimeForType(gapActivities, 'Yoga')
      });
    }
  }

  return gaps;
}

function collectWeekKeyMismatches(
  weekToActivities: Map<string, Activity[]>,
  maxSamples: number
): WeeklyGoalStreakWeekKeyMismatch[] {
  const mismatches: WeeklyGoalStreakWeekKeyMismatch[] = [];

  for (const [, activities] of weekToActivities) {
    for (const activity of activities) {
      const streakWeekKey = activityIsoWeekKey(activity);
      const storedWeekKey = activityStoredWeekKey(activity);
      if (streakWeekKey === storedWeekKey) continue;

      mismatches.push({
        activityId: activity.id,
        activityName: activity.name,
        streakWeekKey,
        storedWeekKey
      });
      if (mismatches.length >= maxSamples) return mismatches;
    }
  }

  return mismatches;
}

function logWeeklyGoalStreakDiagnostics(
  result: StreakResult,
  context: {
    metWeeks: string[];
    weekToActivities: Map<string, Activity[]>;
    rawCurrentRun: number;
    thisWeekKey: string;
    lastWeekKey: string;
    recencyActive: boolean;
  }
): void {
  const { metWeeks, weekToActivities } = context;
  const allGaps = collectWeeklyGoalStreakGaps(weekToActivities, metWeeks);
  const recentBreaks = allGaps.slice(-5).reverse();
  const weekKeyMismatches = collectWeekKeyMismatches(weekToActivities, 10);

  simpleLogger.log('Weekly goal streak diagnostics', {
    current: result.current,
    best: result.best,
    rawCurrentRun: context.rawCurrentRun,
    recencyActive: context.recencyActive,
    lastMetWeek: metWeeks.at(-1)!,
    thisWeekKey: context.thisWeekKey,
    lastWeekKey: context.lastWeekKey,
    totalMetWeeks: metWeeks.length,
    totalBreaks: allGaps.length,
    recentBreaks,
    weekKeyMismatches,
    weekKeyMismatchCount: weekKeyMismatches.length,
    notes: [
      'Streak and Recent Weeks bucket by athlete-local calendar date (local_date).',
      'Do not use Date.get*() on timestamps — device timezone can shift evening activities to the next ISO week.',
      'goal_not_met with high elapsedTimeSeconds usually means the Yoga sub-goal failed (default goal requires 1h Yoga).'
    ]
  });
}

/**
 * Calculates current and best streaks of consecutive active days.
 * - Uses local date to group activities by day.
 * - current streak is set to 0 if the last activity day is older than yesterday.
 */
export function computeDayStreaks(activities: Activity[]): StreakResult {
  if (!activities.length) return { current: 0, best: 0 };
  // Group by athlete-local calendar day (device-TZ independent).
  const daySet = new Set<string>();
  for (const a of activities) {
    daySet.add(activityLocalDate(a));
  }
  const days = Array.from(daySet).sort((a, b) => a.localeCompare(b)); // ascending
  // Whole-day numbers (DST-safe integer math, no device-TZ Date involved).
  const dayNumbers = days.map(localDateToDayNumber);

  let best = 1;
  let current = 1;
  // Determine if the last day is today or contiguous from yesterday for current streak
  for (let i = 1; i < dayNumbers.length; i++) {
    const diffDays = dayNumbers[i] - dayNumbers[i - 1];
    if (diffDays === 1) {
      current += 1;
    } else if (diffDays > 1) {
      best = Math.max(best, current);
      current = 1;
    }
  }
  best = Math.max(best, current);

  // If the last recorded day is not today or yesterday, current streak should be 0 or 1 based on last day proximity
  const last = dayNumbers.at(-1)!;
  const diffToToday = localDateToDayNumber(deviceTodayLocalDateString()) - last;
  const adjustedCurrent = diffToToday <= 1 ? current : 0;

  return { current: adjustedCurrent, best };
}

/**
 * Calculates current and best streaks of consecutive ISO weeks with activity.
 * - Weeks are ISO weeks (Mon-Sun, Thursday-based numbering).
 * - Handles year boundary (W52 -> W01) as contiguous.
 * - current streak is set to 0 if the last recorded week is older than last week.
 */
export function computeWeekStreaks(activities: Activity[]): StreakResult {
  if (!activities.length) return { current: 0, best: 0 };
  const weekSet = new Set<string>();
  for (const a of activities) {
    weekSet.add(activityIsoWeekKey(a));
  }
  const weeks = Array.from(weekSet).sort((a, b) => a.localeCompare(b)); // e.g., 2025-W01, 2025-W02

  let best = 1;
  let current = 1;

  for (let i = 1; i < weeks.length; i++) {
    if (isContiguousIsoWeek(weeks[i - 1], weeks[i])) {
      current += 1;
    } else {
      best = Math.max(best, current);
      current = 1;
    }
  }
  best = Math.max(best, current);

  // Determine if current week contains activity
  const now = new Date();
  const thisWeekKey = isoWeekKeyForDeviceDate(now);
  const lastWeekKey = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return isoWeekKeyForDeviceDate(d);
  })();
  const lastRecorded = weeks.at(-1)!;
  const adjustedCurrent =
    lastRecorded === thisWeekKey || lastRecorded === lastWeekKey ? current : 0;

  return { current: adjustedCurrent, best };
}

/**
 * Calculates current and best streaks of consecutive ISO weeks where the weekly goal is met.
 * - Uses `weeklyGoal` expression evaluated against activities grouped by ISO week.
 * - Handles year boundary contiguity.
 * - current streak is 0 if the last met week is older than last week.
 */
export function computeWeeklyGoalStreaks(
  activities: Activity[],
  weeklyGoalExpression: string
): StreakResult {
  if (!activities.length) return { current: 0, best: 0 };

  // Group activities by ISO week key
  const weekToActivities = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = activityIsoWeekKey(a);
    const arr = weekToActivities.get(key) || [];
    arr.push(a);
    weekToActivities.set(key, arr);
  }

  // Determine which weeks meet the goal
  const metWeeks = Array.from(weekToActivities.entries())
    .filter(([, acts]) => Boolean(evaluateGoal(weeklyGoalExpression, { activities: acts })))
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));

  if (metWeeks.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let current = 1;
  for (let i = 1; i < metWeeks.length; i++) {
    if (isContiguousIsoWeek(metWeeks[i - 1], metWeeks[i])) current += 1;
    else {
      best = Math.max(best, current);
      current = 1;
    }
  }
  best = Math.max(best, current);

  // Determine current streak recency
  const now = new Date();
  const thisWeekKey = isoWeekKeyForDeviceDate(now);
  const lastWeekKey = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return isoWeekKeyForDeviceDate(d);
  })();
  const lastRecorded = metWeeks.at(-1)!;
  const recencyActive = lastRecorded === thisWeekKey || lastRecorded === lastWeekKey;
  const adjustedCurrent = recencyActive ? current : 0;

  const result = { current: adjustedCurrent, best };

  logWeeklyGoalStreakDiagnostics(result, {
    metWeeks,
    weekToActivities,
    rawCurrentRun: current,
    thisWeekKey,
    lastWeekKey,
    recencyActive
  });

  return result;
}
