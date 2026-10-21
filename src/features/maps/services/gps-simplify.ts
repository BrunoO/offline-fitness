import { LatLng } from '@/shared';

/**
 * Simplifies a GPS track using a combination of radial distance and Douglas-Peucker algorithms.
 * @param points The points of the GPS track.
 * @param tolerance The tolerance for simplification.
 * @param highQuality Whether to use high quality simplification.
 * @returns The simplified GPS track.
 */
export function simplifyGPS(points: LatLng[], tolerance = 0.0001, highQuality = true): LatLng[] {
  if (points.length <= 2) return points;

  const sqTolerance = tolerance * tolerance;

  if (!highQuality) {
    points = simplifyRadialDistance(points, sqTolerance);
  }
  points = simplifyDouglasPeucker(points, sqTolerance);

  return points;
}

/**
 * Calculates the square distance between two points.
 * @param p1 The first point.
 * @param p2 The second point.
 * @returns The square distance between the two points.
 */
function getSqDist(p1: LatLng, p2: LatLng): number {
  const dx = p1.longitude - p2.longitude;
  const dy = p1.latitude - p2.latitude;
  return dx * dx + dy * dy;
}

/**
 * Calculates the square distance from a point to a line segment.
 * @param p The point.
 * @param p1 The start point of the line segment.
 * @param p2 The end point of the line segment.
 * @returns The square distance from the point to the line segment.
 */
function getSqSegDist(p: LatLng, p1: LatLng, p2: LatLng): number {
  let x = p1.longitude;
  let y = p1.latitude;
  const dx = p2.longitude - x;
  const dy = p2.latitude - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p.longitude - x) * dx + (p.latitude - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.longitude;
      y = p2.latitude;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  return getSqDist(p, { latitude: y, longitude: x });
}

/**
 * Simplifies a GPS track using the radial distance algorithm.
 * @param points The points of the GPS track.
 * @param sqTolerance The square tolerance for simplification.
 * @returns The simplified GPS track.
 */
function simplifyRadialDistance(points: LatLng[], sqTolerance: number): LatLng[] {
  let prevPoint = points[0];
  const newPoints = [prevPoint];

  for (let i = 1; i < points.length; i++) {
    if (getSqDist(points[i], prevPoint) > sqTolerance) {
      newPoints.push(points[i]);
      prevPoint = points[i];
    }
  }

  if (prevPoint !== points[points.length - 1]) {
    newPoints.push(points[points.length - 1]);
  }
  return newPoints;
}

/**
 * Simplifies a GPS track using the Douglas-Peucker algorithm.
 * @param points The points of the GPS track.
 * @param sqTolerance The square tolerance for simplification.
 * @returns The simplified GPS track.
 */
function simplifyDouglasPeucker(points: LatLng[], sqTolerance: number): LatLng[] {
  const len = points.length;
  const markers = new Uint8Array(len);

  markers[0] = markers[len - 1] = 1;
  simplifyDPStep(points, markers, sqTolerance, 0, len - 1);

  const newPoints: LatLng[] = [];
  for (let i = 0; i < len; i++) {
    if (markers[i]) newPoints.push(points[i]);
  }

  return newPoints;
}

/**
 * The recursive step of the Douglas-Peucker algorithm.
 * @param points The points of the GPS track.
 * @param markers The markers for the points to keep.
 * @param sqTolerance The square tolerance for simplification.
 * @param first The index of the first point.
 * @param last The index of the last point.
 */
function simplifyDPStep(
  points: LatLng[],
  markers: Uint8Array,
  sqTolerance: number,
  first: number,
  last: number
) {
  let maxSqDist = sqTolerance;
  let index = 0;

  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if (maxSqDist > sqTolerance) {
    markers[index] = 1;
    simplifyDPStep(points, markers, sqTolerance, first, index);
    simplifyDPStep(points, markers, sqTolerance, index, last);
  }
}
