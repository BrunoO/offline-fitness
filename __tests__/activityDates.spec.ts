import {
  activityDayOfYear,
  activityLocalDate,
  activityLocalTime,
  activityUtcMs,
  compareActivitiesByUtcDesc,
  dayOfYearFromParts,
  deviceTodayLocalDateString,
  formatActivityLocalDateTime,
  localDateToDayNumber,
  toLocalDateString
} from '@/shared/utils/activityDates';
import { makeTestActivity } from './helpers/testActivities';

describe('activityDates helpers', () => {
  it('reads local_date / timestamp directly on migrated activities', () => {
    const a = makeTestActivity({
      start_date_utc: '2023-02-25T15:14:44Z',
      utc_offset: 3600
    });
    expect(activityLocalDate(a)).toBe('2023-02-25');
    expect(activityLocalTime(a)).toBe('16:14:44');
    expect(activityUtcMs(a)).toBe(Date.parse('2023-02-25T15:14:44Z'));
    expect(formatActivityLocalDateTime(a)).toBe('2023-02-25 16:14:44');
  });

  it('keeps a midnight-crossing local day distinct from its UTC day', () => {
    // 00:30 in Paris is still the previous day in UTC.
    const a = makeTestActivity({
      start_date_utc: '2023-02-25T23:30:00Z',
      utc_offset: 3600
    });
    expect(activityLocalDate(a)).toBe('2023-02-26');
    expect(activityDayOfYear(a)).toBe(dayOfYearFromParts(2023, 1, 26));
  });

  it('computes leap-aware day-of-year without Date', () => {
    expect(dayOfYearFromParts(2023, 0, 1)).toBe(1);
    expect(dayOfYearFromParts(2023, 11, 31)).toBe(365);
    expect(dayOfYearFromParts(2024, 1, 29)).toBe(60);
    expect(dayOfYearFromParts(2024, 11, 31)).toBe(366);
    expect(dayOfYearFromParts(2023, 1, 28)).toBe(59);
  });

  it('measures whole-day consecutiveness across a DST change', () => {
    // US DST 2024-03-10: a 23h "day" still counts as consecutive.
    expect(localDateToDayNumber('2024-03-11') - localDateToDayNumber('2024-03-10')).toBe(1);
    expect(localDateToDayNumber('2024-03-10') - localDateToDayNumber('2024-03-08')).toBe(2);
  });

  it('sorts by true UTC instant, not wall-clock order', () => {
    // Travel: later wall-clock time but earlier true instant.
    const parisEvening = makeTestActivity({
      id: 'p',
      start_date_utc: '2023-02-25T20:00:00Z',
      utc_offset: 3600
    }); // 21:00 Paris
    const nycAfternoon = makeTestActivity({
      id: 'n',
      start_date_utc: '2023-02-25T21:00:00Z',
      utc_offset: -5 * 3600
    }); // 16:00 NYC
    expect(compareActivitiesByUtcDesc(parisEvening, nycAfternoon)).toBeGreaterThan(0);
    expect(compareActivitiesByUtcDesc(nycAfternoon, parisEvening)).toBeLessThan(0);
  });

  it('formats device-local dates as YYYY-MM-DD', () => {
    // Constructed with local parts — no TZ ambiguity.
    const d = new Date(2023, 1, 25, 12, 0, 0);
    expect(deviceTodayLocalDateString(d)).toBe('2023-02-25');
    expect(toLocalDateString(d)).toBe('2023-02-25');
  });
});
