import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type Map3DModeType = 'HYBRID' | 'SATELLITE';

export interface Map3DCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface FlyoverProgressEventPayload {
  progress: number;
}

export interface FlyoverSegmentStartEventPayload {
  fromProgress: number;
  toProgress: number;
  durationMs: number;
}

export interface NativeSyntheticEvent<T> {
  nativeEvent: T;
}

export interface GoogleMaps3DViewRef {
  restartFlyover: () => Promise<void>;
  seekTo: (progress: number) => Promise<void>;
}

export interface GoogleMaps3DNativeViewProps {
  ref?: Ref<GoogleMaps3DViewRef>;
  coordinates: Map3DCoordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  isPlaying?: boolean;
  speedMultiplier?: number;
  cameraTilt?: number;
  cameraRange?: number;
  mapMode?: Map3DModeType;
  onMapReady?: () => void;
  onFlyoverProgress?: (event: NativeSyntheticEvent<FlyoverProgressEventPayload>) => void;
  onFlyoverSegmentStart?: (event: NativeSyntheticEvent<FlyoverSegmentStartEventPayload>) => void;
  onFlyoverComplete?: () => void;
  style?: StyleProp<ViewStyle>;
}
