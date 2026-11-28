import type { Map3DCoordinate } from '@/components/GoogleMap3DFlyover';
import type { StreamSet } from '@/features/activities/types/stravaActivityStream.model';

/**
 * Converts a raw activity stream into the coordinate array consumed by the
 * Google Maps 3D flyover component.
 *
 * Returns `[]` when the stream has no usable lat/lng series so callers can
 * hide the entry point / show an empty state.
 */
export function activityToFlyoverCoordinates(stream: StreamSet | null): Map3DCoordinate[] {
  const latlng = stream?.latlng?.data;
  if (!latlng || latlng.length === 0) {
    return [];
  }

  const altitudes = stream?.altitude?.data ?? [];
  const result: Map3DCoordinate[] = [];

  for (let i = 0; i < latlng.length; i += 1) {
    const point = latlng[i];
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }
    const [lat, lon] = point;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    const altitude = altitudes[i];
    result.push({
      latitude: lat,
      longitude: lon,
      altitude: Number.isFinite(altitude) ? altitude : 0
    });
  }

  return result;
}

/**
 * Lightweight check for whether a stream contains at least two finite GPS
 * points, avoiding allocating the full coordinate array on render.
 */
export function hasFlyoverTrack(stream: StreamSet | null): boolean {
  const latlng = stream?.latlng?.data;
  if (!latlng || latlng.length < 2) {
    return false;
  }

  let validCount = 0;
  for (const point of latlng) {
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }
    const [lat, lon] = point;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      validCount += 1;
      if (validCount >= 2) {
        return true;
      }
    }
  }

  return false;
}
