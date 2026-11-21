import { Activity, ActivityStream, LatLng } from '@/shared/types/types';
import { calculateBoundingBox, week_of_year } from '@/shared/utils/utils';
import { isNoGpsActivity } from '@/shared/utils/activityCategories';
import { haversineDistance } from '@/features/maps';
import { utcToLocalParts } from '@/features/strava-import';
import { deviceTimezoneLabel } from './manualActivity';
import type { StreamSet } from '../types/stravaActivityStream.model';
import type { EncodableStreamSeries, EncodableStreamSet } from '@/shared/services/streamCodec';

export interface ActivityMetadataPatch {
  name?: string;
  type?: string;
  durationSec?: number;
  distanceMeters?: number;
  totalElevationGainM?: number;
}

export interface CutPointMetrics {
  index: number;
  elapsedSec: number;
  wallClockTime: string;
  coordinate: LatLng | null;
  altitudeM: number | null;
  heartRateBpm: number | null;
  speedKmh: number | null;
}

export interface TrimPreviewResult {
  distanceMeters: number;
  elapsedTimeSec: number;
  movingTimeSec: number;
  elevationGainM: number;
  averageSpeedMps: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  deltaDistanceMeters: number;
  deltaElapsedTimeSec: number;
}

export interface TrimmedStreamResult {
  updatedActivity: Activity;
  trimmedStream: EncodableStreamSet;
}

export interface TrimPreviewStreams {
  keptStream: ActivityStream;
  cutStream?: ActivityStream;
  cutTailStream?: ActivityStream;
  activeCoordinate: LatLng | null;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** Minimum stationary speed threshold (m/s) per sport profile. */
const STATIONARY_SPEED_BY_TYPE: Record<string, number> = {
  cycling: 0.8,
  ride: 0.8,
  ebikeride: 0.8,
  virtualride: 0.8,
  running: 0.5,
  run: 0.5,
  virtualrun: 0.5,
  trailrun: 0.5,
  walking: 0.4,
  walk: 0.4,
  hiking: 0.3,
  hike: 0.3,
  swimming: 0.2,
  swim: 0.2
};

export function getStationarySpeedThreshold(activityType: string): number {
  return STATIONARY_SPEED_BY_TYPE[activityType.toLowerCase()] ?? 0.4;
}

/**
 * Extracts a valid IANA timezone identifier from an activity timezone field.
 * Handles Strava format like "(GMT+01:00) Europe/Paris" or plain "Europe/Paris".
 * Avoids regular expression backtracking.
 */
export function extractIanaTimezone(tz: string | undefined): string {
  if (!tz) return deviceTimezoneLabel();
  const closingParen = tz.lastIndexOf(')');
  const candidate = (closingParen >= 0 ? tz.slice(closingParen + 1) : tz).trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return deviceTimezoneLabel();
  }
}

/**
 * Calculates elevation gain with canonical 1.5 m deadband hysteresis.
 * Replicates the barometric / stream hysteresis used across analytics and recording.
 */
export function computeElevationHysteresisGain(altitudes: readonly number[]): number {
  if (altitudes.length < 2) return 0;
  let sumGain = 0;
  const HYSTERESIS_THRESHOLD = 1.5;
  let anchor = altitudes[0];

  for (let i = 1; i < altitudes.length; i++) {
    const y = altitudes[i];
    const delta = y - anchor;
    if (delta >= HYSTERESIS_THRESHOLD) {
      sumGain += delta;
      anchor = y;
    } else if (delta <= -HYSTERESIS_THRESHOLD) {
      anchor = y;
    }
  }

  return Math.round(sumGain);
}

/**
 * Applies a metadata patch to an activity (ONT-DOM-06).
 * Enforces ONT-DOM-05 for Swim (moving_time = elapsed_time, elevation = 0)
 * and recalculates average_speed on duration or distance edits.
 */
