import { computeAnnualConsistencyStats } from '@/features/stats/services/consistencyStats';
import { makeTestActivity } from '../helpers/testActivities';

describe('consistencyStats', () => {
  const fakeNow = new Date('2024-07-01T12:00:00Z'); // Day ~183 of leap year 2024

  const activities = [
    // 2023 activities:
    // Jan 1, Jan 2, Jan 3 (streak of 3)
    makeTestActivity({
      id: '1',
      type: 'Run',
      start_date_utc: '2023-01-01T08:00:00Z'
    }),
    makeTestActivity({
      id: '2',
      type: 'Run',
      start_date_utc: '2023-01-02T08:00:00Z'
    }),
    makeTestActivity({
      id: '3',
      type: 'Ride',
      start_date_utc: '2023-01-03T08:00:00Z'
    }),
    // Multiple activities on Jan 3
    makeTestActivity({
      id: '4',
      type: 'Yoga',
      start_date_utc: '2023-01-03T18:00:00Z'
    }),
    // Jan 10
    makeTestActivity({
      id: '5',
      type: 'Run',
      start_date_utc: '2023-01-10T08:00:00Z'
    }),

    // 2024 activities (current year):
    // June 1, June 2, June 3, June 4 (streak of 4)
    makeTestActivity({
      id: '6',
      type: 'Ride',
      start_date_utc: '2024-06-01T08:00:00Z'
    }),
    makeTestActivity({
      id: '7',
      type: 'Ride',
      start_date_utc: '2024-06-02T08:00:00Z'
    }),
    makeTestActivity({
      id: '8',
      type: 'Run',
      start_date_utc: '2024-06-03T08:00:00Z'
    }),
    makeTestActivity({
      id: '9',
      type: 'Run',
      start_date_utc: '2024-06-04T08:00:00Z'
    })
  ];

  it('aggregates active days, workouts, and streaks across all sports', () => {
    const stats = computeAnnualConsistencyStats(activities, 'All', fakeNow);
    expect(stats).toHaveLength(2);

    const y2023 = stats[0];
    expect(y2023.year).toBe(2023);
    // Jan 1, 2, 3, 10 = 4 active days
    expect(y2023.activeDays).toBe(4);
    expect(y2023.totalDays).toBe(365);
    expect(y2023.activeDaysPercent).toBeCloseTo((4 / 365) * 100);
    // 5 total workouts (2 on Jan 3)
    expect(y2023.totalWorkouts).toBe(5);
    // Longest streak was Jan 1..3 = 3 days
    expect(y2023.longestStreakDays).toBe(3);
    expect(y2023.isCurrentYear).toBe(false);

    const y2024 = stats[1];
    expect(y2024.year).toBe(2024);
    // June 1, 2, 3, 4 = 4 active days
    expect(y2024.activeDays).toBe(4);
    expect(y2024.isCurrentYear).toBe(true);
    // 2024 elapsed days up to July 1
    expect(y2024.totalDays).toBe(183);
    expect(y2024.activeDaysPercent).toBeCloseTo((4 / 183) * 100);
    expect(y2024.longestStreakDays).toBe(4);
  });

  it('filters by a specific sport when requested', () => {
    const runStats = computeAnnualConsistencyStats(activities, 'Run', fakeNow);
    expect(runStats).toHaveLength(2);

    const y2023 = runStats[0];
    // In 2023: Run was on Jan 1, Jan 2, Jan 10 (Jan 3 was Ride+Yoga)
    expect(y2023.activeDays).toBe(3);
    expect(y2023.totalWorkouts).toBe(3);
    // Streak: Jan 1 & Jan 2 = 2 days
    expect(y2023.longestStreakDays).toBe(2);

    const y2024 = runStats[1];
    // In 2024: Run was on June 3 and June 4
    expect(y2024.activeDays).toBe(2);
    expect(y2024.longestStreakDays).toBe(2);
  });

  it('returns an empty array when activities are empty', () => {
    const stats = computeAnnualConsistencyStats([], 'All', fakeNow);
    expect(stats).toHaveLength(0);
  });
});
