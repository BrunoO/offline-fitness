import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/shared/types/types';
import { GoogleMap3DFlyover, Map3DCoordinate } from '../components/GoogleMap3DFlyover';
import { computeTrackDistanceMeters } from '../utils/gpsSmoothing';
import { useActivitiesContext } from '@/features/activities';
import { loadRawStreamForActivity } from '@/features/activities/services/fetchAndStoreStreams';
import { activityToFlyoverCoordinates } from '@/utils/activityTrack';

const SPEED_OPTIONS = [1, 2, 4] as const;

/**
 * Sample alpine GPS track: Col du Galibier (North approach from Plan Lachat to the 2,642 m summit).
 * Provides dramatic mountain relief and switchbacks to showcase photorealistic 3D flyover rendering.
 */
export const SAMPLE_MOUNTAIN_TRACK: Map3DCoordinate[] = [
  { latitude: 45.1098, longitude: 6.4256, altitude: 1962 },
  { latitude: 45.1074, longitude: 6.4279, altitude: 1988 },
  { latitude: 45.1051, longitude: 6.4304, altitude: 2018 },
  { latitude: 45.1023, longitude: 6.4321, altitude: 2049 },
  { latitude: 45.0994, longitude: 6.4312, altitude: 2080 },
  { latitude: 45.0968, longitude: 6.4285, altitude: 2112 },
  { latitude: 45.0942, longitude: 6.4259, altitude: 2146 },
  { latitude: 45.0919, longitude: 6.4234, altitude: 2180 },
  { latitude: 45.0894, longitude: 6.4216, altitude: 2215 },
  { latitude: 45.0872, longitude: 6.4201, altitude: 2248 },
  { latitude: 45.0853, longitude: 6.4178, altitude: 2285 },
  { latitude: 45.0836, longitude: 6.4149, altitude: 2320 },
  { latitude: 45.0819, longitude: 6.4126, altitude: 2356 },
  { latitude: 45.0802, longitude: 6.4112, altitude: 2394 },
  { latitude: 45.0785, longitude: 6.4105, altitude: 2432 },
  { latitude: 45.0769, longitude: 6.4119, altitude: 2468 },
  { latitude: 45.0752, longitude: 6.4131, altitude: 2505 },
  { latitude: 45.0734, longitude: 6.4114, altitude: 2542 },
  { latitude: 45.0716, longitude: 6.4098, altitude: 2578 },
  { latitude: 45.0695, longitude: 6.4086, altitude: 2609 },
  { latitude: 45.0672, longitude: 6.4079, altitude: 2628 },
  { latitude: 45.0641, longitude: 6.4077, altitude: 2642 }
];