export function applyActivityMetadataPatch(
  activity: Activity,
  patch: ActivityMetadataPatch
): Activity {
  const nextType = patch.type !== undefined ? patch.type.trim() : activity.type;
  const isSwim = nextType.toLowerCase() === 'swim';
  const isNoGps = isNoGpsActivity(nextType);

  const nextName = patch.name !== undefined ? patch.name.trim() : activity.name;

  let nextElapsedTime = activity.elapsed_time;
  if (patch.durationSec !== undefined) {
    nextElapsedTime = Math.max(1, Math.round(patch.durationSec));
  }

  let nextMovingTime = activity.moving_time;
  if (isSwim) {
    nextMovingTime = nextElapsedTime;
  } else if (patch.durationSec !== undefined) {
    nextMovingTime = Math.min(activity.moving_time, nextElapsedTime);
    if (nextMovingTime <= 0) nextMovingTime = nextElapsedTime;
  }

  let nextDistance = activity.distance;
  if (patch.distanceMeters !== undefined) {
    nextDistance = isNoGps ? 0 : Math.max(0, Math.round(patch.distanceMeters));
  }

  let nextElevation = activity.total_elevation_gain;
  if (isSwim) {
    nextElevation = 0;
  } else if (patch.totalElevationGainM !== undefined) {
    nextElevation = Math.max(0, Math.round(patch.totalElevationGainM));
  }

  const activeTime = nextMovingTime > 0 ? nextMovingTime : nextElapsedTime;
  const nextAverageSpeed = activeTime > 0 ? nextDistance / activeTime : 0;

  return {
    ...activity,
    name: nextName,
    type: nextType,
    elapsed_time: nextElapsedTime,
    moving_time: nextMovingTime,
    distance: nextDistance,
    total_elevation_gain: nextElevation,
    average_speed: nextAverageSpeed
  };
}

function wrapSeries<T>(data: T, count: number): EncodableStreamSeries<T> {
  return {
    data,
    series_type: 'distance',
    original_size: count,
    resolution: 'high'
  };
}

export function getStreamTotalPoints(rawStream: StreamSet): number {
  if (rawStream.time?.data) return rawStream.time.data.length;
  if (rawStream.latlng?.data) return rawStream.latlng.data.length;
  if (rawStream.heartrate?.data) return rawStream.heartrate.data.length;
  return 0;
}

function computeInstantaneousSpeed(
  rawStream: StreamSet,
  clampedIndex: number,
  totalPoints: number
): number | null {
  if (rawStream.velocity_smooth?.data?.[clampedIndex] !== undefined) {
    return Math.round(rawStream.velocity_smooth.data[clampedIndex] * 3.6 * 10) / 10;
  }
  const rawLatLng = rawStream.latlng?.data;
  const rawTime = rawStream.time?.data;
  if (!rawLatLng || !rawTime || totalPoints < 2) {
    return null;
  }

  const prevIdx = clampedIndex > 0 ? clampedIndex - 1 : clampedIndex;
  const nextIdx = clampedIndex < totalPoints - 1 ? clampedIndex + 1 : clampedIndex;
  if (prevIdx === nextIdx) return 0;

  const p1 = rawLatLng[prevIdx];
  const p2 = rawLatLng[nextIdx];
  const t1 = rawTime[prevIdx];
  const t2 = rawTime[nextIdx];
  const dist = haversineDistance(
    { latitude: p1[0], longitude: p1[1] },
    { latitude: p2[0], longitude: p2[1] }
  );
  const dt = Math.abs(t2 - t1);
  return dt > 0 ? Math.round((dist / dt) * 3.6 * 10) / 10 : 0;
}

/**
 * Computes telemetry at an exact stream point index for live scrubber feedback.
 */
