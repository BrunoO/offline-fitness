import { ActivityStream, LatLng } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import MapView, { MapType, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFlyoverPlayback } from '../hooks/useFlyoverPlayback';
import { FlyoverPoint } from '../types/flyover.types';
import FlyoverControls from './FlyoverControls';
import FlyoverHeader from './FlyoverHeader';
import FlyoverHud from './FlyoverHud';

const CAMERA_UPDATE_THROTTLE_MS = 100;
const CAMERA_DURATION_MS = 120;
const DEFAULT_CAMERA_ZOOM = 16.5;
const MAP_PADDING = { top: 120, right: 40, bottom: 220, left: 40 };

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
    }
  });

interface FlyoverMapLayersProps {
  streamCoordinates?: LatLng[];
  traveledCoordinates: LatLng[];
  currentPoint: FlyoverPoint | null;
  scheme: 'light' | 'dark';
  primaryColor: string;
  markerContainerStyle: StyleProp<ViewStyle>;
}

function FlyoverMapLayers({
  streamCoordinates,
  traveledCoordinates,
  currentPoint,
  scheme,
  primaryColor,
  markerContainerStyle
}: FlyoverMapLayersProps) {
  const fullRouteColor = scheme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.35)';

  return (
    <>
      {streamCoordinates && streamCoordinates.length > 1 ? (
        <Polyline coordinates={streamCoordinates} strokeColor={fullRouteColor} strokeWidth={4} />
      ) : null}

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
  const mapRef = useRef<MapView | null>(null);
  const lastCameraUpdateRef = useRef(0);
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

  // Toggle map type (hybrid -> satellite -> terrain -> standard)
  const cycleMapType = useCallback(() => {
    setMapType(current => NEXT_MAP_TYPE[current] ?? 'hybrid');
  }, []);

  // Update map camera smoothly along the current point
  const updateCamera = useCallback(
    (force = false) => {
      if (!currentPoint || !mapRef.current) return;
      const now = Date.now();
      if (!force && now - lastCameraUpdateRef.current < CAMERA_UPDATE_THROTTLE_MS) {
        return;
      }
      lastCameraUpdateRef.current = now;

      mapRef.current.animateCamera(
        {
          center: {
            latitude: currentPoint.latitude,
            longitude: currentPoint.longitude
          },
          heading: currentPoint.smoothBearing,
          pitch: currentPoint.pitch,
          zoom: DEFAULT_CAMERA_ZOOM
        },
        { duration: CAMERA_DURATION_MS }
      );
    },
    [currentPoint]
  );

  // Trigger camera update whenever currentPoint changes
  useEffect(() => {
    if (visible && currentPoint) {
      updateCamera();
    }
  }, [visible, currentPoint, updateCamera]);

  // Handle scrubber drag start / end
  const handleSlidingStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    pause();
  }, [isPlaying, pause]);

  const handleSlidingComplete = useCallback(
    (targetProgress: number) => {
      seekTo(targetProgress);
      updateCamera(true);
      if (wasPlayingBeforeScrubRef.current) {
        play();
      }
    },
    [seekTo, updateCamera, play]
  );

  // Initial fit to track on modal open
  const onMapReady = useCallback(() => {
    if (stream?.coordinates && stream.coordinates.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(stream.coordinates, {
        edgePadding: MAP_PADDING,
        animated: false
      });
    }
  }, [stream]);

  // Pause playback when modal is closed
  const handleClose = useCallback(() => {
    pause();
    onClose();
  }, [pause, onClose]);

  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
  const initialCoord = stream?.coordinates?.[0] ?? { latitude: 0, longitude: 0 };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={provider}
          mapType={mapType}
          initialRegion={{
            latitude: initialCoord.latitude,
            longitude: initialCoord.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05
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
            scheme={theme.scheme}
            primaryColor={theme.primary}
            markerContainerStyle={styles.markerContainer}
          />
        </MapView>

        {/* Top Header Bar */}
        <FlyoverHeader
          title={title}
          mapType={mapType}
          onClose={handleClose}
          onCycleMapType={cycleMapType}
          topInset={insets.top}
        />

        {/* Floating HUD Card */}
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

        {/* Bottom Playback Controls */}
        <View style={styles.controlsContainer}>
          <FlyoverControls
            isPlaying={isPlaying}
            progress={progress}
            speedMultiplier={speedMultiplier}
            onTogglePlay={togglePlay}
            onRestart={restart}
            onSeek={seekTo}
            onSetSpeed={setSpeed}
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={handleSlidingComplete}
          />
        </View>
      </View>
    </Modal>
  );
}