const createStyles = (theme: ReturnType<typeof useTheme>, topInset: number, bottomInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surface
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24
    },
    emptyText: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: 'center'
    },
    map: {
      ...StyleSheet.absoluteFill
    },
    headerOverlay: {
      position: 'absolute',
      top: Math.max(topInset, 16) + 8,
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 10
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center'
    },
    titleBadge: {
      flex: 1,
      marginLeft: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border
    },
    titleText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textStrong
    },
    subtitleText: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2
    },
    controlsCard: {
      position: 'absolute',
      bottom: Math.max(bottomInset, 16) + 8,
      left: 16,
      right: 16,
      borderRadius: 18,
      padding: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      zIndex: 10
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8
    },
    statusLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text
    },
    progressText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textStrong
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.surfaceMuted,
      overflow: 'hidden',
      marginBottom: 14
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: theme.primary
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    playButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary
    },
    playButtonDisabled: {
      opacity: 0.55
    },
    playButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.onPrimary,
      marginLeft: 8
    },
    speedGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    speedChip: {
      minWidth: 44,
      height: 36,
      paddingHorizontal: 10,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border
    },
    speedChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary
    },
    speedChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text
    },
    speedChipTextActive: {
      color: theme.onPrimary
    }
  });

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

  const { globalActivities } = useActivitiesContext();
  const activityId = route.params?.activityId;
  const routeCoordinates = route.params?.coordinates;

  const [loadedTrack, setLoadedTrack] = useState<Map3DCoordinate[] | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState<boolean>(Boolean(activityId));

  useEffect(() => {
    if (!activityId) {
      setLoadedTrack(null);
      setIsLoadingTrack(false);
      return;
    }
    const activity = globalActivities.find(a => a.id === activityId);
    if (!activity) {
      setLoadedTrack([]);
      setIsLoadingTrack(false);
      return;
    }
    let active = true;
    setIsLoadingTrack(true);
    void loadRawStreamForActivity(activity).then(stream => {
      if (!active) return;
      setLoadedTrack(activityToFlyoverCoordinates(stream));
      setIsLoadingTrack(false);
    });
    return () => {
      active = false;
    };
  }, [activityId, globalActivities]);

  const track: Map3DCoordinate[] = useMemo(() => {
    if (loadedTrack) return loadedTrack;
    if (routeCoordinates && routeCoordinates.length >= 2) return routeCoordinates;
    return [];
  }, [loadedTrack, routeCoordinates]);

  const title = route.params?.title ?? 'Activity — 3D Flyover';
  const distanceKm = useMemo(() => (computeTrackDistanceMeters(track) / 1000).toFixed(1), [track]);

  const [isMapReady, setIsMapReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Stop playback and reset readiness whenever the screen loses focus so the
  // single-instance Map3DView is cleanly unmounted and destroyed.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setIsPlaying(false);
        setIsMapReady(false);
      };
    }, [])
  );

  const handleMapReady = useCallback(() => {
    setIsMapReady(true);
  }, []);

  const handleFlyoverProgress = useCallback((nextProgress: number) => {
    setProgress(nextProgress);
  }, []);

  const handleFlyoverComplete = useCallback(() => {
    setIsPlaying(false);
    setIsCompleted(true);
    setProgress(100);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isCompleted) {
      setIsCompleted(false);
      setProgress(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(prev => !prev);
  }, [isCompleted]);

  const handleGoBack = useCallback(() => {
    setIsPlaying(false);
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const statusText = useMemo(() => {
    if (!isMapReady) {
      return 'Loading 3D terrain…';
    }
    if (isCompleted) {
      return 'Flyover complete';
    }
    return isPlaying ? `Flying (${speedMultiplier}x)` : 'Paused';
  }, [isMapReady, isCompleted, isPlaying, speedMultiplier]);

  const playLabel = useMemo(() => {
    if (isCompleted) {
      return 'Replay';
    }
    return isPlaying ? 'Pause' : 'Play';
  }, [isCompleted, isPlaying]);

  const playIconName = useMemo(() => {
    if (isCompleted) {
      return 'refresh' as const;
    }
    return isPlaying ? ('pause' as const) : ('play' as const);
  }, [isCompleted, isPlaying]);

  let mapContent: React.ReactNode = null;
  if (isLoadingTrack) {
    mapContent = (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Loading track…</Text>
      </View>
    );
  } else if (track.length < 2) {
    mapContent = (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>This activity has no GPS track.</Text>
      </View>
    );
  } else if (isFocused) {
    mapContent = (
      <GoogleMap3DFlyover
        style={styles.map}
        coordinates={track}
        strokeColor="#FC4C02"
        strokeWidth={12}
        isPlaying={isPlaying}
        speedMultiplier={speedMultiplier}
        cameraTilt={65}
        cameraRange={800}
        onMapReady={handleMapReady}
        onFlyoverProgress={handleFlyoverProgress}
        onFlyoverComplete={handleFlyoverComplete}
      />
    );
  }

  return (
    <View style={styles.container}>
      {mapContent}

      <View style={styles.headerOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close 3D flyover"
          onPress={handleGoBack}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color={theme.textStrong} />
        </Pressable>

        <View style={styles.titleBadge}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitleText}>
            {distanceKm} km · {track.length} GPS points
          </Text>
        </View>
      </View>

      <View style={styles.controlsCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.statusLabel}>{statusText}</Text>
          <Text style={styles.progressText}>{Math.round(progress)}%</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress)}%` }]} />
        </View>

        <View style={styles.controlsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playLabel}
            disabled={!isMapReady}
            onPress={handleTogglePlay}
            style={[styles.playButton, !isMapReady ? styles.playButtonDisabled : null]}
          >
            <Ionicons name={playIconName} size={18} color={theme.onPrimary} />
            <Text style={styles.playButtonText}>{playLabel}</Text>
          </Pressable>

          <View style={styles.speedGroup}>
            {SPEED_OPTIONS.map(speed => {
              const isSelected = speedMultiplier === speed;
              return (
                <Pressable
                  key={speed}
                  accessibilityRole="button"
                  accessibilityLabel={`Set flyover speed to ${speed}x`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSpeedMultiplier(speed)}
                  style={[styles.speedChip, isSelected ? styles.speedChipActive : null]}
                >
                  <Text
                    style={[styles.speedChipText, isSelected ? styles.speedChipTextActive : null]}
                  >
                    {speed}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

export default FlyoverScreen;