export function computeCutPointMetrics(
  rawStream: StreamSet,
  index: number,
  activity: Activity
): CutPointMetrics {
  const totalPoints = getStreamTotalPoints(rawStream);
  const clampedIndex = Math.max(0, Math.min(index, Math.max(0, totalPoints - 1)));
  const elapsedSec = rawStream.time?.data?.[clampedIndex] ?? 0;

  const instantMs = activity.start_timestamp_utc + elapsedSec * 1000;
  const tz = extractIanaTimezone(activity.timezone);
  const local = utcToLocalParts(instantMs, tz);
  const wallClockTime = `${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}`;

  const rawCoord = rawStream.latlng?.data?.[clampedIndex];
  const coordinate: LatLng | null = rawCoord
    ? { latitude: rawCoord[0], longitude: rawCoord[1] }
    : null;

  const altitudeM = rawStream.altitude?.data?.[clampedIndex] ?? null;
  const rawHr = rawStream.heartrate?.data?.[clampedIndex];
  const heartRateBpm = rawHr !== null && rawHr !== undefined && rawHr > 0 ? rawHr : null;

  return {
    index: clampedIndex,
    elapsedSec,
    wallClockTime,
    coordinate,
    altitudeM,
    heartRateBpm,
    speedKmh: computeInstantaneousSpeed(rawStream, clampedIndex, totalPoints)
  };
}

function sliceTimeAndShiftTemporal(
  activity: Activity,
  rawTime: readonly number[] | undefined,
  validStart: number,
  validEnd: number,
  count: number,
  totalPoints: number
) {
  let rebasedTime: number[];
  let timeOffsetSec = 0;
  if (rawTime && rawTime.length >= totalPoints) {
    timeOffsetSec = rawTime[validStart] ?? 0;
    rebasedTime = rawTime.slice(validStart, validEnd + 1).map(t => Math.max(0, t - timeOffsetSec));
  } else {
    rebasedTime = Array.from({ length: count }, (_, i) => i);
  }

  const newStartUtcMs = activity.start_timestamp_utc + timeOffsetSec * 1000;
  const newStartDateUtc = new Date(newStartUtcMs).toISOString();
  const tz = extractIanaTimezone(activity.timezone);
  const local = utcToLocalParts(newStartUtcMs, tz);
  const localDate = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
  const localTime = `${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}`;

  return {
    rebasedTime,
    newStartUtcMs,
    newStartDateUtc,
    localDate,
    localTime,
    startDateLocal: `${localDate}T${localTime}Z`,
    startYear: local.year,
    startMonth: local.month - 1,
    startDay: local.day,
    startWeek: week_of_year(local.year, local.month - 1, local.day),
    utcOffsetSeconds: local.utcOffsetSeconds
  };
}

function sliceGpsCoordinates(
  rawLatLng: readonly [number, number][] | undefined,
  validStart: number,
  validEnd: number,
  count: number,
  totalPoints: number,
  activity: Activity
) {
  if (!rawLatLng || rawLatLng.length < totalPoints) {
    return {
      slicedLatLng: undefined,
      distanceMeters: activity.distance,
      startLatLng: activity.start_latlng,
      endLatLng: activity.end_latlng,
      boundingBox: activity.bounding_box
    };
  }

  const slicedLatLng = rawLatLng.slice(validStart, validEnd + 1);
  const startLatLng = slicedLatLng[0] ? [slicedLatLng[0][0], slicedLatLng[0][1]] : [];
  const endLatLng = slicedLatLng[count - 1]
    ? [slicedLatLng[count - 1][0], slicedLatLng[count - 1][1]]
    : [];

  let cumDist = 0;
  for (let i = 1; i < count; i++) {
    const p1 = slicedLatLng[i - 1];
    const p2 = slicedLatLng[i];
    cumDist += haversineDistance(
      { latitude: p1[0], longitude: p1[1] },
      { latitude: p2[0], longitude: p2[1] }
    );
  }
  const coords: LatLng[] = slicedLatLng.map(p => ({ latitude: p[0], longitude: p[1] }));

  return {
    slicedLatLng,
    distanceMeters: Math.round(cumDist),
    startLatLng,
    endLatLng,
    boundingBox: calculateBoundingBox(coords)
  };
}

