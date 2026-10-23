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
export const NO_GPS_ACTIVITY_TYPES = new Set<string>([
  'Yoga',
  'Workout',
  'WeightTraining',
  'Pilates',
  'Crossfit',
  'PhysicalTherapy',
  'Elliptical',
  'StairStepper'
]);

export function isNoGpsActivity(type: string): boolean {
  return NO_GPS_ACTIVITY_TYPES.has(type);
}
