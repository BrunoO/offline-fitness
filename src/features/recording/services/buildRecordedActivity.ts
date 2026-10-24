import { week_of_year } from '@/shared/utils/utils';
import { deviceTimezoneLabel } from '@/features/activities/services/manualActivity';
import { trackBoundingBox } from '@/features/strava-import/services/gpxParser';
import type { Activity } from '@/shared/types/types';
import type { RecordingMeta } from './gpsTracker';
import type { ReplayResult } from './replaySession';

const profileToActivityType = (profile: string): string => {
  switch (profile) {
    case 'walking':
      return 'Walk';
    case 'running':
      return 'Run';
    case 'hiking':
      return 'Hike';
    case 'cycling':
      return 'Ride';
    case 'swimming':
      return 'Swim';
    default:
      return 'Run';
  }
};

const pad = (value: number): string => String(value).padStart(2, '0');

export interface BuildRecordedActivityArgs {
  meta: RecordingMeta;
  replay: ReplayResult;
  name: string;
}

/**
 * Builds the stored `Activity` record from a finished recording.
 *
 * It reuses `buildManualActivity`'s date/time helpers (`local_date`,
 * `utc_offset` at the instant, mislabeled-Z `start_date_local`,
 * `week_of_year`, `deviceTimezoneLabel`), so a recorded activity is
 * indistinguishable from an imported one everywhere downstream (map, stats,
 * calendar, export, WebDAV push).
 *
 * Swims are canonicalised at write time, not by the startup backfill:
 * `moving_time` follows `rowToActivity`'s rule (`elapsed_time`) and
 * `total_elevation_gain` is written as 0, matching `correctSwimElevationGain`.
 * Otherwise every recorded swim would be "fixed" by a backfill on the next
 * launch - a storage write per swim, and a backup push that disagrees with
 * the record until it happens.
 */
export function buildRecordedActivity(args: BuildRecordedActivityArgs): Activity {
  const { meta, replay, name } = args;
  const startUtcMs = meta.startedAtUtcMs;
  const type = profileToActivityType(meta.profile);
  const isSwim = type === 'Swim';

  const wallClock = new Date(startUtcMs);
  const year = wallClock.getFullYear();
  const month = wallClock.getMonth() + 1;
  const day = wallClock.getDate();
  const hour = wallClock.getHours();
  const minute = wallClock.getMinutes();
  const second = wallClock.getSeconds();

  const localDate = `${year}-${pad(month)}-${pad(day)}`;
  const localTime = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
  const utcOffsetSeconds = -Math.round(wallClock.getTimezoneOffset() * 60);

  const durationSec = replay.stats.elapsedTimeSec;
  const movingTime = isSwim ? durationSec : replay.stats.movingTimeSec;
  const elevationGain = isSwim ? 0 : replay.stats.elevationGainMeters;

  const latlng = replay.stream.latlng?.data ?? [];
  const altitude = replay.stream.altitude?.data ?? [];
  const startLatLng = latlng.length > 0 ? latlng[0] : [];
  const endLatLng = latlng.length > 0 ? latlng.at(-1)! : [];
  const boundingBox = trackBoundingBox(latlng);

  const elevHigh = altitude.length > 0 ? Math.max(...altitude) : 0;
  const elevLow = altitude.length > 0 ? Math.min(...altitude) : 0;

  const counter = meta.sessionId.split('-').pop() ?? '0';

  return {
    id: `recorded-${startUtcMs}-${counter}`,
    name: name.trim() || `${type} ${localTime.slice(0, 5)}`,
    start_date_local: `${localDate}T${localTime}Z`,
    local_date: localDate,
    local_time: localTime,
    start_date_utc: new Date(startUtcMs).toISOString(),
    start_timestamp_utc: startUtcMs,
    timezone: deviceTimezoneLabel(),
    start_year: year,
    start_month: month - 1,
    start_day: day,
    start_week: week_of_year(year, month - 1, day),
    distance: replay.stats.distanceMeters,
    elapsed_time: durationSec,
    moving_time: movingTime,
    type,
    average_speed: replay.stats.averageSpeedMetersPerSec,
    total_elevation_gain: elevationGain,
    average_heartrate: replay.stats.averageHeartRate,
    max_heartrate: replay.stats.maxHeartRate,
    elev_high: elevHigh,
    elev_low: elevLow,
    start_latlng: startLatLng,
    end_latlng: endLatLng,
    bounding_box: boundingBox,
    utc_offset: utcOffsetSeconds
  };
}
