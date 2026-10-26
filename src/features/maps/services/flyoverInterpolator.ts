import { ActivityStream, LatLng } from '@/shared';
import { FlyoverPipelineOptions, FlyoverPoint, FlyoverTrack } from '../types/flyover.types';

const EARTH_RADIUS_METERS = 6_371_000;
const FULL_CIRCLE_DEGREES = 360;
const HALF_CIRCLE_DEGREES = 180;
const DEFAULT_SMOOTHING_WINDOW = 5;
const DEFAULT_PITCH_DEGREES = 60;
const DEFAULT_MIN_MOVEMENT_METERS = 1.5;
const DEFAULT_FALLBACK_SPEED_MPS = 5.0;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const MIN_PROGRESS = 0;
const MAX_PROGRESS = 1;

/**
 * Calculates orthodromic distance in meters between two coordinates via Haversine formula.
 * @param p1 Starting coordinate.
 * @param p2 Destination coordinate.
 * @returns Distance in meters.
 */
export function haversineDistance(p1: LatLng, p2: LatLng): number {
  const dLat = (p2.latitude - p1.latitude) * DEGREES_TO_RADIANS;
  const dLon = (p2.longitude - p1.longitude) * DEGREES_TO_RADIANS;
  const lat1Rad = p1.latitude * DEGREES_TO_RADIANS;
  const lat2Rad = p2.latitude * DEGREES_TO_RADIANS;

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);

  const a =
    sinHalfLat * sinHalfLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes the forward initial azimuth (bearing) from point p1 to p2 in degrees [0, 360).
 * @param p1 Starting coordinate.
 * @param p2 Destination coordinate.
 * @returns Initial bearing in degrees [0, 360).
 */
export function calculateBearing(p1: LatLng, p2: LatLng): number {
  const lat1Rad = p1.latitude * DEGREES_TO_RADIANS;
  const lat2Rad = p2.latitude * DEGREES_TO_RADIANS;
  const dLonRad = (p2.longitude - p1.longitude) * DEGREES_TO_RADIANS;

  const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);
  const initialBearing = Math.atan2(y, x) * RADIANS_TO_DEGREES;
  return (initialBearing + FULL_CIRCLE_DEGREES) % FULL_CIRCLE_DEGREES;
}

/**
 * Calculates the shortest signed angular difference from fromAngle to toAngle in range [-180, 180).
 * Positive means clockwise rotation; negative means counter-clockwise rotation.
 * @param fromAngle Starting angle in degrees.
 * @param toAngle Destination angle in degrees.
 * @returns Shortest difference in degrees [-180, 180).
 */
export function shortestAngularDifference(fromAngle: number, toAngle: number): number {
  return ((toAngle - fromAngle + 540) % FULL_CIRCLE_DEGREES) - HALF_CIRCLE_DEGREES;
}

/**
 * Interpolates between two angles by following the shortest path around the circle.
 * @param fromAngle Starting angle in degrees [0, 360).
 * @param toAngle Destination angle in degrees [0, 360).
 * @param ratio Interpolation progress factor in [0, 1].
 * @returns Interpolated angle in degrees [0, 360).
 */
export function interpolateAngle(fromAngle: number, toAngle: number, ratio: number): number {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const diff = shortestAngularDifference(fromAngle, toAngle);
  const interpolated = (fromAngle + diff * clampedRatio) % FULL_CIRCLE_DEGREES;
  return interpolated < 0 ? interpolated + FULL_CIRCLE_DEGREES : interpolated;
}

/**
 * Computes the circular mean for an array of bearings in degrees, properly handling
 * wrap-around across the North boundary (0 / 360 degrees).
 * @param bearings Array of angle values in degrees.
 * @returns Directional mean in degrees [0, 360).
 */
