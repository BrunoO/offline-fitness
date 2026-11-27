export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Computes great-circle distance between two GPS coordinates in meters using the Haversine formula.
 */
export function haversineDistanceMeters(a: GpsPoint, b: GpsPoint): number {
  const lat1 = a.latitude * DEG_TO_RAD;
  const lat2 = b.latitude * DEG_TO_RAD;
  const dLat = lat2 - lat1;
  const dLon = (b.longitude - a.longitude) * DEG_TO_RAD;

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes total length of a GPS track in meters.
 */
export function computeTrackDistanceMeters(points: readonly GpsPoint[]): number {
  if (points.length < 2) {
    return 0;
  }
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineDistanceMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Perpendicular distance in meters from point `p` to segment `a -> b`
 * using a local equirectangular tangent-plane projection centered at `a`.
 */
function perpendicularDistanceMeters(p: GpsPoint, a: GpsPoint, b: GpsPoint): number {
  const refLatRad = a.latitude * DEG_TO_RAD;
  const cosLat = Math.cos(refLatRad);

  const px = (p.longitude - a.longitude) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosLat;
  const py = (p.latitude - a.latitude) * DEG_TO_RAD * EARTH_RADIUS_METERS;
  const bx = (b.longitude - a.longitude) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosLat;
  const by = (b.latitude - a.latitude) * DEG_TO_RAD * EARTH_RADIUS_METERS;

  const segLenSq = bx * bx + by * by;
  if (segLenSq === 0) {
    return Math.hypot(px, py);
  }

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  const projX = t * bx;
  const projY = t * by;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Iterative Douglas-Peucker GPS track simplification.
 *
 * Removes redundant vertices whose perpendicular deviation from the simplified
 * polyline is <= `toleranceMeters`, while preserving start/end points and any
 * attached altitude values.
 *
 * @param points Raw GPS track points.
 * @param toleranceMeters Maximum allowed lateral deviation in meters (default: 8m).
 * @returns Simplified array of GPS points.
 */
export function simplifyGpsTrack<T extends GpsPoint>(
  points: readonly T[],
  toleranceMeters = 8
): T[] {
  if (points.length <= 2 || !Number.isFinite(toleranceMeters) || toleranceMeters <= 0) {
    return points.slice();
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Explicit stack avoids call-stack overflow on long multi-hour GPX tracks.
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) {
      break;
    }
    const [startIndex, endIndex] = range;
    let maxDist = -1;
    let maxIndex = -1;

    const startPoint = points[startIndex];
    const endPoint = points[endIndex];

    for (let i = startIndex + 1; i < endIndex; i += 1) {
      const dist = perpendicularDistanceMeters(points[i], startPoint, endPoint);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceMeters && maxIndex !== -1) {
      keep[maxIndex] = 1;
      if (maxIndex - startIndex > 1) {
        stack.push([startIndex, maxIndex]);
      }
      if (endIndex - maxIndex > 1) {
        stack.push([maxIndex, endIndex]);
      }
    }
  }

  const result: T[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i] === 1) {
      result.push(points[i]);
    }
  }
  return result;
}
