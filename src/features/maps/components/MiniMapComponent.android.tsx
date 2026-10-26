import { APP_CONFIG } from '@/constants';
import { ActivityStream, LatLng } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { calculateBearing } from '../services/flyoverInterpolator';
import FlyoverModal from './FlyoverModal';

export type MiniMapComponentProps = {
  stream: ActivityStream | undefined;
  overlayStream?: ActivityStream;
  title?: string;
  allowFlyover?: boolean;
};

// Adjust this constant to control how many direction arrows are displayed along the track
// Recommended values are between 2 and 10
const NUM_DIRECTION_ARROWS = APP_CONFIG.NUM_DIRECTION_ARROWS;

// Track colors
const TRACK_PRIMARY_COLOR = APP_CONFIG.TRACK_COLORS.PRIMARY;
const TRACK_OVERLAY_COLOR = APP_CONFIG.TRACK_COLORS.OVERLAY;
const FILL_PRIMARY_COLOR = APP_CONFIG.TRACK_COLORS.FILL_PRIMARY;
// Arrow colors (semi-transparent to be lighter than polylines)
const ARROW_PRIMARY_COLOR = 'rgba(255, 0, 0, 0.6)';
const ARROW_OVERLAY_COLOR = 'rgba(0, 0, 255, 0.6)';

const calculateSmoothBearing = (track: LatLng[], index: number, windowSize: number = 3) => {
  // Calculate the window size based on available points
  const halfWindow = Math.floor(windowSize / 2);
  const startIndex = Math.max(0, index - halfWindow);
  const endIndex = Math.min(track.length - 1, index + halfWindow);

  // If we don't have enough points for the window, use what we have
  if (endIndex - startIndex < 2) {
    return calculateBearing(track[startIndex], track[endIndex]);
  }

  // Calculate bearing from start to end of the window
  return calculateBearing(track[startIndex], track[endIndex]);
};

const renderDirectionArrows = (
  track: LatLng[] | undefined,
  color: string,
  numArrows: number = NUM_DIRECTION_ARROWS
) => {
  if (!track || track.length < 2 || numArrows <= 0) {
    return null;
  }

  const clampedArrows = Math.max(1, Math.min(numArrows, 20));
  const step = Math.max(1, Math.floor(track.length / (clampedArrows + 1)));

  const markers: React.ReactElement[] = [];
  for (let i = 1; i <= clampedArrows; i++) {
    const index = Math.min(track.length - 1, i * step);
    if (index <= 0 || index >= track.length) continue;

    // Use smooth bearing calculation with a window of 5 points (2 before, 2 after)
    const bearing = calculateSmoothBearing(track, index, 5);

    markers.push(
      <Marker
        coordinate={track[index]}
        anchor={{ x: 0.5, y: 0.5 }}
        rotation={bearing}
        key={`${color}-${i}-${index}`}
      >
        <MaterialCommunityIcons name="navigation" size={36} color={color} />
      </Marker>
    );
  }

  return markers;
};

type MiniMapLayersProps = {
  coordinates: LatLng[] | undefined;
  overlayCoordinates: LatLng[] | undefined;
};

function MiniMapLayers({ coordinates, overlayCoordinates }: Readonly<MiniMapLayersProps>) {
  return (
    <>
      {coordinates?.length ? (
        <Marker
          coordinate={coordinates[0]}
          title="Start"
          description="Start of the activity"
          pinColor="green"
        />
      ) : null}
      {coordinates?.length ? (
        <Polyline
          coordinates={coordinates}
          strokeWidth={5}
          strokeColor={TRACK_PRIMARY_COLOR}
          fillColor={FILL_PRIMARY_COLOR}
        />
      ) : null}
      {overlayCoordinates?.length ? (
        <Polyline
          coordinates={overlayCoordinates}
          strokeWidth={3}
          strokeColor={TRACK_OVERLAY_COLOR}
        />
      ) : null}
      {renderDirectionArrows(coordinates, ARROW_PRIMARY_COLOR)}
      {renderDirectionArrows(overlayCoordinates, ARROW_OVERLAY_COLOR)}
    </>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      width: '100%',
      aspectRatio: 4 / 3,
      position: 'relative'
    },
    map: {
      flex: 1,
      width: '100%'
    },
    flyoverPill: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor:
        theme.scheme === 'dark' ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.92)',
      paddingVertical: 5,
      paddingHorizontal: 9,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 4,
      zIndex: 10
    },
    flyoverPillText: {
      color: theme.textStrong,
      fontSize: 11,
      fontWeight: '700'
    }
  });

type MiniMapFlyoverProps = {
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  stream: ActivityStream | undefined;
  title?: string;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createStyles>;
};