export function circularMean(bearings: number[]): number {
  if (bearings.length === 0) {
    return 0;
  }
  let sumSin = 0;
  let sumCos = 0;
  for (const b of bearings) {
    const rad = b * DEGREES_TO_RADIANS;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }
  const magnitudeSq = sumSin * sumSin + sumCos * sumCos;
  if (magnitudeSq < 1e-9) {
    return bearings[0];
  }
  const meanAngle = Math.atan2(sumSin, sumCos) * RADIANS_TO_DEGREES;
  return (meanAngle + FULL_CIRCLE_DEGREES) % FULL_CIRCLE_DEGREES;
}

/**
 * Smoothly interpolates all scalar and angular properties between two FlyoverPoints.
 * @param p1 Segment start point.
 * @param p2 Segment end point.
 * @param ratio Progress fraction [0, 1].
 * @returns The interpolated FlyoverPoint.
 */
export function interpolateFlyoverPoint(
  p1: FlyoverPoint,
  p2: FlyoverPoint,
  ratio: number
): FlyoverPoint {
  const t = Math.max(0, Math.min(1, ratio));
  return {
    latitude: p1.latitude + (p2.latitude - p1.latitude) * t,
    longitude: p1.longitude + (p2.longitude - p1.longitude) * t,
    altitude: p1.altitude + (p2.altitude - p1.altitude) * t,
    time: p1.time + (p2.time - p1.time) * t,
    distance: p1.distance + (p2.distance - p1.distance) * t,
    speed: p1.speed + (p2.speed - p1.speed) * t,
    bearing: interpolateAngle(p1.bearing, p2.bearing, t),
    smoothBearing: interpolateAngle(p1.smoothBearing, p2.smoothBearing, t),
    pitch: p1.pitch + (p2.pitch - p1.pitch) * t
  };
}

/**
 * Computes moving-window circular smoothed bearings along an array of raw bearings.
 * @param rawBearings Array of bearings per point.
 * @param windowSize Half or full window span.
 * @returns Array of smoothed bearings of identical length.
 */
function smoothBearings(rawBearings: number[], windowSize: number): number[] {
  const count = rawBearings.length;
  const halfWindow = Math.floor(windowSize / 2);
  const result: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const startIdx = Math.max(0, i - halfWindow);
    const endIdx = Math.min(count - 1, i + halfWindow);
    const windowSlice = rawBearings.slice(startIdx, endIdx + 1);
    result[i] = circularMean(windowSlice);
  }

  return result;
}

const MAX_REALISTIC_SPEED_MPS = 50; // 180 km/h: upper threshold to reject impossible GPS teleport spikes

/**
 * Resolves elapsed time for a coordinate index, falling back to cumulative distance
 * if stream.time is missing or incomplete, or interpolating if timeArray length differs
 * from coordinates count.
 */
function resolvePointTime(
  index: number,
  totalPoints: number,
  timeArray: number[] | undefined,
  cumulativeDist: number
): number {
  if (timeArray && timeArray.length > 0) {
    if (timeArray.length === totalPoints && Number.isFinite(timeArray[index])) {
      return timeArray[index];
    }
    if (totalPoints > 1) {
      const fraction = index / (totalPoints - 1);
      const startTime = timeArray[0];
      const endTime = timeArray.at(-1) ?? startTime;
      const totalDuration = Math.max(0, endTime - startTime);
      return startTime + fraction * totalDuration;
    }
    return timeArray[0];
  }
  return cumulativeDist / DEFAULT_FALLBACK_SPEED_MPS;
}

/**
 * Resolves altitude for a coordinate index, falling back to 0 if missing,
 * or interpolating if altitudeArray length differs from coordinates count.
 */
function resolvePointAltitude(
  index: number,
  totalPoints: number,
  altitudeArray: number[] | undefined
): number {
  if (altitudeArray && altitudeArray.length > 0) {
    if (altitudeArray.length === totalPoints && Number.isFinite(altitudeArray[index])) {
      return altitudeArray[index];
    }
    if (totalPoints > 1) {
      const fraction = index / (totalPoints - 1);
      const mappedIdx = Math.min(
        altitudeArray.length - 1,
        Math.max(0, Math.round(fraction * (altitudeArray.length - 1)))
      );
      return altitudeArray[mappedIdx] ?? 0;
    }
    return altitudeArray[0];
  }
  return 0;
}

