import { calculateYTDStats } from '@/features/stats/services/ytd-stats';
import { Activity } from '@/shared';
import {
  activityDayOfYear,
  activityLocalDate,
  compareActivitiesByUtcDesc,
  formatActivityLocalDateTime
} from '@/shared/utils/activityDates';
import { activityIsoWeekKey } from '@/shared/utils/isoWeek';
import { computeDayStreaks } from '@/shared/services/streaks';
import { makeTestActivity } from './helpers/testActivities';

/**
 * Timezone-shift regressions (the Strava date bug).
 *
 * Strava `start_date_local` is athlete-local wall time mislabeled with Z, so
 * any `new Date(start_date_local).get*()` result depends on the DEVICE
 * timezone. All assertions below target the ATHLETE-local answer and must
 * hold under any device zone — verify with:
 *
 *   TZ=America/New_York npx jest __tests__/dates-timezone.spec.ts
 *   TZ=Pacific/Auckland npx jest __tests__/dates-timezone.spec.ts
 *   TZ=Pacific/Kiritimati npx jest __tests__/dates-timezone.spec.ts
 *
 * (Node reads TZ at process start; runtime `process.env.TZ` switches are
 * unreliable inside jest, so the zone loop lives outside the suite.)
 */

// Midnight-crossing Paris activity: 00:30 local Feb 26 == 23:30 UTC Feb 25.
const MIDNIGHT_UTC = '2023-02-25T23:30:00Z';

describe('device-timezone-independent date handling', () => {
  it('buckets the midnight-crossing activity on its athlete-local day', () => {
    const activity = makeTestActivity({ start_date_utc: MIDNIGHT_UTC, utc_offset: 3600 });
    expect(activityLocalDate(activity)).toBe('2023-02-26');
    expect(activityDayOfYear(activity)).toBe(31 + 26);
    expect(formatActivityLocalDateTime(activity)).toBe('2023-02-26 00:30:00');
    // Feb 26 2023 is a Sunday — last day of ISO week 2023-W08.
    expect(activityIsoWeekKey(activity)).toBe('2023-W08');
  });

  it('keeps day streaks stable across consecutive local days', () => {
    // 23:00 UTC + 1h offset = 00:00 local the next day.
    const days = ['2023-02-23T23:00:00Z', '2023-02-24T23:00:00Z', '2023-02-25T23:00:00Z'].map(
      (utc, i) =>
        makeTestActivity({ id: String(i), start_date_utc: utc, utc_offset: 3600 }) as Activity
    );
    expect(days.map(activityLocalDate)).toEqual(['2023-02-24', '2023-02-25', '2023-02-26']);
    expect(computeDayStreaks(days).best).toBe(3);
  });

  it('collapses two activities on one local day split across UTC days', () => {
    // 00:30 local Feb 25 == 23:30 UTC Feb 24; 23:45 local Feb 25 == 22:45 UTC Feb 25.
    // Device-TZ bucketing (the old bug) counts 2 days; athlete-local is 1 day.
    const early = makeTestActivity({
      id: 'e',
      start_date_utc: '2023-02-24T23:30:00Z',
      utc_offset: 3600
    });
    const late = makeTestActivity({
      id: 'l',
      start_date_utc: '2023-02-25T22:45:00Z',
      utc_offset: 3600
    });
    expect(activityLocalDate(early)).toBe('2023-02-25');
    expect(activityLocalDate(late)).toBe('2023-02-25');
    expect(computeDayStreaks([early, late]).best).toBe(1);
  });

  it('sorts travel activities by true instant regardless of wall clock', () => {
    const parisEvening = makeTestActivity({
      id: 'p',
      start_date_utc: '2023-02-25T20:00:00Z',
      utc_offset: 3600
    });
    const nycAfternoon = makeTestActivity({
      id: 'n',
      start_date_utc: '2023-02-25T21:00:00Z',
      utc_offset: -5 * 3600
    });
    const sorted = [parisEvening, nycAfternoon].sort(compareActivitiesByUtcDesc);
    expect(sorted.map(a => a.id)).toEqual(['n', 'p']);
  });

  it('attributes YTD totals to the athlete-local day', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2023-06-01T12:00:00Z'));
      const crossing = makeTestActivity({
        id: 'c',
        start_date_utc: MIDNIGHT_UTC,
        utc_offset: 3600,
        distance: 8000,
        moving_time: 1800,
        elapsed_time: 1800
      });
      const stats = calculateYTDStats([crossing]);
      expect(stats.currentYear.totalDistance).toBe(8000);
      expect(stats.currentYear.totalActivities).toBe(1);
      // Feb 26 is day 57 of 2023; cumulative distance must appear from day 57.
      expect(stats.currentYear.data[57 - 1].distance).toBe(8);
      expect(stats.currentYear.data[57 - 2].distance).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