function computeMovingTime(
  activityType: string,
  slicedLatLng: readonly [number, number][] | undefined,
  rebasedTime: readonly number[],
  elapsedTimeSec: number,
  count: number
): number {
  if (activityType.toLowerCase() === 'swim') {
    return elapsedTimeSec;
  }
  if (!slicedLatLng || slicedLatLng.length < 2) {
    return elapsedTimeSec;
  }

  const vMin = getStationarySpeedThreshold(activityType);
  let movingSum = 0;
  for (let i = 1; i < count; i++) {
    const dt = rebasedTime[i] - rebasedTime[i - 1];
    if (dt > 0 && dt <= 30) {
      const p1 = slicedLatLng[i - 1];
      const p2 = slicedLatLng[i];
      const stepDist = haversineDistance(
        { latitude: p1[0], longitude: p1[1] },
        { latitude: p2[0], longitude: p2[1] }
      );
      if (stepDist / dt >= vMin) {
        movingSum += dt;
      }
    }
  }
  return Math.min(elapsedTimeSec, Math.max(1, Math.round(movingSum)));
}

function sliceAltitudeData(
  isSwim: boolean,
  rawAltitude: readonly number[] | undefined,
  validStart: number,
  validEnd: number,
  totalPoints: number,
  activity: Activity
) {
  if (isSwim) {
    return { slicedAltitude: undefined, elevGain: 0, elevHigh: 0, elevLow: 0 };
  }
  if (rawAltitude && rawAltitude.length >= totalPoints) {
    const sliced = rawAltitude.slice(validStart, validEnd + 1);
    return {
      slicedAltitude: sliced,
      elevGain: computeElevationHysteresisGain(sliced),
      elevHigh: Math.max(...sliced),
      elevLow: Math.min(...sliced)
    };
  }
  return {
    slicedAltitude: undefined,
    elevGain: activity.total_elevation_gain,
    elevHigh: activity.elev_high,
    elevLow: activity.elev_low
  };
}

function sliceHeartrateData(
  rawHr: readonly (number | null)[] | undefined,
  validStart: number,
  validEnd: number,
  totalPoints: number,
  activity: Activity
) {
  if (rawHr && rawHr.length >= totalPoints) {
    const sliced = rawHr.slice(validStart, validEnd + 1);
    const validSamples = sliced.filter((h): h is number => h !== null && h !== undefined && h > 0);
    if (validSamples.length > 0) {
      return {
        slicedHr: sliced,
        avgHr: Math.round(validSamples.reduce((sum, h) => sum + h, 0) / validSamples.length),
        maxHr: Math.max(...validSamples)
      };
    }
    return { slicedHr: sliced, avgHr: undefined, maxHr: undefined };
  }
  return {
    slicedHr: undefined,
    avgHr: activity.average_heartrate,
    maxHr: activity.max_heartrate
  };
}

function buildTrimmedStreamSet(
  rebasedTime: number[],
  count: number,
  slicedLatLng?: [number, number][],
  slicedAltitude?: number[],
  slicedHr?: (number | null)[]
): EncodableStreamSet {
  const trimmedStream: EncodableStreamSet = {
    time: wrapSeries(rebasedTime, count)
  };
  if (slicedLatLng) trimmedStream.latlng = wrapSeries(slicedLatLng, count);
  if (slicedAltitude) trimmedStream.altitude = wrapSeries(slicedAltitude, count);
  if (slicedHr) trimmedStream.heartrate = wrapSeries(slicedHr, count);
  return trimmedStream;
}

/**
 * Trims raw activity streams to [startIndex, endIndex] and derives all kinematic,
 * temporal, spatial, and biometric fields (ONT-KIN-09, ONT-TIME-01, ONT-DOM-05).
 */
