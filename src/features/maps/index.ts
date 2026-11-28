// Maps Feature - Public API
// This file exports all public interfaces for the maps feature

// Components
export { default as MiniMapComponent } from './components/MiniMapComponent';
export type { MiniMapComponentProps } from './components/MiniMapComponent';
export { default as Flyover25DRenderer } from './components/Flyover25DRenderer';
export type { Flyover25DRendererProps } from './components/Flyover25DRenderer';
export { default as FlyoverHeader } from './components/FlyoverHeader';
export type { FlyoverHeaderProps, FlyoverRenderMode } from './components/FlyoverHeader';
export { default as FlyoverHud } from './components/FlyoverHud';
export type { FlyoverHudProps } from './components/FlyoverHud';
export { default as FlyoverControls } from './components/FlyoverControls';
export type { FlyoverControlsProps } from './components/FlyoverControls';

// Screens
export { default as MapsScreen } from './screens/MapsScreen';

// Services
export { computeArrowVisualSpec, computeDirectionArrows } from './services/directionArrows';
export type {
  ComputeDirectionArrowsOptions,
  ComputeDirectionArrowsResult,
  DirectionArrowPlacement,
  DirectionArrowVisualSpec
} from './services/directionArrows';
export { simplifyGPS } from './services/gps-simplify';
export { HAS_GOOGLE_MAPS_KEY } from './services/googleMapsKey';

// Hooks
export { useFlyoverPlayback } from './hooks/useFlyoverPlayback';
export { useKeepFlyoverAwake } from './hooks/useKeepFlyoverAwake';

// Flyover Mathematics & Data Pipeline
export type {
  FlyoverCameraMode,
  FlyoverPipelineOptions,
  FlyoverPlaybackOptions,
  FlyoverPlaybackState,
  FlyoverPoint,
  FlyoverTrack
} from './types/flyover.types';
export {
  buildElevationSparkline,
  buildFlyoverTrack,
  calculateBearing,
  circularMean,
  computeAdaptiveZoom,
  computeFollowCameraCenter,
  computeLookAheadBearing,
  getFlyoverPointAtProgress,
  getFlyoverPointAtTime,
  haversineDistance,
  interpolateAngle,
  interpolateFlyoverPoint,
  resampleTrackByDistance,
  shortestAngularDifference,
  smoothSpeeds
} from './services/flyoverInterpolator';
