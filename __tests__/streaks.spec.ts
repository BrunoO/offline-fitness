import { Activity } from '@/shared';
import { simpleLogger } from '@/shared/services/SimpleLogger';
import { makeTestActivity } from './helpers/testActivities';
import {
  computeDayStreaks,
  computeWeekStreaks,
  computeWeeklyGoalStreaks
} from '@/shared/services/streaks';
import { lastWeeksFrom } from '@/shared/utils/utils';

jest.mock('@/shared/services/SimpleLogger', () => ({
  simpleLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

function makeActivity(id: number, iso: string): Activity {
  return makeTestActivity({
    id: String(id),
    name: 'a' + id,
    start_date_utc: iso,
    utc_offset: 0,
    timezone: '(GMT+00:00) UTC',
    distance: 1000,
    moving_time: 300,
    elapsed_time: 300,
    total_elevation_gain: 0
  });
}

describe('streaks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes day streaks: simple consecutive days', () => {
    const base = new Date('2025-01-10T10:00:00Z');
    const days = [0, 1, 2, 4].map((add, idx) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + add);
      return makeActivity(idx + 1, d.toISOString());
    });
    const res = computeDayStreaks(days);
    // last two are separated by 2 days -> current = 0 or 1 depending on proximity logic, best = 3
    expect(res.best).toBe(3);
  });

  it('computes day streaks: current streak when last day is today or yesterday', () => {
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    const acts = [makeActivity(1, yest.toISOString()), makeActivity(2, today.toISOString())];
    const res = computeDayStreaks(acts);
    expect(res.current).toBeGreaterThanOrEqual(2);
    expect(res.best).toBeGreaterThanOrEqual(2);
  });

  it('computes week streaks across year boundary (W52 -> W01)', () => {
    const a = makeActivity(1, '2024-12-29T10:00:00Z'); // likely ISO W52
    const b = makeActivity(2, '2025-01-05T10:00:00Z'); // likely ISO W01 next year
    const res = computeWeekStreaks([a, b]);
    expect(res.best).toBeGreaterThanOrEqual(2);
  });

  it('computes weekly goal streaks with simple goal sum("distance") > 0', () => {
    const a = makeActivity(1, '2025-01-05T10:00:00Z');
    const b = makeActivity(2, '2025-01-06T10:00:00Z');
    const c = makeActivity(3, '2025-01-13T10:00:00Z');
    // Two consecutive ISO weeks with activities
    const res = computeWeeklyGoalStreaks([a, b, c], 'sum("distance") > 0');
    expect(res.best).toBeGreaterThanOrEqual(2);
  });

  it.each([35, 52, 60])(
    'counts %i consecutive ISO weeks meeting the weekly goal',
    (count: number) => {
      const weeks = lastWeeksFrom(new Date(), count);
      const activities = weeks.map((week, index) =>
        makeActivity(index + 1, week.weekIsoDate.toISOString())
      );

      const res = computeWeeklyGoalStreaks(activities, 'sum("distance") > 0');
      expect(res.current).toBe(count);
      expect(res.best).toBe(count);
    }
  );

  it('resets weekly goal streak when a week with activity fails the goal', () => {
    const weeks = lastWeeksFrom(new Date(), 5);
    const activities = weeks.map((week, index) => {
      const iso = week.weekIsoDate.toISOString();
      // Fail the goal in the middle week only
      const distance = index === 2 ? 0 : 5000;
      return { ...makeActivity(index + 1, iso), distance };
    });

    const res = computeWeeklyGoalStreaks(activities, 'sum("distance") > 0');
    expect(res.current).toBe(2);
    expect(res.best).toBe(2);
  });

  it('resets weekly goal streak when an ISO week has no activities', () => {
    const weeks = lastWeeksFrom(new Date(), 5);
    const activities = weeks
      .filter((_, index) => index !== 2)
      .map((week, index) => makeActivity(index + 1, week.weekIsoDate.toISOString()));

    const res = computeWeeklyGoalStreaks(activities, 'sum("distance") > 0');
    expect(res.current).toBe(2);
    expect(res.best).toBe(2);
  });

  it('logs streak gap diagnostics when an ISO week breaks the run', () => {
    const weeks = lastWeeksFrom(new Date(), 5);
    const activities = weeks
      .filter((_, index) => index !== 2)
      .map((week, index) => makeActivity(index + 1, week.weekIsoDate.toISOString()));

    computeWeeklyGoalStreaks(activities, 'sum("distance") > 0');

    expect(simpleLogger.log).toHaveBeenCalledWith(
      'Weekly goal streak diagnostics',
      expect.objectContaining({
        recentBreaks: expect.arrayContaining([
          expect.objectContaining({
            reason: 'no_activities'
          })
        ])
      })
    );
  });
});
