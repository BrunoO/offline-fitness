// Maps Feature - Public API
// This file exports all public interfaces for the maps feature

// Components
export { default as MiniMapComponent } from './components/MiniMapComponent';
export type { MiniMapComponentProps } from './components/MiniMapComponent';
export { default as FlyoverModal } from './components/FlyoverModal';
export type { FlyoverModalProps } from './components/FlyoverModal';
export { default as FlyoverHud } from './components/FlyoverHud';
export type { FlyoverHudProps } from './components/FlyoverHud';
export { default as FlyoverControls } from './components/FlyoverControls';
export type { FlyoverControlsProps } from './components/FlyoverControls';

// Screens
export { default as MapsScreen } from './screens/MapsScreen';

// Services
export { simplifyGPS } from './services/gps-simplify';

// Hooks
export { useFlyoverPlayback } from './hooks/useFlyoverPlayback';

// Flyover Mathematics & Data Pipeline
export type {
  FlyoverPipelineOptions,
  FlyoverPlaybackOptions,
  FlyoverPlaybackState,
  FlyoverPoint,
  FlyoverTrack
} from './types/flyover.types';
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
  shortestAngularDifference,
  smoothSpeeds
} from './services/flyoverInterpolator';
