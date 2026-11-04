import { getActivityStreams } from '@/features/activities/services/fetchAndStoreStreams';
import { Activity, LatLng } from '../types/types';
import { simpleLogger } from './SimpleLogger';

/** Half-width of the corridor around a track, in metres. */
export const CORRIDOR_RADIUS_M = 25;
/** Target spacing of resampled points along a track, in metres. */
const RESAMPLE_STEP_M = 10;
/** Upper bound on resampled points per track; the step grows for longer tracks. */
const MAX_RESAMPLED_POINTS = 2000;
const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/** Local planar point in metres (equirectangular projection, ONT-SPATIAL). */
interface XY {
  x: number;
  y: number;
}

export interface TrackComparisonResult {
  similarity: number;
  reversed: boolean;
}

function isValidPoint(p: LatLng | null | undefined): p is LatLng {
  return (
    !!p &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}

/**
 * Projects both tracks into a shared local metric plane centred on their mean
 * latitude. Equirectangular error is negligible at activity scale.
 */
function projectTracks(track1: LatLng[], track2: LatLng[]): [XY[], XY[]] {
  let latSum = 0;
  for (const p of track1) latSum += p.latitude;
  for (const p of track2) latSum += p.latitude;
  const lat0 = (latSum / (track1.length + track2.length)) * DEG_TO_RAD;
  const kx = EARTH_RADIUS_M * DEG_TO_RAD * Math.cos(lat0);
  const ky = EARTH_RADIUS_M * DEG_TO_RAD;
  const project = (p: LatLng): XY => ({ x: p.longitude * kx, y: p.latitude * ky });
  return [track1.map(project), track2.map(project)];
}

function polylineLength(points: XY[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

/**
 * Resamples a polyline at a fixed distance step, so the comparison depends on
 * the route only - not on speed, pauses or the device's recording rate.
 */
function resample(points: XY[], step: number): XY[] {
  if (points.length < 2) return points.slice();
  const out: XY[] = [points[0]];
  let carried = 0; // distance travelled since the last emitted point
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLength = Math.hypot(b.x - a.x, b.y - a.y);
    let offset = step - carried;
    while (offset <= segLength) {
      const t = offset / segLength;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      offset += step;
    }
    carried = segLength - (offset - step);
  }
  const last = points.at(-1) as XY;
  const tail = out.at(-1) as XY;
  if (tail.x !== last.x || tail.y !== last.y) out.push(last);
  return out;
}

function pointToSegmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Uniform grid over the segments of a polyline, keyed by segment midpoint.
 * With cellSize >= radius + maxSegment / 2, every segment that comes within
 * `radius` of a query point has its midpoint in the query's 3x3 neighbourhood.
 */
class SegmentGrid {
  private readonly cells = new Map<string, number[]>();
  private readonly cellSize: number;

  constructor(
    readonly points: XY[],
    radius: number,
    maxSegment: number
  ) {
    this.cellSize = radius + maxSegment / 2;
    const segmentCount = Math.max(points.length - 1, 1);
    for (let i = 0; i < segmentCount; i++) {
      const a = points[i];
      const b = points[Math.min(i + 1, points.length - 1)];
      const key = this.key(
        Math.floor((a.x + b.x) / 2 / this.cellSize),
        Math.floor((a.y + b.y) / 2 / this.cellSize)
      );
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(i);
      else this.cells.set(key, [i]);
    }
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  findClosestSegment(p: XY, radius: number): { index: number; dist: number } | null {
    const cx = Math.floor(p.x / this.cellSize);
    const cy = Math.floor(p.y / this.cellSize);
    let bestDist = radius;
    let bestIndex = -1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this.key(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const i of bucket) {
          const a = this.points[i];
          const b = this.points[Math.min(i + 1, this.points.length - 1)];
          const dist = pointToSegmentDistance(p, a, b);
          if (dist <= bestDist) {
            bestDist = dist;
            bestIndex = i;
          }
        }
      }
    }
    return bestIndex >= 0 ? { index: bestIndex, dist: bestDist } : null;
  }
}

interface CoverageAnalysis {
  coverage: number;
  alignedCount: number;
  opposedCount: number;
}

function analyzeCoverage(points: XY[], grid: SegmentGrid, radius: number): CoverageAnalysis {
  let inside = 0;
  let alignedCount = 0;
  let opposedCount = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const match = grid.findClosestSegment(p, radius);
    if (!match) continue;
    inside++;

    // Compute tangent of current track at point i
    const nextIdx = Math.min(i + 1, points.length - 1);
    const prevIdx = Math.max(i - 1, 0);
    const tdx = points[nextIdx].x - points[prevIdx].x;
    const tdy = points[nextIdx].y - points[prevIdx].y;

    // Compute tangent of matched segment in other track
    const a = grid.points[match.index];
    const b = grid.points[Math.min(match.index + 1, grid.points.length - 1)];
    const mdx = b.x - a.x;
    const mdy = b.y - a.y;

    const dot = tdx * mdx + tdy * mdy;
    if (dot > 0) {
      alignedCount++;
    } else if (dot < 0) {
      opposedCount++;
    }
  }

  return {
    coverage: points.length === 0 ? 0 : inside / points.length,
    alignedCount,
    opposedCount
  };
}