/**
 * Builds an empty FlyoverTrack representation.
 */
function createEmptyTrack(): FlyoverTrack {
  return {
    points: [],
    totalDistance: 0,
    totalDuration: 0,
    minAltitude: 0,
    maxAltitude: 0,
    maxSpeed: 0
  };
}

/**
 * Builds a single-point FlyoverTrack representation.
 */
function createSinglePointTrack(
  coord: LatLng,
  stream: ActivityStream,
  defaultPitch: number
): FlyoverTrack {
  const singleAlt = resolvePointAltitude(0, 1, stream.altitude);
  const singleTime = resolvePointTime(0, 1, stream.time, 0);
  const singlePoint: FlyoverPoint = {
    latitude: coord.latitude,
    longitude: coord.longitude,
    altitude: singleAlt,
    time: singleTime,
    distance: 0,
    speed: 0,
    bearing: 0,
    smoothBearing: 0,
    pitch: defaultPitch
  };
  return {
    points: [singlePoint],
    totalDistance: 0,
    totalDuration: 0,
    minAltitude: singleAlt,
    maxAltitude: singleAlt,
    maxSpeed: 0
  };
}

interface StepMetrics {
  dist: number;
  bearing: number;
  speed: number;
}

/**
 * Computes incremental bearing and speed between two consecutive track points.
 */
function computeStepMetrics(
  prev: LatLng,
  curr: LatLng,
  dist: number,
  prevTime: number,
  currTime: number,
  minMovement: number,
  lastBearing: number
): StepMetrics {
  const bearing = dist >= minMovement ? calculateBearing(prev, curr) : lastBearing;
  const deltaTime = currTime - prevTime;
  const rawSpeed = deltaTime > 0 ? dist / deltaTime : 0;
  const speed = Number.isFinite(rawSpeed) ? Math.min(rawSpeed, MAX_REALISTIC_SPEED_MPS) : 0;
  return { dist, bearing, speed };
}

interface IntermediatePoint {
  lat: number;
  lng: number;
  alt: number;
  time: number;
  dist: number;
  speed: number;
  rawBearing: number;
}

interface IntermediateResult {
  points: IntermediatePoint[];
  cumulativeDistance: number;
  minAlt: number;
  maxAlt: number;
  maxSpd: number;
}

/**
 * Iterates through coordinates to compute step distances, speeds, raw bearings, and cumulative values.
 */
function buildIntermediatePoints(
  coords: LatLng[],
  stream: ActivityStream,
  minMovement: number
): IntermediateResult {
  const points: IntermediatePoint[] = [];
  let cumulativeDistance = 0;
  let lastBearing = 0;
  let minAlt = Number.POSITIVE_INFINITY;
  let maxAlt = Number.NEGATIVE_INFINITY;
  let maxSpd = 0;

  for (let i = 0; i < coords.length; i++) {
    const curr = coords[i];
    const alt = resolvePointAltitude(i, coords.length, stream.altitude);
    minAlt = Math.min(minAlt, alt);
    maxAlt = Math.max(maxAlt, alt);

    let stepBearing = lastBearing;
    let stepSpeed = 0;
    let time: number;

    if (i > 0) {
      const prev = coords[i - 1];
      const stepDist = haversineDistance(prev, curr);
      const prevTime = points[i - 1].time;
      cumulativeDistance += stepDist;
      time = resolvePointTime(i, coords.length, stream.time, cumulativeDistance);
      const metrics = computeStepMetrics(
        prev,
        curr,
        stepDist,
        prevTime,
        time,
        minMovement,
        lastBearing
      );
      stepBearing = metrics.bearing;
      stepSpeed = metrics.speed;
      lastBearing = stepBearing;
      maxSpd = Math.max(maxSpd, stepSpeed);
    } else {
      time = resolvePointTime(0, coords.length, stream.time, 0);
    }

    points.push({
      lat: curr.latitude,
      lng: curr.longitude,
      alt,
      time,
      dist: cumulativeDistance,
      speed: stepSpeed,
      rawBearing: stepBearing
    });
  }

  if (coords.length > 1) {
    if (points[0].rawBearing === 0 && points[1].rawBearing !== 0) {
      points[0].rawBearing = points[1].rawBearing;
    }
    points[0].speed = points[1].speed;
  }

  return { points, cumulativeDistance, minAlt, maxAlt, maxSpd };
}

