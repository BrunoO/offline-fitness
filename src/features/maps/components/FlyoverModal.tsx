import { ActivityStream, LatLng } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import MapView, { MapType, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFlyoverPlayback } from '../hooks/useFlyoverPlayback';
import {
  computeAdaptiveZoom,
  computeLookAheadBearing,
  getFlyoverPointAtTime,
  haversineDistance,
  interpolateAngle,
  shortestAngularDifference
} from '../services/flyoverInterpolator';
import { FlyoverCameraMode, FlyoverPoint, FlyoverTrack } from '../types/flyover.types';
import FlyoverControls from './FlyoverControls';
import FlyoverHeader from './FlyoverHeader';
import FlyoverHud from './FlyoverHud';

const CAMERA_UPDATE_THROTTLE_MS = 450;
const CAMERA_DURATION_MS = 500;
const FOLLOW_CAMERA_PITCH = 45;
const NORTH_UP_CAMERA_PITCH = 35;
const HEADING_DEADBAND_DEGREES = 15;
const HEADING_DAMPING_FACTOR = 0.35;
const LAZY_FOLLOW_FRACTION = 0.025;
const MIN_LAZY_FOLLOW_METERS = 30;
const MAX_LAZY_FOLLOW_METERS = 400;
const OVERVIEW_PADDING = { top: 140, right: 48, bottom: 180, left: 48 };

export interface FlyoverModalProps {
  visible: boolean;
  onClose: () => void;
  stream: ActivityStream | undefined | null;
  title?: string;
}

const NEXT_MAP_TYPE: Partial<Record<MapType, MapType>> = {
  hybrid: 'satellite',
  satellite: 'terrain',
  terrain: 'standard',
  standard: 'hybrid',
  mutedStandard: 'hybrid'
};

const NEXT_CAMERA_MODE: Record<FlyoverCameraMode, FlyoverCameraMode> = {
  follow: 'north-up',
  'north-up': 'overview',
  overview: 'follow'
};

const createStyles = (theme: ReturnType<typeof useTheme>, topInset: number, bottomInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000'
    },
    map: {
      ...StyleSheet.absoluteFill
    },
    hudContainer: {
      position: 'absolute',
      top: Math.max(topInset, 16) + 64,
      left: 16,
      right: 16,
      zIndex: 9
    },
    controlsContainer: {
      position: 'absolute',
      bottom: Math.max(bottomInset, 16) + 8,
      left: 16,
      right: 16,
      zIndex: 10
    },
    markerContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor:
        theme.scheme === 'dark' ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.95)',
      borderWidth: 2,
      borderColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 4
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      backgroundColor: theme.surface
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textStrong,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center'
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: 20
    }
  });

interface FlyoverMapLayersProps {
  traveledCoordinates: LatLng[];
  currentPoint: FlyoverPoint | null;
  primaryColor: string;
  markerContainerStyle: StyleProp<ViewStyle>;
}

