// Maps Feature - Public API
// This file exports all public interfaces for the maps feature

// Components
export { default as MiniMapComponent } from './components/MiniMapComponent';
export type { MiniMapComponentProps } from './components/MiniMapComponent';

// Screens
export { default as MapsScreen } from './screens/MapsScreen';

// Services
export { simplifyGPS } from './services/gps-simplify';
