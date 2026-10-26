import { Activity } from '@/shared';
import {
  activityIsoWeekKey,
  activityStoredWeekKey,
  isoWeekKeyFromDateString,
  isoWeekKeyFromLocalParts
} from '@/shared/utils/isoWeek';
import { week_of_year } from '@/shared/utils/utils';

function makeActivity(start_date_local: string, start_date_utc: string): Activity {
  const datePart = start_date_local.split('T')[0];
  const timePart = (start_date_local.split('T')[1] || '').replace(/([+-]\d{2}:?\d{2}|Z)$/, '');
  const [year, month, day] = datePart.split('-').map(Number);
  return {
    id: '1',
    name: 'Yoga',
    type: 'Yoga',
    distance: 0,
    moving_time: 1546,
    elapsed_time: 1546,
    average_speed: 0,
    elev_high: 0,
    elev_low: 0,
    end_latlng: [0, 0],
    start_latlng: [0, 0],
    start_date_local,
    start_date_utc,
    local_date: datePart,
    local_time: timePart,
    start_timestamp_utc: Date.parse(start_date_utc),
    timezone: '(GMT+02:00) Europe/Paris',
    start_day: day,
    start_month: month - 1,
    start_week: week_of_year(year, month - 1, day),
    start_year: year,
    total_elevation_gain: 0,
    bounding_box: undefined,
    utc_offset: 7200
  };
}

describe('isoWeek activity bucketing', () => {
  it('keeps Sunday evening Yoga in ISO week 19 using the local date prefix', () => {
    // 2026-05-10 is Sunday — last day of ISO week 2026-W19 (Mon May 4 – Sun May 10)
    const yoga = makeActivity('2026-05-10T22:17:00+02:00', '2026-05-10T20:17:00Z');
    expect(activityIsoWeekKey(yoga)).toBe('2026-W19');
    expect(isoWeekKeyFromLocalParts(2026, 4, 11)).toBe('2026-W20');
  });

  it('does not shift the day when the time suffix uses a Z UTC marker', () => {
    const yoga = makeActivity('2026-05-10T22:17:00Z', '2026-05-10T20:17:00Z');
    expect(activityIsoWeekKey(yoga)).toBe('2026-W19');
  });

  it('uses the date prefix for calendar day lookup, ignoring time suffix', () => {
    expect(isoWeekKeyFromDateString('2026-05-10T22:17:00+02:00')).toBe('2026-W19');
    expect(isoWeekKeyFromDateString('2026-05-10T12:00:00')).toBe('2026-W19');
  });

  it('assigns Monday after midnight to the next ISO week', () => {
    // Note: true UTC instant is still Sunday May 10 — only the local day is Monday.
    const monday = makeActivity('2026-05-11T00:30:00+02:00', '2026-05-10T22:30:00Z');
    expect(activityIsoWeekKey(monday)).toBe('2026-W20');
  });

  it('aligns activityStoredWeekKey with activityIsoWeekKey on Jan 1-3 belonging to previous ISO year (W52/W53)', () => {
    // Sunday 2023-01-01 belongs to 2022-W52; Friday 2021-01-01 belongs to 2020-W53
    const jan2023 = makeActivity('2023-01-01T10:00:00+01:00', '2023-01-01T09:00:00Z');
    expect(activityIsoWeekKey(jan2023)).toBe('2022-W52');
    expect(activityStoredWeekKey(jan2023)).toBe('2022-W52');

    const jan2021 = makeActivity('2021-01-01T10:00:00+01:00', '2021-01-01T09:00:00Z');
    expect(activityIsoWeekKey(jan2021)).toBe('2020-W53');
    expect(activityStoredWeekKey(jan2021)).toBe('2020-W53');
  });

  it('aligns activityStoredWeekKey with activityIsoWeekKey on Dec 29-31 belonging to next ISO year (W01)', () => {
    // Monday 2025-12-29 belongs to 2026-W01
    const dec2025 = makeActivity('2025-12-29T10:00:00+01:00', '2025-12-29T09:00:00Z');
    expect(activityIsoWeekKey(dec2025)).toBe('2026-W01');
    expect(activityStoredWeekKey(dec2025)).toBe('2026-W01');
  });
});
