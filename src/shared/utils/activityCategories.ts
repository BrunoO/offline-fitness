/**
 * Activity types that carry no GPS track and no meaningful geographic data
 * (distance, elevation). These are excluded from map views, stream downloads,
 * and location-based statistics such as distance and elevation tables.
 *
 * Time-based statistics (hours tables, weekly goals) still include these types
 * because they do have a valid duration.
 *
 * To support a new GPS-less activity type, add its Strava type string here.
 */
export const NO_GPS_ACTIVITY_TYPES = new Set<string>(['Yoga']);

export function isNoGpsActivity(type: string): boolean {
  return NO_GPS_ACTIVITY_TYPES.has(type);
}

/**
 * Maps Strava activity type strings to the canonical names used throughout the app.
 *
 * Strava occasionally changes or inconsistently returns type values; this
 * single mapping keeps the internal representation stable without scattering
 * workarounds across files.
 *
 * To handle a new Strava type rename, add the mapping here.
 */
export const ACTIVITY_TYPE_NORMALIZATIONS: Readonly<Record<string, string>> = {
  Workout: 'Yoga' // Strava started returning 'Workout' for Yoga activities from 2025-08-20
};

export function normalizeActivityType(type: string): string {
  return ACTIVITY_TYPE_NORMALIZATIONS[type] ?? type;
}