/**
 * Smooths linear speed values using a simple moving average window.
 * @param rawSpeeds Array of instantaneous speeds in m/s.
 * @param windowSize Width of the smoothing window (must be >= 1).
 * @returns Array of smoothed speed values.
 */
export function smoothSpeeds(rawSpeeds: number[], windowSize: number): number[] {
  if (rawSpeeds.length <= 1 || windowSize <= 1) {
    return rawSpeeds;
  }
  const half = Math.floor(windowSize / 2);
  const result: number[] = new Array(rawSpeeds.length);

  for (let i = 0; i < rawSpeeds.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(rawSpeeds.length - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += rawSpeeds[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : rawSpeeds[i];
  }
  return result;
}

/**
 * Processes a raw ActivityStream into a pre-computed FlyoverTrack with distance,
 * speeds, raw bearings, and circular-smoothed bearings.
 * @param stream The source ActivityStream.
 * @param options Configuration options for smoothing and camera pitch.
 * @returns Fully computed FlyoverTrack.
 */
export function buildFlyoverTrack(
  stream: ActivityStream | undefined | null,
  options?: FlyoverPipelineOptions
): FlyoverTrack {
  if (!stream?.coordinates || stream.coordinates.length === 0) {
    return createEmptyTrack();
  }

  const coords = stream.coordinates;
  const defaultPitch = options?.defaultPitch ?? DEFAULT_PITCH_DEGREES;

  if (coords.length === 1) {
    return createSinglePointTrack(coords[0], stream, defaultPitch);
  }

  const smoothingWindow = Math.max(1, options?.smoothingWindow ?? DEFAULT_SMOOTHING_WINDOW);
  const minMovement = options?.minMovementMeters ?? DEFAULT_MIN_MOVEMENT_METERS;

  const {
    points: intermediatePoints,
    cumulativeDistance,
    minAlt,
    maxAlt
  } = buildIntermediatePoints(coords, stream, minMovement);

  const rawBearings = intermediatePoints.map(p => p.rawBearing);
  const smoothedBearings = smoothBearings(rawBearings, smoothingWindow);

  const rawSpeeds = intermediatePoints.map(p => p.speed);
  const smoothedSpeeds = smoothSpeeds(rawSpeeds, smoothingWindow);

  let maxSmoothedSpeed = 0;
  const finalPoints: FlyoverPoint[] = intermediatePoints.map((pt, idx) => {
    const spd = smoothedSpeeds[idx];
    if (spd > maxSmoothedSpeed) {
      maxSmoothedSpeed = spd;
    }
    return {
      latitude: pt.lat,
      longitude: pt.lng,
      altitude: pt.alt,
      time: pt.time,
      distance: pt.dist,
      speed: spd,
      bearing: pt.rawBearing,
      smoothBearing: smoothedBearings[idx],
      pitch: defaultPitch
    };
  });

  const totalDuration =
    finalPoints.length > 0 ? Math.max(0, finalPoints.at(-1)!.time - finalPoints[0].time) : 0;

  return {
    points: finalPoints,
    totalDistance: cumulativeDistance,
    totalDuration,
    minAltitude: Number.isFinite(minAlt) ? minAlt : 0,
    maxAltitude: Number.isFinite(maxAlt) ? maxAlt : 0,
    maxSpeed: maxSmoothedSpeed
  };
}

/**
 * Searches for the segment enclosing targetValue in an array ordered by keySelector.
 * Returns the lower bounding index.
 */
function findBoundingSegmentIndex(
  points: FlyoverPoint[],
  targetValue: number,
  keySelector: (p: FlyoverPoint) => number
): number {
  let low = 0;
  let high = points.length - 2;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midVal = keySelector(points[mid]);
    const nextVal = keySelector(points[mid + 1]);

    if (targetValue >= midVal && targetValue <= nextVal) {
      return mid;
    }
    if (midVal < targetValue) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, Math.min(points.length - 2, low));
}

/**
 * Retrieves the interpolated FlyoverPoint along the route at progress factor [0, 1].
 * @param track Precomputed FlyoverTrack.
 * @param progress Normalized fraction between 0 (start) and 1 (finish).
 * @returns Interpolated point or null if track is empty.
 */
export function getFlyoverPointAtProgress(
  track: FlyoverTrack,
  progress: number
): FlyoverPoint | null {
  const points = track.points;
  if (points.length === 0) {
    return null;
  }
  if (points.length === 1 || progress <= MIN_PROGRESS) {
    return points[0];
  }
  if (progress >= MAX_PROGRESS) {
    return points.at(-1)!;
  }

  const targetDist = progress * track.totalDistance;
  const segIdx = findBoundingSegmentIndex(points, targetDist, p => p.distance);
  const p1 = points[segIdx];
  const p2 = points[segIdx + 1];
  const segDist = p2.distance - p1.distance;
  const ratio = segDist > 0 ? (targetDist - p1.distance) / segDist : 0;

  return interpolateFlyoverPoint(p1, p2, ratio);
}

/**
 * Retrieves the interpolated FlyoverPoint along the route at elapsed timeSeconds.
 * @param track Precomputed FlyoverTrack.
 * @param timeSeconds Seconds elapsed since route start.
 * @returns Interpolated point or null if track is empty.
 */
export function getFlyoverPointAtTime(
  track: FlyoverTrack,
  timeSeconds: number
): FlyoverPoint | null {
  const points = track.points;
  if (points.length === 0) {
    return null;
  }
  const startTime = points[0].time;
  const endTime = points.at(-1)!.time;

  if (points.length === 1 || timeSeconds <= startTime) {
    return points[0];
  }
  if (timeSeconds >= endTime) {
    return points.at(-1)!;
  }

  const segIdx = findBoundingSegmentIndex(points, timeSeconds, p => p.time);
  const p1 = points[segIdx];
  const p2 = points[segIdx + 1];
  const segDuration = p2.time - p1.time;
  const ratio = segDuration > 0 ? (timeSeconds - p1.time) / segDuration : 0;

  return interpolateFlyoverPoint(p1, p2, ratio);
}

/**
 * Resamples an existing FlyoverTrack into spatially uniform intervals along the track.
 * Ensures the start and end points are strictly preserved.
 * @param track The source FlyoverTrack.
 * @param intervalMeters Distance step in meters between points.
 * @returns Array of resampled FlyoverPoints.
 */
export function resampleTrackByDistance(
  track: FlyoverTrack,
  intervalMeters: number
): FlyoverPoint[] {
  const { points, totalDistance } = track;
  if (points.length < 2 || totalDistance <= intervalMeters || intervalMeters <= 0) {
    return [...points];
  }

  const resampled: FlyoverPoint[] = [points[0]];
  let currentTargetDist = intervalMeters;

  while (currentTargetDist < totalDistance) {
    const progress = currentTargetDist / totalDistance;
    const interpolated = getFlyoverPointAtProgress(track, progress);
    if (interpolated) {
      resampled.push(interpolated);
    }
    currentTargetDist += intervalMeters;
  }

  resampled.push(points.at(-1)!);
  return resampled;
}
