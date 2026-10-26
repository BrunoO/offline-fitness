import { monthlyData2, weeklyData } from '@/features/stats/services/stats';
import { Activity } from '@/shared';
import { activityIsoWeekKey, isoWeekKeyFromLocalParts } from '@/shared/utils/isoWeek';
import { week_of_year } from '@/shared/utils/utils';

function makeActivity(
  id: string,
  start_date_local: string,
  type: string = 'Run',
  elapsed_time: number = 3600
): Activity {
  const datePart = start_date_local.split('T')[0];
  const timePart = (start_date_local.split('T')[1] || '').replace(/([+-]\d{2}:?\d{2}|Z)$/, '');
  const [year, month, day] = datePart.split('-').map(Number);
  // Derive the true UTC instant from the wall time minus the +02:00 offset,
  // mirroring Strava (local wall = UTC + offset).
  const wallMs = Date.parse(`${datePart}T${timePart}Z`);
  const start_date_utc = new Date(wallMs - 7200 * 1000).toISOString();
  return {
    id,
    name: id,
    type,
    distance: 5000,
    moving_time: elapsed_time,
    elapsed_time,
    average_speed: 3.3,
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

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localTimestamp(date: Date, time: string): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}

function lastMonday(from: Date): Date {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday - 7);
  return date;
}

describe('weeklyData ISO week alignment', () => {
  it('buckets Monday activities into the ISO week that contains that calendar date', () => {
    const monday = lastMonday(new Date());
    const mondayActivity = makeActivity(
      'monday-1',
      localTimestamp(monday, '08:00:00+02:00'),
      'Run',
      7200
    );
    const expectedWeek = week_of_year(monday.getFullYear(), monday.getMonth(), monday.getDate());

    expect(activityIsoWeekKey(mondayActivity)).toBe(
      isoWeekKeyFromLocalParts(monday.getFullYear(), monday.getMonth(), monday.getDate())
    );

    const weeks = weeklyData(['Run'], [mondayActivity], 4);
    const weekWithActivity = weeks.find(week =>
      week.activities.some(activity => activity.id === 'monday-1')
    );

    expect(weekWithActivity).toEqual(expect.objectContaining({ activities: expect.any(Array) }));
    expect(weekWithActivity!.start_week).toBe(expectedWeek);
  });

  it('keeps Sunday evening activity in the ISO week that contains that calendar date', () => {
    const monday = lastMonday(new Date());
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() - 1);
    const sundayYoga = makeActivity(
      'yoga-1',
      localTimestamp(sunday, '22:17:00+02:00'),
      'Yoga',
      1546
    );
    const expectedWeek = week_of_year(sunday.getFullYear(), sunday.getMonth(), sunday.getDate());

    expect(activityIsoWeekKey(sundayYoga)).toBe(
      isoWeekKeyFromLocalParts(sunday.getFullYear(), sunday.getMonth(), sunday.getDate())
    );

    const weeks = weeklyData(['Yoga'], [sundayYoga], 8);
    const weekWithYoga = weeks.find(week => week.start_week === expectedWeek);

    expect(weekWithYoga?.activities.some(activity => activity.id === 'yoga-1')).toBe(true);
  });

  it('keeps an uninitialised activity type and non-finite fields out of NaN in weeklyData and monthlyData2', () => {
    const monday = lastMonday(new Date());
    const knownRun = makeActivity('run-1', localTimestamp(monday, '08:00:00+02:00'), 'Run', 3600);
    const unknownSport = makeActivity(
      'skate-1',
      localTimestamp(monday, '10:00:00+02:00'),
      'Skateboard',
      1800
    );
    const brokenRun = {
      ...makeActivity('broken-1', localTimestamp(monday, '12:00:00+02:00'), 'Run', NaN),
      distance: NaN,
      total_elevation_gain: NaN
    };

    const weeks = weeklyData(['Run'], [knownRun, unknownSport, brokenRun], 4);
    for (const week of weeks) {
      for (const entry of week.summary) {
        expect(Number.isFinite(entry.value)).toBe(true);
      }
      for (const val of week.extraValues.values()) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }

    const weekWithActivities = weeks.find(week => week.activities.length > 0)!;
    expect(weekWithActivities.summary.find(s => s.type === 'Run')?.value).toBe(3600);
    expect(weekWithActivities.summary.find(s => s.type === 'Skateboard')?.value).toBe(1800);
    expect(weekWithActivities.extraValues.get('totalH')).toBe(5400);
    expect(weekWithActivities.extraValues.get('dist')).toBe(10000);

    const months = monthlyData2(
      [knownRun, brokenRun],
      a => a.distance,
      a => a.total_elevation_gain,
      3
    );
    for (const m of months) {
      expect(Number.isFinite(m.distance)).toBe(true);
      expect(Number.isFinite(m.elevation)).toBe(true);
      expect(Number.isFinite(m.time ?? 0)).toBe(true);
    }
  });
});
