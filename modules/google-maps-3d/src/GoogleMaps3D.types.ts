import type { StyleProp, ViewStyle } from 'react-native';

export interface Map3DCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface FlyoverProgressEventPayload {
  progress: number;
}

export interface NativeSyntheticEvent<T> {
  nativeEvent: T;
}

export interface GoogleMaps3DNativeViewProps {
  coordinates: Map3DCoordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  isPlaying?: boolean;
  speedMultiplier?: number;
  cameraTilt?: number;
  cameraRange?: number;
  onMapReady?: () => void;
  onFlyoverProgress?: (event: NativeSyntheticEvent<FlyoverProgressEventPayload>) => void;
  onFlyoverComplete?: () => void;
  style?: StyleProp<ViewStyle>;
}

export interface GoogleMaps3DViewRef {
  restartFlyover: () => Promise<void>;
}
