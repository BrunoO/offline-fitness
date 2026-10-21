import { Activity } from '@/shared/types/types';
import { week_of_year } from '@/shared/utils/utils';

export interface TestActivityInput {
  id?: string;
  name?: string;
  type?: string;
  /** True UTC instant, e.g. "2023-02-25T15:14:44Z". */
  start_date_utc?: string;
  /** Seconds added to UTC to get athlete-local wall time. */
  utc_offset?: number;
  timezone?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
}

/**
 * Builds a realistic Activity mirroring Strava semantics:
 * `start_date_local` is athlete-local wall time (UTC + offset) mislabeled
 * with a Z suffix, `start_date_utc` is the true instant, and the derived
 * `local_date` / `local_time` / `start_timestamp_utc` fields match what the
 * archive importer produces from `activities.csv`.
 */
export function makeTestActivity(input: TestActivityInput = {}): Activity {
  const {
    id = '1',
    name = `Activity ${id}`,
    type = 'Run',
    start_date_utc = '2023-02-25T15:14:44Z',
    utc_offset = 3600,
    timezone = '(GMT+01:00) Europe/Paris',
    distance = 5000,
    moving_time = 1800,
    elapsed_time = 1800,
    total_elevation_gain = 50
  } = input;

  const utcMs = Date.parse(start_date_utc);
  const wall = new Date(utcMs + utc_offset * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth();
  const day = wall.getUTCDate();
  const local_date = `${year}-${pad(month + 1)}-${pad(day)}`;
  const local_time = `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(
    wall.getUTCSeconds()
  )}`;

  return {
    id,
    name,
    type,
    distance,
    moving_time,
    elapsed_time,
    average_speed: moving_time > 0 ? distance / moving_time : 0,
    elev_high: 100,
    elev_low: 50,
    end_latlng: [0, 0],
    start_latlng: [0, 0],
    start_date_local: `${local_date}T${local_time}Z`,
    start_date_utc,
    local_date,
    local_time,
    start_timestamp_utc: utcMs,
    timezone,
    start_day: day,
    start_month: month,
    start_week: week_of_year(year, month, day),
    start_year: year,
    total_elevation_gain,
    utc_offset,
    bounding_box: undefined
  };
}