export function trimActivityStream(
  activity: Activity,
  rawStream: StreamSet,
  startIndex: number,
  endIndex: number
): TrimmedStreamResult {
  const totalPoints = getStreamTotalPoints(rawStream);
  if (totalPoints < 2) {
    throw new Error('Cannot trim activity with fewer than 2 stream points.');
  }

  const validStart = Math.max(0, Math.min(startIndex, totalPoints - 2));
  const validEnd = Math.max(validStart + 1, Math.min(endIndex, totalPoints - 1));
  const count = validEnd - validStart + 1;

  const temporal = sliceTimeAndShiftTemporal(
    activity,
    rawStream.time?.data,
    validStart,
    validEnd,
    count,
    totalPoints
  );

  const gps = sliceGpsCoordinates(
    rawStream.latlng?.data,
    validStart,
    validEnd,
    count,
    totalPoints,
    activity
  );

  const elapsedTimeSec = Math.max(1, Math.round(temporal.rebasedTime[count - 1]));
  const movingTimeSec = computeMovingTime(
    activity.type,
    gps.slicedLatLng,
    temporal.rebasedTime,
    elapsedTimeSec,
    count
  );

  const isSwim = activity.type.toLowerCase() === 'swim';
  const alt = sliceAltitudeData(
    isSwim,
    rawStream.altitude?.data,
    validStart,
    validEnd,
    totalPoints,
    activity
  );
  const hr = sliceHeartrateData(
    rawStream.heartrate?.data,
    validStart,
    validEnd,
    totalPoints,
    activity
  );

  const activeTime = movingTimeSec > 0 ? movingTimeSec : elapsedTimeSec;
  const averageSpeedMps = activeTime > 0 ? gps.distanceMeters / activeTime : 0;

  const trimmedStream = buildTrimmedStreamSet(
    temporal.rebasedTime,
    count,
    gps.slicedLatLng,
    alt.slicedAltitude,
    hr.slicedHr
  );

  const updatedActivity: Activity = {
    ...activity,
    distance: gps.distanceMeters,
    elapsed_time: elapsedTimeSec,
    moving_time: movingTimeSec,
    average_speed: averageSpeedMps,
    total_elevation_gain: alt.elevGain,
    elev_high: alt.elevHigh,
    elev_low: alt.elevLow,
    start_date_local: temporal.startDateLocal,
    local_date: temporal.localDate,
    local_time: temporal.localTime,
    start_date_utc: temporal.newStartDateUtc,
    start_timestamp_utc: temporal.newStartUtcMs,
    start_year: temporal.startYear,
    start_month: temporal.startMonth,
    start_day: temporal.startDay,
    start_week: temporal.startWeek,
    utc_offset: temporal.utcOffsetSeconds,
    start_latlng: gps.startLatLng,
    end_latlng: gps.endLatLng,
    bounding_box: gps.boundingBox,
    average_heartrate: hr.avgHr,
    max_heartrate: hr.maxHr
  };

  return { updatedActivity, trimmedStream };
}

/**
 * Synchronous preview of trimmed activity metrics and deltas for live slider response.
 */
export function previewTrimmedActivity(
  activity: Activity,
  rawStream: StreamSet,
  startIndex: number,
  endIndex: number
): TrimPreviewResult {
  const { updatedActivity } = trimActivityStream(activity, rawStream, startIndex, endIndex);
  return {
    distanceMeters: updatedActivity.distance,
    elapsedTimeSec: updatedActivity.elapsed_time,
    movingTimeSec: updatedActivity.moving_time,
    elevationGainM: updatedActivity.total_elevation_gain,
    averageSpeedMps: updatedActivity.average_speed,
    averageHeartRate: updatedActivity.average_heartrate,
    maxHeartRate: updatedActivity.max_heartrate,
    deltaDistanceMeters: updatedActivity.distance - activity.distance,
    deltaElapsedTimeSec: updatedActivity.elapsed_time - activity.elapsed_time
  };
}

function buildHeadCutCoordinates(
  rawLatLng: readonly [number, number][],
  validStart: number
): LatLng[] {
  const cutCoords: LatLng[] = [];
  if (validStart > 0) {
    for (let i = 0; i <= validStart; i++) {
      cutCoords.push({ latitude: rawLatLng[i][0], longitude: rawLatLng[i][1] });
    }
  }
  return cutCoords;
}