function MiniMapFlyover({
  visible,
  onOpen,
  onClose,
  stream,
  title,
  theme,
  styles
}: Readonly<MiniMapFlyoverProps>) {
  return (
    <>
      <TouchableOpacity
        style={styles.flyoverPill}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Open route flyover"
      >
        <Ionicons name="airplane" size={13} color={theme.primary} />
        <Text style={styles.flyoverPillText}>Flyover</Text>
      </TouchableOpacity>
      <FlyoverModal visible={visible} onClose={onClose} stream={stream} title={title} />
    </>
  );
}

export default function MiniMapComponent(props: Readonly<MiniMapComponentProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = React.useRef<MapView>(null);
  const coordinates: LatLng[] | undefined = props.stream?.coordinates;
  const [isFlyoverOpen, setIsFlyoverOpen] = React.useState(false);
  const hasGpsTrack = Boolean(coordinates && coordinates.length >= 2);
  const allowFlyover = props.allowFlyover !== false;

  const initialRegion = coordinates?.length
    ? { ...coordinates[0], latitudeDelta: 0.1, longitudeDelta: 0.1 }
    : undefined;

  const [isMapReady, setIsMapReady] = React.useState(false);
  const canShowFlyover = Boolean(hasGpsTrack && allowFlyover && isMapReady);
  const [mapKey, setMapKey] = React.useState(0); // Force re-render when needed

  const fitToTrack = React.useCallback(() => {
    if (!coordinates?.length) return;
    if (!mapRef.current) return;
    try {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 16, right: 16, bottom: 16, left: 16 },
        animated: true
      });
    } catch {
      // Swallow occasional race conditions from native side
    }
  }, [coordinates]);

  // Wrap in useCallback so MapView (native) keeps a stable callback identity;
  // an inline function would be recreated every render and could trigger
  // unnecessary native re-initialisation. (Compiler can't preserve identity
  // across the native boundary contract.)
  const onMapReady = React.useCallback(() => {
    setIsMapReady(true);
    // Sometimes calling immediately is fine
    fitToTrack();
  }, [fitToTrack]);

  // Same rationale as onMapReady: stable identity for the native MapView prop.
  const onMapLoaded = React.useCallback(() => {
    setIsMapReady(true);
    fitToTrack();
  }, [fitToTrack]);

  // Fallback mechanism for map initialization issues
  React.useEffect(() => {
    if (coordinates?.length && !isMapReady) {
      const fallbackTimer = setTimeout(() => {
        if (!isMapReady && mapRef.current) {
          setIsMapReady(true);
          fitToTrack();
        }
      }, 1000); // 1 second fallback

      return () => clearTimeout(fallbackTimer);
    }
    return undefined; // Explicit return for all code paths
  }, [coordinates, isMapReady, fitToTrack]);

  // Stable identity for the native onLayout prop (see onMapReady rationale).
  // Fallback when layout completes (Fabric/new arch can delay readiness)
  const onLayout = React.useCallback(() => {
    if (isMapReady) fitToTrack();
  }, [isMapReady, fitToTrack]);

  // Final guard: when coordinates change and map is ready, try again on next tick
  React.useEffect(() => {
    if (!isMapReady) return;
    const id = setTimeout(() => {
      fitToTrack();
    }, 0);
    return () => clearTimeout(id);
  }, [isMapReady, fitToTrack]);

  // Handle navigation focus to re-initialize map
  useFocusEffect(
    React.useCallback(() => {
      // Reset map state when screen comes into focus
      setIsMapReady(false);
      setMapKey(prev => prev + 1); // Force map re-render

      // Small delay to ensure proper initialization
      const timer = setTimeout(() => {
        if (coordinates?.length) {
          fitToTrack();
        }
      }, 100);

      return () => {
        clearTimeout(timer);
      };
    }, [coordinates, fitToTrack])
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (mapRef.current) {
        // Reset map reference to help with garbage collection
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        key={mapKey} // Force re-render when mapKey changes
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        showsMyLocationButton={false}
        zoomControlEnabled={true}
        showsCompass={true}
        showsUserLocation={false}
        showsScale={true}
        loadingEnabled={false}
        loadingIndicatorColor={'green'}
        onMapReady={onMapReady}
        onMapLoaded={onMapLoaded}
        onLayout={onLayout}
        initialRegion={initialRegion}
        userInterfaceStyle="light" // Force light theme regardless of system theme
      >
        <MiniMapLayers
          coordinates={coordinates}
          overlayCoordinates={props.overlayStream?.coordinates}
        />
      </MapView>

      {canShowFlyover ? (
        <MiniMapFlyover
          visible={isFlyoverOpen}
          onOpen={() => setIsFlyoverOpen(true)}
          onClose={() => setIsFlyoverOpen(false)}
          stream={props.stream}
          title={props.title}
          theme={theme}
          styles={styles}
        />
      ) : null}
    </View>
  );
}
