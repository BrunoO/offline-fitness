import { LatLng } from '@/shared';
import type { Region } from 'react-native-maps';
import {
  calculateBearing,
  haversineDistance,
  shortestAngularDifference
} from './flyoverInterpolator';

export interface DirectionArrowPlacement {
  coordinate: LatLng;
  bearing: number;
  distanceMeters: number;
}

export interface DirectionArrowVisualSpec {
  badgeSize: number;
  iconSize: number;
  borderWidth: number;
  targetCount: number;
}

export interface ComputeDirectionArrowsResult {
  arrows: DirectionArrowPlacement[];
  visualSpec: DirectionArrowVisualSpec;
}

export interface ComputeDirectionArrowsOptions {
  baseArrowCount?: number;
  region?: Region | null;
  occupiedCoordinates?: readonly LatLng[];
  isOverlay?: boolean;
}

interface PolylineProfile {
  points: readonly LatLng[];
  cumulativeDistances: number[];
  totalDistance: number;
  trackSpanMeters: number;
}

interface TangentMetrics {
  bearing: number;
  turnAngleDegrees: number;
}

const DEFAULT_BASE_ARROW_COUNT = 5;
const MIN_ARROW_COUNT = 1;
const MAX_ARROW_COUNT = 20;
const MIN_BEARING_WINDOW_METERS = 8;
const MAX_BEARING_WINDOW_METERS = 25;
const BEARING_WINDOW_FRACTION = 0.02;
const MIN_CHORD_METERS = 0.5;
const CANDIDATE_STEP_OFFSETS = [0, -0.24, 0.24, -0.46, 0.46, -0.64, 0.64] as const;
const OFFSET_TIE_BREAK_WEIGHT = 15;
const VIEWPORT_PADDING_FACTOR = 1.15;
const ZOOM_IN_VIEWPORT_THRESHOLD = 1.35;

const PRIMARY_DEFAULT_BADGE_SIZE = 18;
const PRIMARY_MIN_BADGE_SIZE = 14;
const PRIMARY_MAX_BADGE_SIZE = 20;

const OVERLAY_DEFAULT_BADGE_SIZE = 16;
const OVERLAY_MIN_BADGE_SIZE = 13;
const OVERLAY_MAX_BADGE_SIZE = 18;

const DEFAULT_BORDER_WIDTH = 1.75;
const OVERLAY_BORDER_WIDTH = 1.5;

function buildPolylineProfile(track: readonly LatLng[]): PolylineProfile {
  const cumulativeDistances = new Array<number>(track.length);
  cumulativeDistances[0] = 0;

  let minLat = track[0].latitude;
  let maxLat = track[0].latitude;
  let minLng = track[0].longitude;
  let maxLng = track[0].longitude;

  for (let i = 1; i < track.length; i++) {
    const curr = track[i];
    cumulativeDistances[i] = cumulativeDistances[i - 1] + haversineDistance(track[i - 1], curr);
    if (curr.latitude < minLat) minLat = curr.latitude;
    if (curr.latitude > maxLat) maxLat = curr.latitude;
    if (curr.longitude < minLng) minLng = curr.longitude;
    if (curr.longitude > maxLng) maxLng = curr.longitude;
  }

  const totalDistance = cumulativeDistances.at(-1) ?? 0;
  const rawSpanMeters = haversineDistance(
    { latitude: minLat, longitude: minLng },
    { latitude: maxLat, longitude: maxLng }
  );
  const trackSpanMeters = Math.max(rawSpanMeters, totalDistance * 0.25, 1);

  return {
    points: track,
    cumulativeDistances,
    totalDistance,
    trackSpanMeters
  };
}

function findEnclosingSegmentIndex(distances: readonly number[], targetDist: number): number {
  let low = 0;
  let high = distances.length - 2;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const dStart = distances[mid];
    const dEnd = distances[mid + 1];
    if (targetDist >= dStart && targetDist <= dEnd) {
      return mid;
    }
    if (dStart < targetDist) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, Math.min(distances.length - 2, low));
}

function interpolateAtDistance(profile: PolylineProfile, distanceMeters: number): LatLng {
  const { points, cumulativeDistances, totalDistance } = profile;
  if (distanceMeters <= 0) {
    return points[0];
  }
  if (distanceMeters >= totalDistance) {
    return points.at(-1)!;
  }

  const segIdx = findEnclosingSegmentIndex(cumulativeDistances, distanceMeters);
  const dStart = cumulativeDistances[segIdx];
  const dEnd = cumulativeDistances[segIdx + 1];
  const segLen = dEnd - dStart;
  const ratio = segLen > 0 ? (distanceMeters - dStart) / segLen : 0;
  const p1 = points[segIdx];
  const p2 = points[segIdx + 1];

  return {
    latitude: p1.latitude + (p2.latitude - p1.latitude) * ratio,
    longitude: p1.longitude + (p2.longitude - p1.longitude) * ratio
  };
}

