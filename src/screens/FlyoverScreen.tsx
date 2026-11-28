import {
  buildElevationSparkline,
  Flyover25DRenderer,
  FlyoverCameraMode,
  FlyoverControls,
  FlyoverHeader,
  FlyoverHud,
  FlyoverRenderMode,
  HAS_GOOGLE_MAPS_KEY,
  useFlyoverPlayback,
  useKeepFlyoverAwake
} from '@/features/maps';
import { loadStreamForActivity, useActivitiesContext } from '@/features/activities';
import type { ActivityStream, RootStackParamList } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { MapType } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlyoverSegmentStartEventPayload,
  GoogleMap3DFlyover,
  GoogleMaps3DViewRef,
  Map3DCoordinate,
  Map3DModeType
} from '../components/GoogleMap3DFlyover';

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
      backgroundColor: theme.surface
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

function coordinatesToStream(coords: Map3DCoordinate[]): ActivityStream {
  return {
    coordinates: coords.map(c => ({ latitude: c.latitude, longitude: c.longitude })),
    altitude: coords.map(c =>
      typeof c.altitude === 'number' && Number.isFinite(c.altitude) ? c.altitude : 0
    ),
    time: coords.map((_, index) => index)
  };
}

function streamTo3DCoordinates(stream: ActivityStream | null): Map3DCoordinate[] {
  if (!stream || stream.coordinates.length === 0) return [];
  return stream.coordinates.map((coord, index) => ({
    latitude: coord.latitude,
    longitude: coord.longitude,
    altitude: Number.isFinite(stream.altitude[index]) ? stream.altitude[index] : 0
  }));
}

function useLoadedFlyoverStream(
  activityId: string | undefined,
  routeCoordinates: Map3DCoordinate[] | undefined
): { stream: ActivityStream | null; isLoading: boolean; activityType: string | undefined } {
  const { globalActivities } = useActivitiesContext();
  const [loadedStream, setLoadedStream] = useState<ActivityStream | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(activityId));

  const activity = activityId ? globalActivities.find(a => a.id === activityId) : undefined;

  useEffect(() => {
    if (!activityId) {
      setLoadedStream(null);
      setIsLoading(false);
      return;
    }
    if (!activity) {
      setLoadedStream(null);
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    void loadStreamForActivity(activity)
      .then(result => {
        if (!active) return;
        setLoadedStream(result ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadedStream(null);
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activityId, activity]);

  const fallbackStream = useMemo(
    () =>
      !activityId && routeCoordinates && routeCoordinates.length >= 2
        ? coordinatesToStream(routeCoordinates)
        : null,
    [activityId, routeCoordinates]
  );

  return {
    stream: loadedStream ?? fallbackStream,
    isLoading,
    activityType: activity?.type
  };
}

interface Active3DSegment {
  from: number;
  to: number;
  durationMs: number;
  startedAt: number;
}

interface FlyoverMapBodyProps {
  isLoading: boolean;
  stream: ActivityStream | null;
  renderMode: FlyoverRenderMode;
  isFocused: boolean;
  coordinates3D: Map3DCoordinate[];
  strokeColor: string;
  isPlaying3D: boolean;
  speedMultiplier: number;
  mapMode3D: Map3DModeType;
  mapType25D: MapType;
  cameraMode: FlyoverCameraMode;
  forceCameraTick: number;
  playback: ReturnType<typeof useFlyoverPlayback>;
  map3DRef: React.RefObject<GoogleMaps3DViewRef | null>;
  on3DMapReady: () => void;
  on3DProgress: (progress: number) => void;
  on3DSegmentStart: (segment: FlyoverSegmentStartEventPayload) => void;
  on3DComplete: () => void;
  styles: ReturnType<typeof createStyles>;
  textMutedColor: string;
}

function FlyoverMapBody({
  isLoading,
  stream,
  renderMode,
  isFocused,
  coordinates3D,
  strokeColor,
  isPlaying3D,
  speedMultiplier,
  mapMode3D,
  mapType25D,
  cameraMode,
  forceCameraTick,
  playback,
  map3DRef,
  on3DMapReady,
  on3DProgress,
  on3DSegmentStart,
  on3DComplete,
  styles,
  textMutedColor
}: Readonly<FlyoverMapBodyProps>) {
  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptySubtitle}>Loading track…</Text>
      </View>
    );
  }
  if (!stream || stream.coordinates.length < 2) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="location-outline" size={48} color={textMutedColor} />
        <Text style={styles.emptyTitle}>No GPS Track Data</Text>
        <Text style={styles.emptySubtitle}>
          This activity does not contain recorded GPS coordinates for flyover playback.
        </Text>
      </View>
    );
  }
  if (renderMode === '3d') {
    return isFocused ? (
      <GoogleMap3DFlyover
        ref={map3DRef}
        style={styles.map}
        coordinates={coordinates3D}
        strokeColor={strokeColor}
        strokeWidth={12}
        isPlaying={isPlaying3D}
        speedMultiplier={speedMultiplier}
        cameraTilt={65}
        cameraRange={800}
        mapMode={mapMode3D}
        onMapReady={on3DMapReady}
        onFlyoverProgress={on3DProgress}
        onFlyoverSegmentStart={on3DSegmentStart}
        onFlyoverComplete={on3DComplete}
      />
    ) : null;
  }
  return (
    <Flyover25DRenderer
      stream={stream}
      track={playback.track}
      currentPoint={playback.currentPoint}
      traveledCoordinates={playback.traveledCoordinates}
      mapType={mapType25D}
      cameraMode={cameraMode}
      active={isFocused}
      forceCameraTick={forceCameraTick}
    />
  );
}

