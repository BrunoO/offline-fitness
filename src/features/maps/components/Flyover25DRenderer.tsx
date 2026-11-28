import { ActivityStream, LatLng } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import MapView, { MapType, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import {
  computeAdaptiveZoom,
  computeFollowCameraCenter,
  computeLookAheadBearing,
  haversineDistance,
  interpolateAngle,
  shortestAngularDifference
} from '../services/flyoverInterpolator';
import { HAS_GOOGLE_MAPS_KEY } from '../services/googleMapsKey';
import { FlyoverCameraMode, FlyoverPoint, FlyoverTrack } from '../types/flyover.types';
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

const ENDPOINT_DOT_STYLE: ViewStyle = {
  width: 12,
  height: 12,
  borderRadius: 6,
  borderWidth: 2,
  borderColor: '#FFFFFF'
};

export interface Flyover25DRendererProps {
  stream: ActivityStream;
  track: FlyoverTrack;
  currentPoint: FlyoverPoint | null;
  traveledCoordinates: LatLng[];
  mapType: MapType;
  cameraMode: FlyoverCameraMode;
  active: boolean;
  /** Increment to force an immediate (unthrottled) camera update, e.g. on seek complete or mode change. */
  forceCameraTick?: number;
  style?: StyleProp<ViewStyle>;
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    map: {
      ...StyleSheet.absoluteFill
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

export default function Flyover25DRenderer({
  stream,
  track,
  currentPoint,
  traveledCoordinates,
  mapType,
  cameraMode,
  active,
  forceCameraTick = 0,
  style
}: Readonly<Flyover25DRendererProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const mapRef = useRef<MapView | null>(null);
  const lastCameraUpdateRef = useRef(0);
  const lastHeadingRef = useRef<number | null>(null);
  const lastCenterRef = useRef<LatLng | null>(null);

  const applyCamera = useCallback(
    (force: boolean) => {
      dispatchCameraUpdate({
        map: mapRef.current,
        point: currentPoint,
        track,
        cameraMode,
        force,
        coordinates: stream.coordinates,
        lastCameraUpdateRef,
        lastHeadingRef,
        lastCenterRef
      });
    },
    [currentPoint, track, cameraMode, stream.coordinates]
  );

  useEffect(() => {
    if (!active) {
      lastHeadingRef.current = null;
      lastCenterRef.current = null;
      return;
    }
    if (currentPoint && cameraMode !== 'overview') {
      applyCamera(false);
    }
  }, [active, currentPoint, cameraMode, applyCamera]);

  useEffect(() => {
    if (active && forceCameraTick > 0) {
      applyCamera(true);
    }
  }, [active, forceCameraTick, applyCamera]);

  const handleMapReady = useCallback(() => {
    applyCamera(true);
  }, [applyCamera]);

  if (!HAS_GOOGLE_MAPS_KEY) {
    return <MapsUnavailablePlaceholder />;
  }

  const initialCoord = stream.coordinates[0] ?? { latitude: 0, longitude: 0 };
  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      provider={provider}
      mapType={mapType}
      initialRegion={{
        latitude: initialCoord.latitude,
        longitude: initialCoord.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005
      }}
      onMapReady={handleMapReady}
      showsCompass={false}
      showsScale={false}
      pitchEnabled
      rotateEnabled
    >
      <FlyoverMapLayers
        streamCoordinates={stream.coordinates}
        traveledCoordinates={traveledCoordinates}
        currentPoint={currentPoint}
        cameraMode={cameraMode}
        primaryColor={theme.primary}
        markerContainerStyle={styles.markerContainer}
      />
    </MapView>
  );
}
