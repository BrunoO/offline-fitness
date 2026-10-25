import { LatLng } from '@/shared';

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

export interface FlyoverPlaybackOptions extends FlyoverPipelineOptions {
  /** Initial speed multiplier (e.g. 0.5, 1, 2, 4). Default: 1 */
  initialSpeed?: number;
  /** Whether to start playback immediately upon mounting. Default: false */
  autoPlay?: boolean;
  /** Whether to restart automatically from beginning upon reaching the finish. Default: false */
  loop?: boolean;
  /** Target full animation duration in seconds at 1x speed. Default: 30 */
  targetDurationSeconds?: number;
}

export interface FlyoverPlaybackState {
  /** The processed flyover track */
  track: FlyoverTrack;
  /** Whether playback is currently active */
  isPlaying: boolean;
  /** Current progress fraction in [0, 1] */
  progress: number;
  /** Current active speed multiplier */
  speedMultiplier: number;
  /** The interpolated FlyoverPoint at the current progress */
  currentPoint: FlyoverPoint | null;
  /** Elapsed simulation time in seconds from start */
  elapsedSeconds: number;
  /** Total route duration in seconds */
  totalDurationSeconds: number;
  /** Cumulative distance traveled so far in meters */
  completedDistanceMeters: number;
  /** Total route distance in meters */
  totalDistanceMeters: number;
  /** Sub-array of coordinates traveled up to current point (for breadcrumb rendering) */
  traveledCoordinates: LatLng[];
  /** Start playback */
  play: () => void;
  /** Pause playback */
  pause: () => void;
  /** Toggle play/pause state */
  togglePlay: () => void;
  /** Seek directly to progress fraction [0, 1] */
  seekTo: (targetProgress: number) => void;
  /** Seek directly to elapsed simulation time in seconds */
  seekToTime: (timeSeconds: number) => void;
  /** Change playback speed multiplier */
  setSpeed: (multiplier: number) => void;
  /** Reset playback to the beginning and start playing */
  restart: () => void;
}
