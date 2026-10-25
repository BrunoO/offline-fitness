export interface FlyoverPoint {
  /** Geographic coordinate latitude in degrees */
  latitude: number;
  /** Geographic coordinate longitude in degrees */
  longitude: number;
  /** Altitude in meters above sea level */
  altitude: number;
  /** Elapsed time from route start in seconds */
  time: number;
  /** Cumulative distance along the track in meters from the start */
  distance: number;
  /** Instantaneous speed in meters per second */
  speed: number;
  /** Raw forward bearing in degrees [0, 360) pointing to the next segment */
  bearing: number;
  /** Circular-smoothed bearing in degrees [0, 360) to eliminate camera jitter */
  smoothBearing: number;
  /** Camera pitch/tilt angle in degrees (e.g. 50-65) */
  pitch: number;
}

export interface FlyoverTrack {
  /** Ordered list of processed flyover points */
  points: FlyoverPoint[];
  /** Total cumulative track distance in meters */
  totalDistance: number;
  /** Total elapsed track duration in seconds */
  totalDuration: number;
  /** Minimum altitude encountered across the track (meters) */
  minAltitude: number;
  /** Maximum altitude encountered across the track (meters) */
  maxAltitude: number;
  /** Maximum speed reached across the track in meters per second */
  maxSpeed: number;
}

export interface FlyoverPipelineOptions {
  /** Number of neighboring points to include in circular bearing smoothing (odd integer >= 1). Default: 5 */
  smoothingWindow?: number;
  /** Default camera pitch/tilt angle in degrees [0, 90]. Default: 60 */
  defaultPitch?: number;
  /** Minimum movement distance (in meters) required to compute a new heading. Default: 1.5 */
  minMovementMeters?: number;
}