function resolveSegmentFallbackBearing(profile: PolylineProfile, distanceMeters: number): number {
  const segIdx = findEnclosingSegmentIndex(profile.cumulativeDistances, distanceMeters);
  return calculateBearing(profile.points[segIdx], profile.points[segIdx + 1]);
}

function computeTangentMetrics(profile: PolylineProfile, distanceMeters: number): TangentMetrics {
  const windowMeters = Math.max(
    MIN_BEARING_WINDOW_METERS,
    Math.min(MAX_BEARING_WINDOW_METERS, profile.totalDistance * BEARING_WINDOW_FRACTION)
  );
  const dBack = Math.max(0, distanceMeters - windowMeters);
  const dAhead = Math.min(profile.totalDistance, distanceMeters + windowMeters);

  const pBack = interpolateAtDistance(profile, dBack);
  const pCenter = interpolateAtDistance(profile, distanceMeters);
  const pAhead = interpolateAtDistance(profile, dAhead);

  const chordDist = haversineDistance(pBack, pAhead);
  const bearing =
    chordDist >= MIN_CHORD_METERS
      ? calculateBearing(pBack, pAhead)
      : resolveSegmentFallbackBearing(profile, distanceMeters);

  const inDist = haversineDistance(pBack, pCenter);
  const outDist = haversineDistance(pCenter, pAhead);
  const bIn = inDist >= MIN_CHORD_METERS ? calculateBearing(pBack, pCenter) : bearing;
  const bOut = outDist >= MIN_CHORD_METERS ? calculateBearing(pCenter, pAhead) : bearing;
  const turnAngleDegrees = Math.abs(shortestAngularDifference(bIn, bOut));

  return { bearing, turnAngleDegrees };
}

function computeRegionSpanMeters(region: Region | null | undefined, fallbackSpan: number): number {
  if (
    !region ||
    !Number.isFinite(region.latitudeDelta) ||
    !Number.isFinite(region.longitudeDelta) ||
    region.latitudeDelta <= 0 ||
    region.longitudeDelta <= 0
  ) {
    return fallbackSpan;
  }

  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  const span = haversineDistance(
    { latitude: region.latitude - halfLat, longitude: region.longitude - halfLng },
    { latitude: region.latitude + halfLat, longitude: region.longitude + halfLng }
  );
  return span > 0 ? span : fallbackSpan;
}

export function computeArrowVisualSpec(
  trackSpanMeters: number,
  region: Region | null | undefined,
  baseArrowCount: number = DEFAULT_BASE_ARROW_COUNT,
  isOverlay: boolean = false
): DirectionArrowVisualSpec {
  const clampedBase = Math.max(MIN_ARROW_COUNT, Math.min(baseArrowCount, MAX_ARROW_COUNT));
  const defaultBadge = isOverlay ? OVERLAY_DEFAULT_BADGE_SIZE : PRIMARY_DEFAULT_BADGE_SIZE;
  const minBadge = isOverlay ? OVERLAY_MIN_BADGE_SIZE : PRIMARY_MIN_BADGE_SIZE;
  const maxBadge = isOverlay ? OVERLAY_MAX_BADGE_SIZE : PRIMARY_MAX_BADGE_SIZE;
  const borderWidth = isOverlay ? OVERLAY_BORDER_WIDTH : DEFAULT_BORDER_WIDTH;

  const regionSpanMeters = computeRegionSpanMeters(region, trackSpanMeters);
  const zoomRatio = regionSpanMeters > 0 ? trackSpanMeters / regionSpanMeters : 1;

  // Log-scale zoom adjustment so marker badge scales gently with map zoom
  const zoomOffset = Math.log2(Math.max(0.25, Math.min(4, zoomRatio))) * 2;
  const badgeSize = Math.round(Math.max(minBadge, Math.min(maxBadge, defaultBadge + zoomOffset)));
  const iconSize = Math.max(8, Math.round(badgeSize * 0.62));

  const targetCount =
    zoomRatio < 0.75
      ? Math.max(2, Math.min(clampedBase, Math.round(clampedBase * Math.sqrt(zoomRatio))))
      : clampedBase;

  return {
    badgeSize,
    iconSize,
    borderWidth,
    targetCount
  };
}

function isPointInPaddedRegion(point: LatLng, region: Region): boolean {
  const halfLat = (region.latitudeDelta * VIEWPORT_PADDING_FACTOR) / 2;
  const halfLng = (region.longitudeDelta * VIEWPORT_PADDING_FACTOR) / 2;
  return (
    point.latitude >= region.latitude - halfLat &&
    point.latitude <= region.latitude + halfLat &&
    point.longitude >= region.longitude - halfLng &&
    point.longitude <= region.longitude + halfLng
  );
}

