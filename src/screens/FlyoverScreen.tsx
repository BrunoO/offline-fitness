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
import { ActivityStream, RootStackParamList, simpleLogger } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MapType } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GoogleMap3DFlyover,
  GoogleMaps3DViewRef,
  Map3DCoordinate,
  Map3DModeType
} from '../components/GoogleMap3DFlyover';
import {
  Flyover3DCameraPreset,
  NEXT_3D_CAMERA_PRESET,
  resolve3DCameraParams,
  resolveSport3DProfile
} from '../utils/flyover3DConfig';

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
    fallbackBanner: {
      position: 'absolute',
      top: Math.max(topInset, 16) + 132,
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      zIndex: 11
    },
    fallbackBannerText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textStrong
    },
    theaterExitButton: {
      position: 'absolute',
      top: Math.max(topInset, 16) + 8,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor:
        theme.scheme === 'dark' ? 'rgba(24, 24, 27, 0.78)' : 'rgba(255, 255, 255, 0.85)',
      borderWidth: 1,
      borderColor: theme.border,
      zIndex: 12
    },
    theaterExitText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textStrong
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

interface FlyoverMapBodyProps {
  isLoading: boolean;
  stream: ActivityStream | null;
  renderMode: FlyoverRenderMode;
  isFocused: boolean;
  coordinates3D: Map3DCoordinate[];
  strokeColor: string;
  isPlaying3D: boolean;
  speedMultiplier: number;
  baseSpeedMps: number;
  cameraTilt: number;
  cameraRange: number;
  mapMode3D: Map3DModeType;
  mapType25D: MapType;
  cameraMode: FlyoverCameraMode;
  forceCameraTick: number;
  playback: ReturnType<typeof useFlyoverPlayback>;
  map3DRef: React.RefObject<GoogleMaps3DViewRef | null>;
  on3DMapReady: () => void;
  on3DMapError: (message: string) => void;
  on3DProgress: (progress: number) => void;
  on3DComplete: () => void;
  on3DUserInteraction: () => void;
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
  baseSpeedMps,
  cameraTilt,
  cameraRange,
  mapMode3D,
  mapType25D,
  cameraMode,
  forceCameraTick,
  playback,
  map3DRef,
  on3DMapReady,
  on3DMapError,
  on3DProgress,
  on3DComplete,
  on3DUserInteraction,
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
        strokeWidth={9}
        isPlaying={isPlaying3D}
        speedMultiplier={speedMultiplier}
        baseSpeedMps={baseSpeedMps}
        cameraTilt={cameraTilt}
        cameraRange={cameraRange}
        mapMode={mapMode3D}
        onMapReady={on3DMapReady}
        onMapError={on3DMapError}
        onFlyoverProgress={on3DProgress}
        onFlyoverComplete={on3DComplete}
        onUserInteraction={on3DUserInteraction}
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
  setIsPlaying3D: React.Dispatch<React.SetStateAction<boolean>>,
  map3DRef: React.RefObject<GoogleMaps3DViewRef | null>
) {
  const pendingSeek3DRef = useRef<number | null>(null);
  const resumeAfterReadyRef = useRef(false);

  const schedulePendingSeek3D = useCallback((progressRatio: number, resumeAfterReady = false) => {
    pendingSeek3DRef.current = progressRatio;
    resumeAfterReadyRef.current = resumeAfterReady;
  }, []);

  const handle3DMapReady = useCallback(() => {
    const pending = pendingSeek3DRef.current;
    const shouldResume = resumeAfterReadyRef.current;
    pendingSeek3DRef.current = null;
    resumeAfterReadyRef.current = false;
    if (pending !== null) {
      void map3DRef.current?.seekTo(pending * 100);
    }
    if (shouldResume) {
      setIsPlaying3D(true);
    }
  }, [map3DRef, setIsPlaying3D]);

  const handle3DProgress = useCallback(
    (nextProgressPercent: number) => {
      playback.seekTo(nextProgressPercent / 100);
    },
    [playback]
  );

  const handle3DComplete = useCallback(() => {
    setIsPlaying3D(false);
    playback.seekTo(1);
  }, [playback, setIsPlaying3D]);

  const handle3DUserInteraction = useCallback(() => {
    setIsPlaying3D(false);
  }, [setIsPlaying3D]);

  return {
    schedulePendingSeek3D,
    handle3DMapReady,
    handle3DProgress,
    handle3DComplete,
    handle3DUserInteraction
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
  schedulePendingSeek3D: (progressRatio: number, resumeAfterReady?: boolean) => void;
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
  schedulePendingSeek3D
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
      playback.seekTo(0);
      void map3DRef.current?.restartFlyover();
      return;
    }
    playback.restart();
    setForceCameraTick(t => t + 1);
  }, [renderMode, playback, map3DRef, setForceCameraTick]);

  const handleSlidingStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    if (renderMode === '3d') {
      setIsPlaying3D(false);
    } else {
      playback.pause();
    }
  }, [isPlaying, renderMode, playback, setIsPlaying3D]);

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

  const handleToggleRenderMode = useCallback(() => {
    if (!canUse3D) return;
    if (renderMode === '3d') {
      const resumeIn25D = isPlaying3D;
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
    schedulePendingSeek3D(playback.progress, resumeIn3D);
    setIsPlaying3D(false);
    setRenderMode('3d');
  }, [
    canUse3D,
    renderMode,
    isPlaying3D,
    playback,
    schedulePendingSeek3D,
    setForceCameraTick,
    setIsPlaying3D,
    setRenderMode
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

interface FlyoverChromeProps {
  showChrome: boolean;
  isLoading: boolean;
  hasValidTrack: boolean;
  canUse3D: boolean;
  renderMode: FlyoverRenderMode;
  title: string;
  mapType25D: MapType;
  mapTypeLabel: string;
  cameraMode: FlyoverCameraMode;
  cameraModeLabel?: string;
  topInset: number;
  fallbackNotice: string | null;
  activityType?: string;
  isPlaying: boolean;
  playback: ReturnType<typeof useFlyoverPlayback>;
  elevationSparkline: number[];
  onClose: () => void;
  onCycleMapType: () => void;
  onCycleCamera: () => void;
  onToggleRenderMode: () => void;
  onToggleTheaterMode: () => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSeek: (progress: number) => void;
  onSlidingStart: () => void;
  onSlidingComplete: (progress: number) => void;
  styles: ReturnType<typeof createStyles>;
  textStrongColor: string;
}

function FlyoverChrome({
  showChrome,
  isLoading,
  hasValidTrack,
  canUse3D,
  renderMode,
  title,
  mapType25D,
  mapTypeLabel,
  cameraMode,
  cameraModeLabel,
  topInset,
  fallbackNotice,
  activityType,
  isPlaying,
  playback,
  elevationSparkline,
  onClose,
  onCycleMapType,
  onCycleCamera,
  onToggleRenderMode,
  onToggleTheaterMode,
  onTogglePlay,
  onRestart,
  onSeek,
  onSlidingStart,
  onSlidingComplete,
  styles,
  textStrongColor
}: Readonly<FlyoverChromeProps>) {
  const currentPoint = playback.currentPoint;
  return (
    <>
      {showChrome ? (
        <FlyoverHeader
          title={title}
          mapType={mapType25D}
          mapTypeLabel={mapTypeLabel}
          cameraMode={cameraMode}
          cameraModeLabel={cameraModeLabel}
          renderMode={canUse3D ? renderMode : undefined}
          onClose={onClose}
          onCycleMapType={onCycleMapType}
          onCycleCameraMode={onCycleCamera}
          onToggleRenderMode={canUse3D ? onToggleRenderMode : undefined}
          onToggleTheaterMode={hasValidTrack ? onToggleTheaterMode : undefined}
          topInset={topInset}
        />
      ) : (
        <TouchableOpacity
          style={styles.theaterExitButton}
          onPress={onToggleTheaterMode}
          accessibilityRole="button"
          accessibilityLabel="Show flyover controls"
        >
          <Ionicons name="eye-outline" size={16} color={textStrongColor} />
          <Text style={styles.theaterExitText}>Controls</Text>
        </TouchableOpacity>
      )}

      {fallbackNotice ? (
        <View style={styles.fallbackBanner} accessibilityRole="alert">
          <Text style={styles.fallbackBannerText}>{fallbackNotice}</Text>
        </View>
      ) : null}

      {showChrome && !isLoading && hasValidTrack ? (
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
              onTogglePlay={onTogglePlay}
              onRestart={onRestart}
              onSeek={onSeek}
              onSetSpeed={playback.setSpeed}
              onSlidingStart={onSlidingStart}
              onSlidingComplete={onSlidingComplete}
            />
          </View>
        </>
      ) : null}
    </>
  );
}

function useAutoClearNotice(notice: string | null, clear: () => void) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(clear, 4000);
    return () => clearTimeout(timer);
  }, [notice, clear]);
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

  const [is3DUnavailable, setIs3DUnavailable] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const canUse3D = Platform.OS === 'android' && HAS_GOOGLE_MAPS_KEY && !is3DUnavailable;
  const initialMode: FlyoverRenderMode =
    route.params?.initialMode === '2.5d' || !canUse3D ? '2.5d' : '3d';

  const [renderMode, setRenderMode] = useState<FlyoverRenderMode>(initialMode);
  const [mapType25D, setMapType25D] = useState<MapType>('hybrid');
  const [mapMode3D, setMapMode3D] = useState<Map3DModeType>('HYBRID');
  const [cameraMode, setCameraMode] = useState<FlyoverCameraMode>('follow');
  const [cameraPreset3D, setCameraPreset3D] = useState<Flyover3DCameraPreset>('drone');
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [forceCameraTick, setForceCameraTick] = useState(0);
  const [isPlaying3D, setIsPlaying3D] = useState(false);

  const clearFallbackNotice = useCallback(() => setFallbackNotice(null), []);
  useAutoClearNotice(fallbackNotice, clearFallbackNotice);

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
    handle3DMapReady,
    handle3DProgress,
    handle3DComplete,
    handle3DUserInteraction
  } = use3DPlaybackBridge(playback, setIsPlaying3D, map3DRef);

  const latestBlurStateRef = useRef({
    renderMode,
    progress: playback.progress,
    pause: playback.pause
  });
  useEffect(() => {
    latestBlurStateRef.current = {
      renderMode,
      progress: playback.progress,
      pause: playback.pause
    };
  }, [renderMode, playback.progress, playback.pause]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        const { renderMode: mode, progress: currentProgress, pause } = latestBlurStateRef.current;
        if (mode === '3d' && currentProgress > 0) {
          schedulePendingSeek3D(currentProgress, false);
        }
        setIsPlaying3D(false);
        pause();
      };
    }, [schedulePendingSeek3D])
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
    schedulePendingSeek3D
  });

  const handle3DMapError = useCallback((message: string) => {
    simpleLogger.warn('3D map unavailable, falling back to 2.5D:', message);
    setIsPlaying3D(false);
    setIs3DUnavailable(true);
    setRenderMode('2.5d');
    setForceCameraTick(t => t + 1);
    setFallbackNotice('3D map unavailable — switched to 2.5D');
  }, []);

  const handleClose = useCallback(() => {
    setIsPlaying3D(false);
    playback.pause();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, playback]);

  const handleCycleCamera = useCallback(() => {
    if (renderMode === '3d') {
      setCameraPreset3D(current => NEXT_3D_CAMERA_PRESET[current]);
      return;
    }
    handleCycleCameraMode();
  }, [renderMode, handleCycleCameraMode]);

  const handleToggleTheaterMode = useCallback(() => {
    setIsTheaterMode(prev => !prev);
  }, []);

  const title = route.params?.title ?? 'Route Flyover';
  const activityType = route.params?.activityType ?? loadedActivityType;
  const hasValidTrack = Boolean(stream && stream.coordinates.length >= 2);
  const mapTypeLabel = renderMode === '3d' ? mapMode3D.toLowerCase() : mapType25D;
  const sport3DProfile = resolveSport3DProfile(activityType, playback.totalDistanceMeters);
  const camera3D = resolve3DCameraParams(sport3DProfile, cameraPreset3D);
  const showChrome = !isTheaterMode;

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
        baseSpeedMps={sport3DProfile.baseSpeedMps}
        cameraTilt={camera3D.tilt}
        cameraRange={camera3D.range}
        mapMode3D={mapMode3D}
        mapType25D={mapType25D}
        cameraMode={cameraMode}
        forceCameraTick={forceCameraTick}
        playback={playback}
        map3DRef={map3DRef}
        on3DMapReady={handle3DMapReady}
        on3DMapError={handle3DMapError}
        on3DProgress={handle3DProgress}
        on3DComplete={handle3DComplete}
        on3DUserInteraction={handle3DUserInteraction}
        styles={styles}
        textMutedColor={theme.textMuted}
      />

      <FlyoverChrome
        showChrome={showChrome}
        isLoading={isLoading}
        hasValidTrack={hasValidTrack}
        canUse3D={canUse3D}
        renderMode={renderMode}
        title={title}
        mapType25D={mapType25D}
        mapTypeLabel={mapTypeLabel}
        cameraMode={cameraMode}
        cameraModeLabel={renderMode === '3d' ? camera3D.label : undefined}
        topInset={insets.top}
        fallbackNotice={fallbackNotice}
        activityType={activityType}
        isPlaying={isPlaying}
        playback={playback}
        elevationSparkline={elevationSparkline}
        onClose={handleClose}
        onCycleMapType={handleCycleMapType}
        onCycleCamera={handleCycleCamera}
        onToggleRenderMode={handleToggleRenderMode}
        onToggleTheaterMode={handleToggleTheaterMode}
        onTogglePlay={handleTogglePlay}
        onRestart={handleRestart}
        onSeek={handleSeek}
        onSlidingStart={handleSlidingStart}
        onSlidingComplete={handleSlidingComplete}
        styles={styles}
        textStrongColor={theme.textStrong}
      />
    </View>
  );
}

export default FlyoverScreen;
