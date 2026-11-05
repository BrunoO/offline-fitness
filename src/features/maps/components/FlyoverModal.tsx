import { ActivityStream, LatLng } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import MapView, { MapType, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFlyoverPlayback } from '../hooks/useFlyoverPlayback';
import { HAS_GOOGLE_MAPS_KEY } from '../services/googleMapsKey';
import {
  buildElevationSparkline,
  computeAdaptiveZoom,
  computeFollowCameraCenter,
  computeLookAheadBearing,
  getFlyoverPointAtProgress,
  getFlyoverPointAtTime,
  haversineDistance,
  interpolateAngle,
  shortestAngularDifference
} from '../services/flyoverInterpolator';
import { FlyoverCameraMode, FlyoverPoint, FlyoverTrack } from '../types/flyover.types';
import FlyoverControls from './FlyoverControls';
import FlyoverHeader from './FlyoverHeader';
import FlyoverHud from './FlyoverHud';
import MapsUnavailablePlaceholder from './MapsUnavailablePlaceholder';

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
  activityType?: string;
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
  streamCoordinates?: LatLng[];
  traveledCoordinates: LatLng[];
  currentPoint: FlyoverPoint | null;
  cameraMode: FlyoverCameraMode;
  primaryColor: string;
  markerContainerStyle: StyleProp<ViewStyle>;
}

const ENDPOINT_DOT_STYLE: ViewStyle = {
  width: 12,
  height: 12,
  borderRadius: 6,
  borderWidth: 2,
  borderColor: '#FFFFFF'
};

