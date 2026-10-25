// Maps Feature - Public API
// This file exports all public interfaces for the maps feature

// Components
export { default as MiniMapComponent } from './components/MiniMapComponent';
export type { MiniMapComponentProps } from './components/MiniMapComponent';

// Screens
export { default as MapsScreen } from './screens/MapsScreen';

// Services
export { simplifyGPS } from './services/gps-simplify';

// Flyover Mathematics & Data Pipeline
export type { FlyoverPipelineOptions, FlyoverPoint, FlyoverTrack } from './types/flyover.types';
export {
  buildFlyoverTrack,
  calculateBearing,
  circularMean,
  getFlyoverPointAtProgress,
  getFlyoverPointAtTime,
  haversineDistance,
  interpolateAngle,
  interpolateFlyoverPoint,
  resampleTrackByDistance,
  shortestAngularDifference
} from './services/flyoverInterpolator';