/**
 * Compares two activity tracks with a corridor-overlap metric and direction analysis
 * (ONT-SPATIAL-04).
 *
 * Both tracks are resampled every ~10 m along their length, then for each
 * track we measure the fraction of its points lying within
 * {@link CORRIDOR_RADIUS_M} of the other track's polyline. The similarity is
 * the smaller of the two fractions.
 *
 * Additionally, each covered point's heading tangent is compared against the
 * matched segment's tangent. If a substantial majority of covered points are opposed,
 * `reversed` is true.
 *
 * @param track1 The first track, an array of LatLng points.
 * @param track2 The second track, an array of LatLng points.
 * @param radius Corridor half-width in metres.
 * @returns An object `{ similarity: number, reversed: boolean }`.
 */
export function compareTracks(
  track1: LatLng[],
  track2: LatLng[],
  radius: number = CORRIDOR_RADIUS_M
): TrackComparisonResult {
  const clean1 = (track1 ?? []).filter(isValidPoint);
  const clean2 = (track2 ?? []).filter(isValidPoint);
  if (clean1.length === 0 || clean2.length === 0) {
    return { similarity: 0, reversed: false };
  }

  const [xy1, xy2] = projectTracks(clean1, clean2);
  const longest = Math.max(polylineLength(xy1), polylineLength(xy2));
  const step = Math.max(RESAMPLE_STEP_M, longest / MAX_RESAMPLED_POINTS);
  const r1 = resample(xy1, step);
  const r2 = resample(xy2, step);

  const res1 = analyzeCoverage(r1, new SegmentGrid(r2, radius, step), radius);
  const res2 = analyzeCoverage(r2, new SegmentGrid(r1, radius, step), radius);

  const similarity = Math.min(res1.coverage, res2.coverage);

  const totalAligned = res1.alignedCount + res2.alignedCount;
  const totalOpposed = res1.opposedCount + res2.opposedCount;
  const reversed =
    totalOpposed > totalAligned && totalOpposed > (totalAligned + totalOpposed) * 0.6;

  return { similarity, reversed };
}

export async function findSimilarActivitiesByTrack(
  activity: Activity,
  similarActivities: Activity[]
): Promise<{ activity: Activity; similarity: number; reversed: boolean }[]> {
  if (similarActivities.length === 0) {
    return [];
  }
  simpleLogger.log(
    `Finding similar activities by track for activity ${activity.id} among ${similarActivities.length} candidates...`
  );
  const streams = await getActivityStreams([activity, ...similarActivities]);

  simpleLogger.log(
    `Found ${streams.length} streams out of ${similarActivities.length + 1} activities`,
    {
      activityId: activity.id,
      similarCount: similarActivities.length,
      streamsFound: streams.length,
      missingStreams: similarActivities.length + 1 - streams.length
    }
  );

  const activityStream = streams.find(s => s.activity.id === activity.id);

  if (!activityStream?.streamSet.coordinates) {
    simpleLogger.warn(`No stream found for current activity ${activity.id}`, {
      activityId: activity.id,
      hasStream: !!activityStream,
      hasCoordinates: !!activityStream?.streamSet.coordinates,
      coordinatesLength: activityStream?.streamSet.coordinates?.length || 0
    });
    return [];
  }

  let missingStreams = 0;
  const similarActivitiesWithTracks = similarActivities.map(otherActivity => {
    const otherActivityStream = streams.find(s => s.activity.id === otherActivity.id);
    if (!otherActivityStream?.streamSet.coordinates) {
      missingStreams++;
      simpleLogger.warn(`No stream found for similar activity ${otherActivity.id}`, {
        activityId: otherActivity.id,
        hasStream: !!otherActivityStream,
        hasCoordinates: !!otherActivityStream?.streamSet.coordinates
      });
      return { activity: otherActivity, similarity: 0, reversed: false };
    }

    const { similarity, reversed } = compareTracks(
      activityStream.streamSet.coordinates,
      otherActivityStream.streamSet.coordinates
    );
    return { activity: otherActivity, similarity, reversed };
  });

  simpleLogger.log(`Completed similarity calculation for activity ${activity.id}`, {
    activityId: activity.id,
    totalSimilar: similarActivitiesWithTracks.length,
    withoutStreams: missingStreams
  });

  return similarActivitiesWithTracks;
}
