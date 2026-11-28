import { ActivityStream } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { MapType } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFlyoverPlayback } from '../hooks/useFlyoverPlayback';
import { useKeepFlyoverAwake } from '../hooks/useKeepFlyoverAwake';
import { buildElevationSparkline } from '../services/flyoverInterpolator';
import { FlyoverCameraMode, FlyoverPoint } from '../types/flyover.types';
import Flyover25DRenderer from './Flyover25DRenderer';
import FlyoverControls from './FlyoverControls';
import FlyoverHeader from './FlyoverHeader';
import FlyoverHud from './FlyoverHud';

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
  const [forceCameraTick, setForceCameraTick] = useState(0);
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

  const cycleCameraMode = useCallback(() => {
    setCameraMode(current => NEXT_CAMERA_MODE[current]);
    setForceCameraTick(t => t + 1);
  }, []);

  const handleSlidingStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    pause();
  }, [isPlaying, pause]);

  const handleSeek = useCallback(
    (targetProgress: number) => {
      seekTo(targetProgress);
    },
    [seekTo]
  );

  const handleSlidingComplete = useCallback(
    (targetProgress: number) => {
      seekTo(targetProgress);
      setForceCameraTick(t => t + 1);
      if (wasPlayingBeforeScrubRef.current) {
        play();
      }
    },
    [seekTo, play]
  );

  const handleClose = useCallback(() => {
    pause();
    seekTo(0);
    onClose();
  }, [pause, seekTo, onClose]);

  const hasValidTrack = Boolean(stream && stream.coordinates.length >= 2);
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
        {hasValidTrack && stream ? (
          <>
            <Flyover25DRenderer
              stream={stream}
              track={playback.track}
              currentPoint={currentPoint}
              traveledCoordinates={traveledCoordinates}
              mapType={mapType}
              cameraMode={cameraMode}
              active={visible}
              forceCameraTick={forceCameraTick}
            />

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