function use3DPlaybackBridge(
  playback: ReturnType<typeof useFlyoverPlayback>,
  renderMode: FlyoverRenderMode,
  isPlaying3D: boolean,
  setIsPlaying3D: React.Dispatch<React.SetStateAction<boolean>>,
  map3DRef: React.RefObject<GoogleMaps3DViewRef | null>
) {
  const pendingSeek3DRef = useRef<number | null>(null);
  const segmentRafRef = useRef<number | null>(null);
  const activeSegmentRef = useRef<Active3DSegment | null>(null);

  const schedulePendingSeek3D = useCallback((progressRatio: number) => {
    pendingSeek3DRef.current = progressRatio;
  }, []);

  const stop3DSegmentTicker = useCallback(() => {
    if (segmentRafRef.current !== null) {
      cancelAnimationFrame(segmentRafRef.current);
      segmentRafRef.current = null;
    }
    activeSegmentRef.current = null;
  }, []);

  useEffect(() => {
    if (!isPlaying3D || renderMode !== '3d') {
      stop3DSegmentTicker();
    }
    return () => {
      stop3DSegmentTicker();
    };
  }, [isPlaying3D, renderMode, stop3DSegmentTicker]);

  const handle3DMapReady = useCallback(() => {
    const pending = pendingSeek3DRef.current;
    if (pending !== null) {
      pendingSeek3DRef.current = null;
      void map3DRef.current?.seekTo(pending * 100);
    }
  }, [map3DRef]);

  const handle3DSegmentStart = useCallback(
    (segment: FlyoverSegmentStartEventPayload) => {
      stop3DSegmentTicker();
      if (segment.durationMs <= 0) return;
      activeSegmentRef.current = {
        from: segment.fromProgress / 100,
        to: segment.toProgress / 100,
        durationMs: segment.durationMs,
        startedAt: Date.now()
      };
      const tick = () => {
        const current = activeSegmentRef.current;
        if (!current) return;
        const elapsed = Date.now() - current.startedAt;
        const ratio = Math.min(1, Math.max(0, elapsed / current.durationMs));
        playback.seekTo(current.from + (current.to - current.from) * ratio);
        if (ratio < 1) {
          segmentRafRef.current = requestAnimationFrame(tick);
        } else {
          segmentRafRef.current = null;
        }
      };
      segmentRafRef.current = requestAnimationFrame(tick);
    },
    [playback, stop3DSegmentTicker]
  );

  const handle3DProgress = useCallback(
    (nextProgressPercent: number) => {
      stop3DSegmentTicker();
      playback.seekTo(nextProgressPercent / 100);
    },
    [playback, stop3DSegmentTicker]
  );

  const handle3DComplete = useCallback(() => {
    stop3DSegmentTicker();
    setIsPlaying3D(false);
    playback.seekTo(1);
  }, [playback, setIsPlaying3D, stop3DSegmentTicker]);

  return {
    schedulePendingSeek3D,
    stop3DSegmentTicker,
    handle3DMapReady,
    handle3DSegmentStart,
    handle3DProgress,
    handle3DComplete
  };
}