function resolveActiveDistanceBounds(
  profile: PolylineProfile,
  region: Region | null | undefined
): [number, number] {
  const { totalDistance, trackSpanMeters } = profile;
  if (!region || totalDistance <= 0) {
    return [0, totalDistance];
  }

  const regionSpan = computeRegionSpanMeters(region, trackSpanMeters);
  const zoomRatio = regionSpan > 0 ? trackSpanMeters / regionSpan : 1;
  if (zoomRatio <= ZOOM_IN_VIEWPORT_THRESHOLD) {
    return [0, totalDistance];
  }

  // Sample 40 points along the track to find the visible distance window when zoomed in
  const sampleCount = 40;
  let firstVisibleDist: number | null = null;
  let lastVisibleDist: number | null = null;

  for (let s = 0; s <= sampleCount; s++) {
    const dist = (s / sampleCount) * totalDistance;
    const coord = interpolateAtDistance(profile, dist);
    if (isPointInPaddedRegion(coord, region)) {
      firstVisibleDist ??= dist;
      lastVisibleDist = dist;
    }
  }

  if (
    firstVisibleDist !== null &&
    lastVisibleDist !== null &&
    lastVisibleDist - firstVisibleDist >= totalDistance * 0.05
  ) {
    return [firstVisibleDist, lastVisibleDist];
  }

  return [0, totalDistance];
}

function isTooCloseToOccupied(
  candidate: LatLng,
  occupied: readonly LatLng[],
  minSeparationMeters: number
): boolean {
  for (const existing of occupied) {
    if (haversineDistance(candidate, existing) < minSeparationMeters) {
      return true;
    }
  }
  return false;
}

function selectBestCandidateForSlot(
  profile: PolylineProfile,
  targetDist: number,
  stepDistance: number,
  minBound: number,
  maxBound: number,
  occupied: readonly LatLng[],
  minSeparationMeters: number
): DirectionArrowPlacement | null {
  let bestCandidate: DirectionArrowPlacement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const offsetFactor of CANDIDATE_STEP_OFFSETS) {
    const candidateDist = targetDist + offsetFactor * stepDistance;
    if (candidateDist <= minBound || candidateDist >= maxBound) {
      continue;
    }

    const coordinate = interpolateAtDistance(profile, candidateDist);
    if (isTooCloseToOccupied(coordinate, occupied, minSeparationMeters)) {
      continue;
    }

    const { bearing, turnAngleDegrees } = computeTangentMetrics(profile, candidateDist);
    const score = turnAngleDegrees + Math.abs(offsetFactor) * OFFSET_TIE_BREAK_WEIGHT;

    if (score < bestScore) {
      bestScore = score;
      bestCandidate = {
        coordinate,
        bearing,
        distanceMeters: candidateDist
      };
    }
  }

  return bestCandidate;
}

/**
 * Computes distance-spaced, tangent-aligned, and spatially de-conflicted direction
 * arrow placements along a GPS polyline, adapting marker size and count to map zoom.
 */
export function computeDirectionArrows(
  track: readonly LatLng[] | undefined,
  options?: ComputeDirectionArrowsOptions
): ComputeDirectionArrowsResult {
  const baseArrowCount = options?.baseArrowCount ?? DEFAULT_BASE_ARROW_COUNT;
  const isOverlay = options?.isOverlay ?? false;
  const region = options?.region;

  if (!track || track.length < 2 || baseArrowCount <= 0) {
    return {
      arrows: [],
      visualSpec: computeArrowVisualSpec(1, region, baseArrowCount, isOverlay)
    };
  }

  const profile = buildPolylineProfile(track);
  const visualSpec = computeArrowVisualSpec(
    profile.trackSpanMeters,
    region,
    baseArrowCount,
    isOverlay
  );

  if (profile.totalDistance <= 0) {
    return { arrows: [], visualSpec };
  }

  const [minBound, maxBound] = resolveActiveDistanceBounds(profile, region);
  const activeSpan = maxBound - minBound;
  if (activeSpan <= 0) {
    return { arrows: [], visualSpec };
  }

  const stepDistance = activeSpan / (visualSpec.targetCount + 1);
  const regionSpanMeters = computeRegionSpanMeters(region, profile.trackSpanMeters);
  const effectiveSpan = Math.min(profile.trackSpanMeters, regionSpanMeters);
  const minSeparationMeters = Math.min(0.4 * stepDistance, Math.max(5, effectiveSpan * 0.08));

  // Seed occupied points with the Start pin (track[0]) and any caller-provided occupied coordinates
  const occupied: LatLng[] = [track[0], ...(options?.occupiedCoordinates ?? [])];
  const arrows: DirectionArrowPlacement[] = [];

  for (let i = 1; i <= visualSpec.targetCount; i++) {
    const targetDist = minBound + i * stepDistance;
    const chosen = selectBestCandidateForSlot(
      profile,
      targetDist,
      stepDistance,
      minBound,
      maxBound,
      occupied,
      minSeparationMeters
    );
    if (chosen) {
      arrows.push(chosen);
      occupied.push(chosen.coordinate);
    }
  }

  return { arrows, visualSpec };
}