function FlyoverMapLayers({
  streamCoordinates,
  traveledCoordinates,
  currentPoint,
  cameraMode,
  primaryColor,
  markerContainerStyle
}: Readonly<FlyoverMapLayersProps>) {
  const showOverviewRoute =
    cameraMode === 'overview' && Boolean(streamCoordinates && streamCoordinates.length > 1);
  const startCoord = streamCoordinates?.[0];
  const finishCoord =
    streamCoordinates && streamCoordinates.length > 1 ? streamCoordinates.at(-1) : undefined;

  return (
    <>
      {showOverviewRoute && streamCoordinates ? (
        <Polyline
          coordinates={streamCoordinates}
          strokeColor="rgba(255, 255, 255, 0.45)"
          strokeWidth={3}
        />
      ) : null}

      {traveledCoordinates.length > 1 ? (
        <Polyline coordinates={traveledCoordinates} strokeColor={primaryColor} strokeWidth={5} />
      ) : null}

      {startCoord ? (
        <Marker
          coordinate={startCoord}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          tappable={false}
          tracksViewChanges={false}
        >
          <View
            testID="flyover-start-pin"
            pointerEvents="none"
            style={[ENDPOINT_DOT_STYLE, { backgroundColor: '#16A34A' }]}
          />
        </Marker>
      ) : null}

      {finishCoord ? (
        <Marker
          coordinate={finishCoord}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          tappable={false}
          tracksViewChanges={false}
        >
          <View
            testID="flyover-finish-pin"
            pointerEvents="none"
            style={[ENDPOINT_DOT_STYLE, { backgroundColor: '#18181B' }]}
          />
        </Marker>
      ) : null}

      {currentPoint ? (
        <Marker
          coordinate={{
            latitude: currentPoint.latitude,
            longitude: currentPoint.longitude
          }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          tappable={false}
          tracksViewChanges={false}
          rotation={currentPoint.smoothBearing}
        >
          <View style={markerContainerStyle} pointerEvents="none">
            <Ionicons
              name="navigate"
              size={18}
              color={primaryColor}
              style={{ transform: [{ rotate: '-45deg' }] }}
            />
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
  const center = computeFollowCameraCenter(track, point);
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
  if (track.totalDistance > 0) {
    return getFlyoverPointAtProgress(track, targetProgress);
  }
  const startTime = track.points[0].time;
  const targetTime = startTime + targetProgress * track.totalDuration;
  return getFlyoverPointAtTime(track, targetTime);
}

interface DispatchCameraUpdateParams extends CameraAnimationParams {
  coordinates: LatLng[] | undefined;
  lastCameraUpdateRef: React.RefObject<number>;
}

function dispatchCameraUpdate({
  map,
  point,
  track,
  cameraMode,
  force,
  coordinates,
  lastCameraUpdateRef,
  lastHeadingRef,
  lastCenterRef
}: DispatchCameraUpdateParams): void {
  if (!map) return;
  if (cameraMode === 'overview') {
    if (force) {
      fitMapToOverview(map, coordinates);
    }
    return;
  }
  if (!point) return;
  const now = Date.now();
  if (!force && now - lastCameraUpdateRef.current < CAMERA_UPDATE_THROTTLE_MS) {
    return;
  }
  lastCameraUpdateRef.current = now;
  animateCameraByMode({
    map,
    point,
    track,
    cameraMode,
    force,
    lastHeadingRef,
    lastCenterRef
  });
}

function resolveInitialMapState(stream: ActivityStream | undefined | null): {
  provider: typeof PROVIDER_GOOGLE | undefined;
  hasValidTrack: boolean;
  initialCoord: LatLng;
} {
  const coordinates = stream?.coordinates;
  const hasValidTrack = Boolean(coordinates && coordinates.length >= 2);
  const initialCoord = coordinates?.[0] ?? { latitude: 0, longitude: 0 };
  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
  return { provider, hasValidTrack, initialCoord };
}

function resolveHudMetrics(currentPoint: FlyoverPoint | null): {
  speedMps: number;
  altitudeMeters: number;
  gradePercent: number | undefined;
  heartrateBpm: number | null | undefined;
} {
  if (!currentPoint) {
    return {
      speedMps: 0,
      altitudeMeters: 0,
      gradePercent: undefined,
      heartrateBpm: undefined
    };
  }
  return {
    speedMps: currentPoint.speed,
    altitudeMeters: currentPoint.altitude,
    gradePercent: currentPoint.grade,
    heartrateBpm: currentPoint.heartrate
  };
}

function useKeepFlyoverAwake(visible: boolean): void {
  // Keep the screen awake while the flyover is on screen, so a long flyover
  // (which can run for over a minute) does not let the display dim/black out.
  useEffect(() => {
    if (visible) {
      void activateKeepAwakeAsync();
    } else {
      void deactivateKeepAwake();
    }
    return () => {
      void deactivateKeepAwake();
    };
  }, [visible]);
}

function shouldFollowCameraUpdate(
  visible: boolean,
  currentPoint: FlyoverPoint | null,
  cameraMode: FlyoverCameraMode
): boolean {
  if (!visible || !currentPoint) return false;
  return cameraMode !== 'overview';
}

export default function FlyoverModal({
  visible,
  onClose,
  stream,
  title = 'Route Flyover',
  activityType
}: Readonly<FlyoverModalProps>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(theme, insets.top, insets.bottom),
    [theme, insets.top, insets.bottom]
  );

  useKeepFlyoverAwake(visible);

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
      dispatchCameraUpdate({
        map: mapRef.current,
        point: targetPoint,
        track: playback.track,
        cameraMode: mode,
        force,
        coordinates: stream?.coordinates,
        lastCameraUpdateRef,
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
    if (shouldFollowCameraUpdate(visible, currentPoint, cameraMode)) {
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

  const { provider, hasValidTrack, initialCoord } = resolveInitialMapState(stream);
  const hudMetrics = resolveHudMetrics(currentPoint);
  const elevationSparkline = useMemo(
    () => buildElevationSparkline(playback.track),
    [playback.track]
  );

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
            {HAS_GOOGLE_MAPS_KEY ? (
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
                  streamCoordinates={stream?.coordinates}
                  traveledCoordinates={traveledCoordinates}
                  currentPoint={currentPoint}
                  cameraMode={cameraMode}
                  primaryColor={theme.primary}
                  markerContainerStyle={styles.markerContainer}
                />
              </MapView>
            ) : (
              <MapsUnavailablePlaceholder />
            )}

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
                speedMps={hudMetrics.speedMps}
                completedDistanceMeters={completedDistanceMeters}
                totalDistanceMeters={totalDistanceMeters}
                altitudeMeters={hudMetrics.altitudeMeters}
                elapsedSeconds={elapsedSeconds}
                totalDurationSeconds={totalDurationSeconds}
                activityType={activityType}
                gradePercent={hudMetrics.gradePercent}
                heartrateBpm={hudMetrics.heartrateBpm}
              />
            </View>

            <View style={styles.controlsContainer}>
              <FlyoverControls
                isPlaying={isPlaying}
                progress={progress}
                speedMultiplier={speedMultiplier}
                elevationProfile={elevationSparkline}
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