function buildTailCutCoordinates(
  rawLatLng: readonly [number, number][],
  validEnd: number,
  totalPoints: number
): LatLng[] {
  const cutCoords: LatLng[] = [];
  if (validEnd < totalPoints - 1) {
    for (let i = validEnd; i < totalPoints; i++) {
      cutCoords.push({ latitude: rawLatLng[i][0], longitude: rawLatLng[i][1] });
    }
  }
  return cutCoords;
}

function buildCutStreamSegments(
  rawLatLng: readonly [number, number][],
  validStart: number,
  validEnd: number,
  totalPoints: number
): { cutStream?: ActivityStream; cutTailStream?: ActivityStream } {
  const headCoords = buildHeadCutCoordinates(rawLatLng, validStart);
  const tailCoords = buildTailCutCoordinates(rawLatLng, validEnd, totalPoints);

  if (headCoords.length > 0 && tailCoords.length > 0) {
    return {
      cutStream: { coordinates: headCoords, altitude: [], time: [] },
      cutTailStream: { coordinates: tailCoords, altitude: [], time: [] }
    };
  }
  if (headCoords.length > 0) {
    return { cutStream: { coordinates: headCoords, altitude: [], time: [] } };
  }
  if (tailCoords.length > 0) {
    return { cutStream: { coordinates: tailCoords, altitude: [], time: [] } };
  }
  return {};
}

function extractKeptSeries(
  rawLatLng: readonly [number, number][],
  rawTime: readonly number[],
  rawAlt: readonly number[],
  rawHr: readonly (number | null)[],
  validStart: number,
  validEnd: number
): ActivityStream {
  const coordinates: LatLng[] = [];
  const time: number[] = [];
  const altitude: number[] = [];
  const heartrate: (number | null)[] = [];

  for (let i = validStart; i <= validEnd; i++) {
    coordinates.push({ latitude: rawLatLng[i][0], longitude: rawLatLng[i][1] });
    time.push(rawTime[i] ?? i);
    altitude.push(rawAlt[i] ?? 0);
    heartrate.push(rawHr[i] ?? null);
  }

  return {
    coordinates,
    altitude,
    time,
    heartrate: rawHr.length > 0 ? heartrate : undefined
  };
}

/**
 * Builds the kept and cut overlay ActivityStream models for MiniMapComponent visualization.
 */
export function buildTrimPreviewStreams(
  rawStream: StreamSet,
  startIndex: number,
  endIndex: number,
  activeHandle: 'start' | 'end' = 'end'
): TrimPreviewStreams {
  const rawLatLng = rawStream.latlng?.data ?? [];
  const rawTime = rawStream.time?.data ?? [];
  const rawAlt = rawStream.altitude?.data ?? [];
  const rawHr = rawStream.heartrate?.data ?? [];
  const totalPoints = rawLatLng.length;

  if (totalPoints === 0) {
    return {
      keptStream: { coordinates: [], altitude: [], time: [] },
      cutStream: undefined,
      cutTailStream: undefined,
      activeCoordinate: null
    };
  }

  const validStart = Math.max(0, Math.min(startIndex, totalPoints - 1));
  const validEnd = Math.max(validStart, Math.min(endIndex, totalPoints - 1));

  const keptStream = extractKeptSeries(rawLatLng, rawTime, rawAlt, rawHr, validStart, validEnd);
  const { cutStream, cutTailStream } = buildCutStreamSegments(
    rawLatLng,
    validStart,
    validEnd,
    totalPoints
  );

  const activeIdx = activeHandle === 'start' ? validStart : validEnd;
  const activePt = rawLatLng[activeIdx];
  const activeCoordinate: LatLng | null = activePt
    ? { latitude: activePt[0], longitude: activePt[1] }
    : null;

  return { keptStream, cutStream, cutTailStream, activeCoordinate };
}
