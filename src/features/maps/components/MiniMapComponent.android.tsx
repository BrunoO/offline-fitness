import { APP_CONFIG } from '@/constants';
import { ActivityStream, LatLng } from '@/shared';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import {
  computeDirectionArrows,
  DirectionArrowPlacement,
  DirectionArrowVisualSpec
} from '../services/directionArrows';
import { HAS_GOOGLE_MAPS_KEY } from '../services/googleMapsKey';
import FlyoverModal from './FlyoverModal';
import MapsUnavailablePlaceholder from './MapsUnavailablePlaceholder';

export type MiniMapComponentProps = {
  stream: ActivityStream | undefined;
  overlayStream?: ActivityStream;
  title?: string;
  activityType?: string;
  allowFlyover?: boolean;
  highlightCoordinate?: LatLng | null;
};

// Adjust this constant to control how many direction arrows are displayed along the track
// Recommended values are between 2 and 10
const NUM_DIRECTION_ARROWS = APP_CONFIG.NUM_DIRECTION_ARROWS;

// Track colors
const TRACK_PRIMARY_COLOR = APP_CONFIG.TRACK_COLORS.PRIMARY;
const TRACK_OVERLAY_COLOR = APP_CONFIG.TRACK_COLORS.OVERLAY;
const FILL_PRIMARY_COLOR = APP_CONFIG.TRACK_COLORS.FILL_PRIMARY;
// High-contrast solid badge fills (WCAG AA >= 6.4:1 against white chevron & ring,
// and tonally deeper than the #EF4444 / #3B82F6 polylines underneath)
const ARROW_PRIMARY_COLOR = '#B91C1C';
const ARROW_OVERLAY_COLOR = '#1D4ED8';
const ARROW_BADGE_HALO_COLOR = '#FFFFFF';
const PRIMARY_ARROW_Z_INDEX = 30;
const OVERLAY_ARROW_Z_INDEX = 20;

const renderDirectionArrowMarkers = (
  arrows: readonly DirectionArrowPlacement[],
  visualSpec: DirectionArrowVisualSpec,
  color: string,
  layerKey: string,
  zIndex: number
) => {
  if (arrows.length === 0) {
    return null;
  }

  const { badgeSize, borderWidth } = visualSpec;
  const chevronArmSize = Math.max(5, Math.round(badgeSize * 0.36));
  const chevronStrokeWidth = badgeSize >= 18 ? 2.2 : 2;
  const chevronOpticalOffsetY = Math.round(chevronArmSize * 0.22 * 10) / 10;

  return arrows.map((arrow, i) => (
    <Marker
      coordinate={arrow.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      tappable={false}
      rotation={arrow.bearing}
      tracksViewChanges={false}
      zIndex={zIndex}
      key={`${layerKey}-${i}-${Math.round(arrow.distanceMeters)}-${badgeSize}`}
    >
      <View
        testID={`direction-arrow-badge-${layerKey}`}
        pointerEvents="none"
        style={{
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: color,
          borderWidth,
          borderColor: ARROW_BADGE_HALO_COLOR,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 3
        }}
      >
        <View
          testID={`direction-arrow-chevron-${layerKey}`}
          style={{
            width: chevronArmSize,
            height: chevronArmSize,
            borderTopWidth: chevronStrokeWidth,
            borderLeftWidth: chevronStrokeWidth,
            borderColor: ARROW_BADGE_HALO_COLOR,
            transform: [{ translateY: chevronOpticalOffsetY }, { rotate: '45deg' }]
          }}
        />
      </View>
    </Marker>
  ));
};

type MiniMapLayersProps = {
  coordinates: LatLng[] | undefined;
  overlayCoordinates: LatLng[] | undefined;
  highlightCoordinate?: LatLng | null;
  region?: Region | null;
};

function MiniMapLayers({
  coordinates,
  overlayCoordinates,
  highlightCoordinate,
  region
}: Readonly<MiniMapLayersProps>) {
  const scrubberOccupied = highlightCoordinate ? [highlightCoordinate] : [];
  const primaryArrows = computeDirectionArrows(coordinates, {
    baseArrowCount: NUM_DIRECTION_ARROWS,
    region,
    occupiedCoordinates: scrubberOccupied
  });
  const overlayArrows = computeDirectionArrows(overlayCoordinates, {
    baseArrowCount: NUM_DIRECTION_ARROWS,
    region,
    isOverlay: true,
    occupiedCoordinates: [...scrubberOccupied, ...primaryArrows.arrows.map(a => a.coordinate)]
  });

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
      {renderDirectionArrowMarkers(
        primaryArrows.arrows,
        primaryArrows.visualSpec,
        ARROW_PRIMARY_COLOR,
        'primary',
        PRIMARY_ARROW_Z_INDEX
      )}
      {renderDirectionArrowMarkers(
        overlayArrows.arrows,
        overlayArrows.visualSpec,
        ARROW_OVERLAY_COLOR,
        'overlay',
        OVERLAY_ARROW_Z_INDEX
      )}
      {highlightCoordinate ? (
        <Marker coordinate={highlightCoordinate} anchor={{ x: 0.5, y: 0.5 }} zIndex={100}>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#FFFFFF',
              borderWidth: 3,
              borderColor: '#1976D2',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.35,
              shadowRadius: 3,
              elevation: 5
            }}
          />
        </Marker>
      ) : null}
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
  activityType?: string;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createStyles>;
};

function MiniMapFlyover({
  visible,
  onOpen,
  onClose,
  stream,
  title,
  activityType,
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
      <FlyoverModal
        visible={visible}
        onClose={onClose}
        stream={stream}
        title={title}
        activityType={activityType}
      />
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
  const [currentRegion, setCurrentRegion] = React.useState<Region | null>(null);
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
      setCurrentRegion(null);
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
      {!HAS_GOOGLE_MAPS_KEY ? (
        <MapsUnavailablePlaceholder />
      ) : (
        <>
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
            onRegionChangeComplete={setCurrentRegion}
            initialRegion={initialRegion}
            userInterfaceStyle="light" // Force light theme regardless of system theme
          >
            <MiniMapLayers
              coordinates={coordinates}
              overlayCoordinates={props.overlayStream?.coordinates}
              highlightCoordinate={props.highlightCoordinate}
              region={currentRegion}
            />
          </MapView>

          {canShowFlyover ? (
            <MiniMapFlyover
              visible={isFlyoverOpen}
              onOpen={() => setIsFlyoverOpen(true)}
              onClose={() => setIsFlyoverOpen(false)}
              stream={props.stream}
              title={props.title}
              activityType={props.activityType}
              theme={theme}
              styles={styles}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