interface FlyoverPlaybackActionsParams {
  canUse3D: boolean;
  renderMode: FlyoverRenderMode;
  setRenderMode: React.Dispatch<React.SetStateAction<FlyoverRenderMode>>;
  isPlaying: boolean;
  isPlaying3D: boolean;
  setIsPlaying3D: React.Dispatch<React.SetStateAction<boolean>>;
  setMapMode3D: React.Dispatch<React.SetStateAction<Map3DModeType>>;
  setMapType25D: React.Dispatch<React.SetStateAction<MapType>>;
  setCameraMode: React.Dispatch<React.SetStateAction<FlyoverCameraMode>>;
  setForceCameraTick: React.Dispatch<React.SetStateAction<number>>;
  playback: ReturnType<typeof useFlyoverPlayback>;
  map3DRef: React.RefObject<GoogleMaps3DViewRef | null>;
  schedulePendingSeek3D: (progressRatio: number) => void;
  stop3DSegmentTicker: () => void;
}

function useFlyoverPlaybackActions({
  canUse3D,
  renderMode,
  setRenderMode,
  isPlaying,
  isPlaying3D,
  setIsPlaying3D,
  setMapMode3D,
  setMapType25D,
  setCameraMode,
  setForceCameraTick,
  playback,
  map3DRef,
  schedulePendingSeek3D,
  stop3DSegmentTicker
}: FlyoverPlaybackActionsParams) {
  const wasPlayingBeforeScrubRef = useRef(false);

  const handleTogglePlay = useCallback(() => {
    if (renderMode === '3d') {
      if (playback.progress >= 0.999) {
        playback.seekTo(0);
        void map3DRef.current?.restartFlyover();
        setIsPlaying3D(true);
        return;
      }
      setIsPlaying3D(prev => !prev);
      return;
    }
    playback.togglePlay();
  }, [renderMode, playback, map3DRef, setIsPlaying3D]);

  const handleRestart = useCallback(() => {
    if (renderMode === '3d') {
      stop3DSegmentTicker();
      playback.seekTo(0);
      void map3DRef.current?.restartFlyover();
      return;
    }
    playback.restart();
    setForceCameraTick(t => t + 1);
  }, [renderMode, playback, map3DRef, setForceCameraTick, stop3DSegmentTicker]);

  const handleSlidingStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    if (renderMode === '3d') {
      stop3DSegmentTicker();
      setIsPlaying3D(false);
    } else {
      playback.pause();
    }
  }, [isPlaying, renderMode, playback, setIsPlaying3D, stop3DSegmentTicker]);

  const handleSeek = useCallback(
    (targetProgress: number) => {
      playback.seekTo(targetProgress);
      if (renderMode === '3d') {
        void map3DRef.current?.seekTo(targetProgress * 100);
      }
    },
    [playback, renderMode, map3DRef]
  );

  const handleSlidingComplete = useCallback(
    (targetProgress: number) => {
      playback.seekTo(targetProgress);
      if (renderMode === '3d') {
        void map3DRef.current?.seekTo(targetProgress * 100);
        if (wasPlayingBeforeScrubRef.current) {
          setIsPlaying3D(true);
        }
        return;
      }
      setForceCameraTick(t => t + 1);
      if (wasPlayingBeforeScrubRef.current) {
        playback.play();
      }
    },
    [playback, renderMode, map3DRef, setIsPlaying3D, setForceCameraTick]
  );

  const handleToggleRenderMode = useCallback(async () => {
    if (!canUse3D) return;
    if (renderMode === '3d') {
      const resumeIn25D = isPlaying3D;
      stop3DSegmentTicker();
      setIsPlaying3D(false);
      setRenderMode('2.5d');
      setForceCameraTick(t => t + 1);
      if (resumeIn25D) {
        playback.play();
      }
      return;
    }
    const resumeIn3D = playback.isPlaying;
    playback.pause();
    schedulePendingSeek3D(playback.progress);
    setRenderMode('3d');
    // Sync the native 3D cursor to the (possibly scrubbed) 2.5D progress before
    // resuming, so playback doesn't jump back to a stale keyframe. The pending
    // seek above only fires on (re)mount; handle the already-mounted case here.
    await map3DRef.current?.seekTo(playback.progress * 100);
    setIsPlaying3D(resumeIn3D);
  }, [
    canUse3D,
    map3DRef,
    renderMode,
    isPlaying3D,
    playback,
    schedulePendingSeek3D,
    setForceCameraTick,
    setIsPlaying3D,
    setRenderMode,
    stop3DSegmentTicker
  ]);

  const handleCycleMapType = useCallback(() => {
    if (renderMode === '3d') {
      setMapMode3D(current => (current === 'HYBRID' ? 'SATELLITE' : 'HYBRID'));
      return;
    }
    setMapType25D(current => NEXT_MAP_TYPE[current] ?? 'hybrid');
  }, [renderMode, setMapMode3D, setMapType25D]);

  const handleCycleCameraMode = useCallback(() => {
    setCameraMode(current => NEXT_CAMERA_MODE[current]);
    setForceCameraTick(t => t + 1);
  }, [setCameraMode, setForceCameraTick]);

  return {
    handleTogglePlay,
    handleRestart,
    handleSlidingStart,
    handleSeek,
    handleSlidingComplete,
    handleToggleRenderMode,
    handleCycleMapType,
    handleCycleCameraMode
  };
}