function FlyoverMapLayers({
  traveledCoordinates,
  currentPoint,
  primaryColor,
  markerContainerStyle
}: Readonly<FlyoverMapLayersProps>) {
  return (
    <>
      {traveledCoordinates.length > 1 ? (
        <Polyline coordinates={traveledCoordinates} strokeColor={primaryColor} strokeWidth={5} />
      ) : null}

      {currentPoint ? (
        <Marker
          coordinate={{
            latitude: currentPoint.latitude,
            longitude: currentPoint.longitude
          }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          rotation={currentPoint.smoothBearing}
        >
          <View style={markerContainerStyle}>
            <Ionicons name="navigate" size={18} color={primaryColor} />
          </View>
        </Marker>
      ) : null}
    </>
  );
}

interface CameraAnimationParams {
  map: MapView | null;
  point: FlyoverPoint | null;
  track: FlyoverTrack;
  cameraMode: FlyoverCameraMode;
  force: boolean;
  lastHeadingRef: React.RefObject<number | null>;
  lastCenterRef: React.RefObject<LatLng | null>;
}

function fitMapToOverview(map: MapView | null, coordinates: LatLng[] | undefined): void {
  if (!map || !coordinates || coordinates.length < 2) return;
  map.fitToCoordinates(coordinates, {
    edgePadding: OVERVIEW_PADDING,
    animated: true
  });
}

function resolveDampedHeading(
  track: FlyoverTrack,
  point: FlyoverPoint,
  force: boolean,
  lastHeadingRef: React.RefObject<number | null>
): number {
  const targetHeading = computeLookAheadBearing(track, point);
  if (force || lastHeadingRef.current === null) {
    lastHeadingRef.current = targetHeading;
    return targetHeading;
  }
  const diff = Math.abs(shortestAngularDifference(lastHeadingRef.current, targetHeading));
  if (diff < HEADING_DEADBAND_DEGREES) {
    return lastHeadingRef.current;
  }
  const nextHeading = interpolateAngle(
    lastHeadingRef.current,
    targetHeading,
    HEADING_DAMPING_FACTOR
  );
  lastHeadingRef.current = nextHeading;
  return nextHeading;
}

function shouldSkipNorthUpPan(
  point: FlyoverPoint,
  totalDistance: number,
  force: boolean,
  lastCenterRef: React.RefObject<LatLng | null>
): boolean {
  if (force || !lastCenterRef.current) {
    return false;
  }
  const threshold = Math.max(
    MIN_LAZY_FOLLOW_METERS,
    Math.min(MAX_LAZY_FOLLOW_METERS, totalDistance * LAZY_FOLLOW_FRACTION)
  );
  return haversineDistance(lastCenterRef.current, point) < threshold;
}

function animateCameraByMode({
  map,
  point,
  track,
  cameraMode,
  force,
  lastHeadingRef,
  lastCenterRef
}: CameraAnimationParams): void {
  if (!map || !point || cameraMode === 'overview') return;

  const zoom = computeAdaptiveZoom(track.totalDistance);

  if (cameraMode === 'north-up') {
    if (shouldSkipNorthUpPan(point, track.totalDistance, force, lastCenterRef)) {
      return;
    }
    const center = { latitude: point.latitude, longitude: point.longitude };
    lastCenterRef.current = center;
    lastHeadingRef.current = 0;
    map.animateCamera(
      {
        center,
        heading: 0,
        pitch: NORTH_UP_CAMERA_PITCH,
        zoom
      },
      { duration: CAMERA_DURATION_MS }
    );
    return;
  }

  const heading = resolveDampedHeading(track, point, force, lastHeadingRef);
  const center = { latitude: point.latitude, longitude: point.longitude };
  lastCenterRef.current = center;
  map.animateCamera(
    {
      center,
      heading,
      pitch: FOLLOW_CAMERA_PITCH,
      zoom
    },
    { duration: CAMERA_DURATION_MS }
  );
}

function resolvePointAtProgress(track: FlyoverTrack, targetProgress: number): FlyoverPoint | null {
  if (track.points.length === 0) return null;
  const startTime = track.points[0].time;
  const targetTime = startTime + targetProgress * track.totalDuration;
  return getFlyoverPointAtTime(track, targetTime);
}

export default function FlyoverModal({
  visible,
  onClose,
  stream,
  title = 'Route Flyover'
}: Readonly<FlyoverModalProps>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(theme, insets.top, insets.bottom),
    [theme, insets.top, insets.bottom]
  );

  const [mapType, setMapType] = useState<MapType>('hybrid');
  const [cameraMode, setCameraMode] = useState<FlyoverCameraMode>('follow');
  const mapRef = useRef<MapView | null>(null);
  const lastCameraUpdateRef = useRef(0);
  const lastHeadingRef = useRef<number | null>(null);
  const lastCenterRef = useRef<LatLng | null>(null);
  const wasPlayingBeforeScrubRef = useRef(false);

  const playback = useFlyoverPlayback(stream, { autoPlay: false, loop: false });
  const {
    currentPoint,
    isPlaying,
    progress,
    speedMultiplier,
    traveledCoordinates,
    totalDistanceMeters,
    totalDurationSeconds,
    completedDistanceMeters,
    elapsedSeconds,
    pause,
    play,
    togglePlay,
    seekTo,
    setSpeed,
    restart
  } = playback;

  const cycleMapType = useCallback(() => {
    setMapType(current => NEXT_MAP_TYPE[current] ?? 'hybrid');
  }, []);

  const applyCameraForPoint = useCallback(
    (targetPoint: FlyoverPoint | null, mode: FlyoverCameraMode, force: boolean) => {
      if (!mapRef.current) return;
      if (mode === 'overview') {
        if (force) {
          fitMapToOverview(mapRef.current, stream?.coordinates);
        }
        return;
      }
      if (!targetPoint) return;
      const now = Date.now();
      if (!force && now - lastCameraUpdateRef.current < CAMERA_UPDATE_THROTTLE_MS) {
        return;
      }
      lastCameraUpdateRef.current = now;
      animateCameraByMode({
        map: mapRef.current,
        point: targetPoint,
        track: playback.track,
        cameraMode: mode,
        force,
        lastHeadingRef,
        lastCenterRef
      });
    },
    [playback.track, stream?.coordinates]
  );

  const cycleCameraMode = useCallback(() => {
    const nextMode = NEXT_CAMERA_MODE[cameraMode];
    setCameraMode(nextMode);
    applyCameraForPoint(currentPoint, nextMode, true);
  }, [cameraMode, currentPoint, applyCameraForPoint]);

  useEffect(() => {
    if (visible && currentPoint && cameraMode !== 'overview') {
      applyCameraForPoint(currentPoint, cameraMode, false);
    }
  }, [visible, currentPoint, cameraMode, applyCameraForPoint]);

  const handleSlidingStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    pause();
  }, [isPlaying, pause]);

  const handleSeek = useCallback(
    (targetProgress: number) => {
      seekTo(targetProgress);
      const targetPoint = resolvePointAtProgress(playback.track, targetProgress);
      applyCameraForPoint(targetPoint, cameraMode, false);
    },
    [seekTo, playback.track, cameraMode, applyCameraForPoint]
  );

  const handleSlidingComplete = useCallback(
    (targetProgress: number) => {
      seekTo(targetProgress);
      const targetPoint = resolvePointAtProgress(playback.track, targetProgress);
      applyCameraForPoint(targetPoint, cameraMode, true);
      if (wasPlayingBeforeScrubRef.current) {
        play();
      }
    },
    [seekTo, playback.track, cameraMode, applyCameraForPoint, play]
  );

  const onMapReady = useCallback(() => {
    applyCameraForPoint(currentPoint, cameraMode, true);
  }, [currentPoint, cameraMode, applyCameraForPoint]);

  const handleClose = useCallback(() => {
    pause();
    seekTo(0);
    lastHeadingRef.current = null;
    lastCenterRef.current = null;
    onClose();
  }, [pause, seekTo, onClose]);

  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
  const hasValidTrack = Boolean(stream?.coordinates && stream.coordinates.length >= 2);
  const initialCoord = stream?.coordinates?.[0] ?? { latitude: 0, longitude: 0 };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {hasValidTrack ? (
          <>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={provider}
              mapType={mapType}
              initialRegion={{
                latitude: initialCoord.latitude,
                longitude: initialCoord.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005
              }}
              onMapReady={onMapReady}
              showsCompass={false}
              showsScale={false}
              pitchEnabled
              rotateEnabled
            >
              <FlyoverMapLayers
                traveledCoordinates={traveledCoordinates}
                currentPoint={currentPoint}
                primaryColor={theme.primary}
                markerContainerStyle={styles.markerContainer}
              />
            </MapView>

            <FlyoverHeader
              title={title}
              mapType={mapType}
              cameraMode={cameraMode}
              onClose={handleClose}
              onCycleMapType={cycleMapType}
              onCycleCameraMode={cycleCameraMode}
              topInset={insets.top}
            />

            <View style={styles.hudContainer}>
              <FlyoverHud
                speedMps={currentPoint?.speed ?? 0}
                completedDistanceMeters={completedDistanceMeters}
                totalDistanceMeters={totalDistanceMeters}
                altitudeMeters={currentPoint?.altitude ?? 0}
                elapsedSeconds={elapsedSeconds}
                totalDurationSeconds={totalDurationSeconds}
              />
            </View>

            <View style={styles.controlsContainer}>
              <FlyoverControls
                isPlaying={isPlaying}
                progress={progress}
                speedMultiplier={speedMultiplier}
                onTogglePlay={togglePlay}
                onRestart={restart}
                onSeek={handleSeek}
                onSetSpeed={setSpeed}
                onSlidingStart={handleSlidingStart}
                onSlidingComplete={handleSlidingComplete}
              />
            </View>
          </>
        ) : (
          <>
            <FlyoverHeader
              title={title}
              mapType={mapType}
              cameraMode={cameraMode}
              onClose={handleClose}
              onCycleMapType={cycleMapType}
              onCycleCameraMode={cycleCameraMode}
              topInset={insets.top}
            />
            <View style={styles.emptyContainer}>
              <Ionicons name="location-outline" size={48} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>No GPS Track Data</Text>
              <Text style={styles.emptySubtitle}>
                This activity does not contain recorded GPS coordinates for flyover playback.
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
