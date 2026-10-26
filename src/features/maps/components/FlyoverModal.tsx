import { ActivityStream, LatLng } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import MapView, { MapType, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFlyoverPlayback } from '../hooks/useFlyoverPlayback';
import { getFlyoverPointAtTime } from '../services/flyoverInterpolator';
import { FlyoverPoint, FlyoverTrack } from '../types/flyover.types';
import FlyoverControls from './FlyoverControls';
import FlyoverHeader from './FlyoverHeader';
import FlyoverHud from './FlyoverHud';

const CAMERA_UPDATE_THROTTLE_MS = 100;
const CAMERA_DURATION_MS = 120;
const DEFAULT_CAMERA_ZOOM = 16.5;

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

function animateToPoint(map: MapView | null, point: FlyoverPoint | null): void {
  if (!map || !point) return;
  map.animateCamera(
    {
      center: {
        latitude: point.latitude,
        longitude: point.longitude
      },
      heading: point.smoothBearing,
      pitch: point.pitch,
      zoom: DEFAULT_CAMERA_ZOOM
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

  const cycleMapType = useCallback(() => {
    setMapType(current => NEXT_MAP_TYPE[current] ?? 'hybrid');
  }, []);

  const updateCamera = useCallback(
    (force = false) => {
      if (!currentPoint || !mapRef.current) return;
      const now = Date.now();
      if (!force && now - lastCameraUpdateRef.current < CAMERA_UPDATE_THROTTLE_MS) {
        return;
      }
      lastCameraUpdateRef.current = now;
      animateToPoint(mapRef.current, currentPoint);
    },
    [currentPoint]
  );

  useEffect(() => {
    if (visible && currentPoint) {
      updateCamera();
    }
  }, [visible, currentPoint, updateCamera]);

  const handleSlidingStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    pause();
  }, [isPlaying, pause]);

  const handleSeek = useCallback(
    (targetProgress: number) => {
      seekTo(targetProgress);
      const targetPoint = resolvePointAtProgress(playback.track, targetProgress);
      if (targetPoint && mapRef.current) {
        const now = Date.now();
        if (now - lastCameraUpdateRef.current >= CAMERA_UPDATE_THROTTLE_MS) {
          lastCameraUpdateRef.current = now;
          animateToPoint(mapRef.current, targetPoint);
        }
      }
    },
    [seekTo, playback.track]
  );

  const handleSlidingComplete = useCallback(
    (targetProgress: number) => {
      seekTo(targetProgress);
      const targetPoint = resolvePointAtProgress(playback.track, targetProgress);
      lastCameraUpdateRef.current = Date.now();
      if (targetPoint && mapRef.current) {
        animateToPoint(mapRef.current, targetPoint);
      }
      if (wasPlayingBeforeScrubRef.current) {
        play();
      }
    },
    [seekTo, playback.track, play]
  );

  const onMapReady = useCallback(() => {
    if (currentPoint && mapRef.current) {
      animateToPoint(mapRef.current, currentPoint);
    }
  }, [currentPoint]);

  const handleClose = useCallback(() => {
    pause();
    onClose();
  }, [pause, onClose]);

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
              onClose={handleClose}
              onCycleMapType={cycleMapType}
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
              onClose={handleClose}
              onCycleMapType={cycleMapType}
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