export function FlyoverScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Flyover3D'>>();
  const isFocused = useIsFocused();

  const styles = useMemo(
    () => createStyles(theme, insets.top, insets.bottom),
    [theme, insets.top, insets.bottom]
  );

  useKeepFlyoverAwake(isFocused);

  const canUse3D = Platform.OS === 'android' && HAS_GOOGLE_MAPS_KEY;
  const initialMode: FlyoverRenderMode =
    route.params?.initialMode === '2.5d' || !canUse3D ? '2.5d' : '3d';

  const [renderMode, setRenderMode] = useState<FlyoverRenderMode>(initialMode);
  const [mapType25D, setMapType25D] = useState<MapType>('hybrid');
  const [mapMode3D, setMapMode3D] = useState<Map3DModeType>('HYBRID');
  const [cameraMode, setCameraMode] = useState<FlyoverCameraMode>('follow');
  const [forceCameraTick, setForceCameraTick] = useState(0);
  const [isPlaying3D, setIsPlaying3D] = useState(false);

  const map3DRef = useRef<GoogleMaps3DViewRef | null>(null);

  const {
    stream,
    isLoading,
    activityType: loadedActivityType
  } = useLoadedFlyoverStream(route.params?.activityId, route.params?.coordinates);

  const playback = useFlyoverPlayback(stream, { autoPlay: false, loop: false });
  const coordinates3D = useMemo(() => streamTo3DCoordinates(stream), [stream]);
  const elevationSparkline = useMemo(
    () => buildElevationSparkline(playback.track),
    [playback.track]
  );

  const {
    schedulePendingSeek3D,
    stop3DSegmentTicker,
    handle3DMapReady,
    handle3DSegmentStart,
    handle3DProgress,
    handle3DComplete
  } = use3DPlaybackBridge(playback, renderMode, isPlaying3D, setIsPlaying3D, map3DRef);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setIsPlaying3D(false);
        playback.pause();
        stop3DSegmentTicker();
      };
    }, [playback, stop3DSegmentTicker])
  );

  const isPlaying = renderMode === '3d' ? isPlaying3D : playback.isPlaying;

  const {
    handleTogglePlay,
    handleRestart,
    handleSlidingStart,
    handleSeek,
    handleSlidingComplete,
    handleToggleRenderMode,
    handleCycleMapType,
    handleCycleCameraMode
  } = useFlyoverPlaybackActions({
    canUse3D,
    renderMode,
    setRenderMode,
    isPlaying,
    isPlaying3D,
    setIsPlaying3D,
    setMapMode3D,
    setMapType25D,
    setCameraMode,
    setForceCameraTick,
    playback,
    map3DRef,
    schedulePendingSeek3D,
    stop3DSegmentTicker
  });

  const handleClose = useCallback(() => {
    setIsPlaying3D(false);
    playback.pause();
    stop3DSegmentTicker();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, playback, stop3DSegmentTicker]);

  const title = route.params?.title ?? 'Route Flyover';
  const activityType = route.params?.activityType ?? loadedActivityType;
  const hasValidTrack = Boolean(stream && stream.coordinates.length >= 2);
  const currentPoint = playback.currentPoint;
  const mapTypeLabel = renderMode === '3d' ? mapMode3D.toLowerCase() : mapType25D;

  return (
    <View style={styles.container}>
      <FlyoverMapBody
        isLoading={isLoading}
        stream={stream}
        renderMode={renderMode}
        isFocused={isFocused}
        coordinates3D={coordinates3D}
        strokeColor={theme.primary}
        isPlaying3D={isPlaying3D}
        speedMultiplier={playback.speedMultiplier}
        mapMode3D={mapMode3D}
        mapType25D={mapType25D}
        cameraMode={cameraMode}
        forceCameraTick={forceCameraTick}
        playback={playback}
        map3DRef={map3DRef}
        on3DMapReady={handle3DMapReady}
        on3DProgress={handle3DProgress}
        on3DSegmentStart={handle3DSegmentStart}
        on3DComplete={handle3DComplete}
        styles={styles}
        textMutedColor={theme.textMuted}
      />

      <FlyoverHeader
        title={title}
        mapType={mapType25D}
        mapTypeLabel={mapTypeLabel}
        cameraMode={cameraMode}
        renderMode={canUse3D ? renderMode : undefined}
        onClose={handleClose}
        onCycleMapType={handleCycleMapType}
        onCycleCameraMode={renderMode === '2.5d' ? handleCycleCameraMode : undefined}
        onToggleRenderMode={canUse3D ? handleToggleRenderMode : undefined}
        topInset={insets.top}
      />

      {!isLoading && hasValidTrack ? (
        <>
          <View style={styles.hudContainer}>
            <FlyoverHud
              speedMps={currentPoint?.speed ?? 0}
              completedDistanceMeters={playback.completedDistanceMeters}
              totalDistanceMeters={playback.totalDistanceMeters}
              altitudeMeters={currentPoint?.altitude ?? 0}
              elapsedSeconds={playback.elapsedSeconds}
              totalDurationSeconds={playback.totalDurationSeconds}
              activityType={activityType}
              gradePercent={currentPoint?.grade}
              heartrateBpm={currentPoint?.heartrate}
            />
          </View>

          <View style={styles.controlsContainer}>
            <FlyoverControls
              isPlaying={isPlaying}
              progress={playback.progress}
              speedMultiplier={playback.speedMultiplier}
              elevationProfile={elevationSparkline}
              onTogglePlay={handleTogglePlay}
              onRestart={handleRestart}
              onSeek={handleSeek}
              onSetSpeed={playback.setSpeed}
              onSlidingStart={handleSlidingStart}
              onSlidingComplete={handleSlidingComplete}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

export default FlyoverScreen;
