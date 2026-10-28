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
  distanceOverrideMeters?: number;
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
const resolveDistanceAndSpeed = (
  replay: ReplayResult,
  movingTimeSec: number,
  distanceOverrideMeters?: number
): { distanceMeters: number; averageSpeed: number } => {
  if (
    typeof distanceOverrideMeters === 'number' &&
    Number.isFinite(distanceOverrideMeters) &&
    distanceOverrideMeters >= 0
  ) {
    return {
      distanceMeters: distanceOverrideMeters,
      averageSpeed: movingTimeSec > 0 ? distanceOverrideMeters / movingTimeSec : 0
    };
  }
  return {
    distanceMeters: replay.stats.distanceMeters,
    averageSpeed: replay.stats.averageSpeedMetersPerSec
  };
};

function findMinMaxAltitude(altitude: readonly number[]): { elevHigh: number; elevLow: number } {
  if (altitude.length === 0) {
    return { elevHigh: 0, elevLow: 0 };
  }
  let elevHigh = altitude[0];
  let elevLow = altitude[0];
  for (let i = 1; i < altitude.length; i++) {
    const a = altitude[i];
    if (a > elevHigh) elevHigh = a;
    if (a < elevLow) elevLow = a;
  }
  return { elevHigh, elevLow };
}

const extractStreamGeometry = (replay: ReplayResult) => {
  const latlng = replay.stream.latlng?.data ?? [];
  const altitude = replay.stream.altitude?.data ?? [];
  const { elevHigh, elevLow } = findMinMaxAltitude(altitude);
  return {
    startLatLng: latlng.length > 0 ? latlng[0] : [],
    endLatLng: latlng.length > 0 ? latlng.at(-1)! : [],
    boundingBox: trackBoundingBox(latlng),
    elevHigh,
    elevLow
  };
};

export function buildRecordedActivity(args: BuildRecordedActivityArgs): Activity {
  const { meta, replay, name, distanceOverrideMeters } = args;
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
  const { distanceMeters, averageSpeed } = resolveDistanceAndSpeed(
    replay,
    movingTime,
    distanceOverrideMeters
  );
  const { startLatLng, endLatLng, boundingBox, elevHigh, elevLow } = extractStreamGeometry(replay);

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
    distance: distanceMeters,
    elapsed_time: durationSec,
    moving_time: movingTime,
    type,
    average_speed: averageSpeed,
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
