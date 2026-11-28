import { useTheme } from '@/theme';
import React, { Ref, useCallback, useMemo } from 'react';
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import {
  FlyoverProgressEventPayload,
  FlyoverSegmentStartEventPayload,
  GoogleMaps3DNativeView,
  GoogleMaps3DViewRef,
  Map3DCoordinate,
  Map3DErrorEventPayload,
  Map3DModeType,
  NativeSyntheticEvent
} from '../../modules/google-maps-3d/src';
import { simplifyGpsTrack } from '../utils/gpsSmoothing';

export type {
  FlyoverSegmentStartEventPayload,
  GoogleMaps3DViewRef,
  Map3DCoordinate,
  Map3DModeType
};

export interface GoogleMap3DFlyoverProps {
  ref?: Ref<GoogleMaps3DViewRef>;
  coordinates: Map3DCoordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  isPlaying?: boolean;
  speedMultiplier?: number;
  cameraTilt?: number;
  cameraRange?: number;
  mapMode?: Map3DModeType;
  /**
   * Optional Douglas-Peucker simplification tolerance in meters before sending
   * coordinates over the native bridge. Defaults to 8m. Pass 0 to disable.
   */
  smoothingToleranceMeters?: number;
  onMapReady?: () => void;
  onMapError?: (message: string) => void;
  onFlyoverProgress?: (progress: number) => void;
  onFlyoverSegmentStart?: (segment: FlyoverSegmentStartEventPayload) => void;
  onFlyoverComplete?: () => void;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_STROKE_COLOR = '#FC4C02';
const DEFAULT_STROKE_WIDTH = 12;
const DEFAULT_SPEED_MULTIPLIER = 1.0;
const DEFAULT_CAMERA_TILT = 65.0;
const DEFAULT_CAMERA_RANGE = 800.0;
const DEFAULT_SMOOTHING_TOLERANCE_METERS = 8;

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1
    },
    nativeMap: {
      flex: 1
    },
    fallbackContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: theme.surface
    },
    fallbackTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.textStrong,
      textAlign: 'center',
      marginBottom: 8
    },
    fallbackSubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: 20
    }
  });

export function GoogleMap3DFlyover({
  ref,
  coordinates,
  strokeColor = DEFAULT_STROKE_COLOR,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  isPlaying = false,
  speedMultiplier = DEFAULT_SPEED_MULTIPLIER,
  cameraTilt = DEFAULT_CAMERA_TILT,
  cameraRange = DEFAULT_CAMERA_RANGE,
  mapMode = 'HYBRID',
  smoothingToleranceMeters = DEFAULT_SMOOTHING_TOLERANCE_METERS,
  onMapReady,
  onMapError,
  onFlyoverProgress,
  onFlyoverSegmentStart,
  onFlyoverComplete,
  style
}: Readonly<GoogleMap3DFlyoverProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const preparedCoordinates = useMemo(
    () =>
      smoothingToleranceMeters > 0
        ? simplifyGpsTrack(coordinates, smoothingToleranceMeters)
        : coordinates,
    [coordinates, smoothingToleranceMeters]
  );

  const handleProgress = useCallback(
    (event: NativeSyntheticEvent<FlyoverProgressEventPayload>) => {
      const progress = event?.nativeEvent?.progress;
      if (typeof progress === 'number' && Number.isFinite(progress)) {
        onFlyoverProgress?.(Math.max(0, Math.min(100, progress)));
      }
    },
    [onFlyoverProgress]
  );

  const handleSegmentStart = useCallback(
    (event: NativeSyntheticEvent<FlyoverSegmentStartEventPayload>) => {
      const payload = event?.nativeEvent;
      if (
        payload &&
        Number.isFinite(payload.fromProgress) &&
        Number.isFinite(payload.toProgress) &&
        Number.isFinite(payload.durationMs)
      ) {
        onFlyoverSegmentStart?.({
          fromProgress: Math.max(0, Math.min(100, payload.fromProgress)),
          toProgress: Math.max(0, Math.min(100, payload.toProgress)),
          durationMs: Math.max(0, payload.durationMs)
        });
      }
    },
    [onFlyoverSegmentStart]
  );

  const handleMapError = useCallback(
    (event: NativeSyntheticEvent<Map3DErrorEventPayload>) => {
      const message = event?.nativeEvent?.message ?? '3D map failed to load';
      onMapError?.(message);
    },
    [onMapError]
  );

  if (Platform.OS !== 'android') {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackTitle}>Google Maps 3D SDK (Android)</Text>
        <Text style={styles.fallbackSubtitle}>
          Photorealistic 3D flyover rendering uses Google Maps 3D SDK for Android.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <GoogleMaps3DNativeView
        ref={ref}
        style={styles.nativeMap}
        coordinates={preparedCoordinates}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        isPlaying={isPlaying}
        speedMultiplier={speedMultiplier}
        cameraTilt={cameraTilt}
        cameraRange={cameraRange}
        mapMode={mapMode}
        onMapReady={onMapReady}
        onMapError={handleMapError}
        onFlyoverProgress={handleProgress}
        onFlyoverSegmentStart={handleSegmentStart}
        onFlyoverComplete={onFlyoverComplete}
      />
    </View>
  );
}

export default GoogleMap3DFlyover;
