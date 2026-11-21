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
  overlaySecondaryStream?: ActivityStream;
  title?: string;
  activityType?: string;
  allowFlyover?: boolean;
  highlightCoordinate?: LatLng | null;
  /** Optional custom color for the overlay stream (defaults to theme.info) */
  overlayColor?: string;
  /** Optional explicit coordinates to fit the map camera to instead of stream.coordinates */
  fitCoordinates?: LatLng[];
  /** Whether to automatically re-fit camera when coordinates change (defaults to true) */
  autoFitOnCoordinateChange?: boolean;
  /** Whether to show direction arrow badges along the track (defaults to true) */
  showDirectionArrows?: boolean;
  /** Whether to show a recenter / fit-to-track button on the map (defaults to false) */
  showRecenterButton?: boolean;
};

// Adjust this constant to control how many direction arrows are displayed along the track
// Recommended values are between 2 and 10
const NUM_DIRECTION_ARROWS = APP_CONFIG.NUM_DIRECTION_ARROWS;

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
  overlaySecondaryCoordinates?: LatLng[];
  highlightCoordinate?: LatLng | null;
  region?: Region | null;
  primaryColor: string;
  overlayColor: string;
  showDirectionArrows?: boolean;
};

function renderTrackPolylines(
  coordinates: LatLng[] | undefined,
  primaryColor: string,
  overlayCoordinates: LatLng[] | undefined,
  overlaySecondaryCoordinates: LatLng[] | undefined,
  overlayColor: string
) {
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
        <Polyline coordinates={coordinates} strokeWidth={5} strokeColor={primaryColor} />
      ) : null}
      {overlayCoordinates?.length ? (
        <Polyline coordinates={overlayCoordinates} strokeWidth={4} strokeColor={overlayColor} />
      ) : null}
      {overlaySecondaryCoordinates?.length ? (
        <Polyline
          coordinates={overlaySecondaryCoordinates}
          strokeWidth={4}
          strokeColor={overlayColor}
        />
      ) : null}
    </>
  );
}

function MiniMapLayers({
  coordinates,
  overlayCoordinates,
  overlaySecondaryCoordinates,
  highlightCoordinate,
  region,
  primaryColor,
  overlayColor,
  showDirectionArrows = true
}: Readonly<MiniMapLayersProps>) {
  const scrubberOccupied = highlightCoordinate ? [highlightCoordinate] : [];
  const primaryArrows = showDirectionArrows
    ? computeDirectionArrows(coordinates, {
        baseArrowCount: NUM_DIRECTION_ARROWS,
        region,
        occupiedCoordinates: scrubberOccupied
      })
    : null;
  const overlayArrows =
    showDirectionArrows && primaryArrows
      ? computeDirectionArrows(overlayCoordinates, {
          baseArrowCount: NUM_DIRECTION_ARROWS,
          region,
          isOverlay: true,
          occupiedCoordinates: [...scrubberOccupied, ...primaryArrows.arrows.map(a => a.coordinate)]
        })
      : null;

  return (
    <>
      {renderTrackPolylines(
        coordinates,
        primaryColor,
        overlayCoordinates,
        overlaySecondaryCoordinates,
        overlayColor
      )}
      {primaryArrows
        ? renderDirectionArrowMarkers(
            primaryArrows.arrows,
            primaryArrows.visualSpec,
            primaryColor,
            'primary',
            PRIMARY_ARROW_Z_INDEX
          )
        : null}
      {overlayArrows
        ? renderDirectionArrowMarkers(
            overlayArrows.arrows,
            overlayArrows.visualSpec,
            overlayColor,
            'overlay',
            OVERLAY_ARROW_Z_INDEX
          )
        : null}
      {highlightCoordinate ? (
        <Marker coordinate={highlightCoordinate} anchor={{ x: 0.5, y: 0.5 }} zIndex={100}>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#FFFFFF',
              borderWidth: 3,
              borderColor: primaryColor,
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
    },
    recenterPill: {
      position: 'absolute',
      top: 10,
      left: 10,
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
    recenterPillText: {
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

function MiniMapRecenterButton({
  onPress,
  theme,
  styles
}: Readonly<{
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createStyles>;
}>) {
  return (
    <TouchableOpacity
      style={styles.recenterPill}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Fit track to screen"
    >
      <Ionicons name="scan-outline" size={13} color={theme.primary} />
      <Text style={styles.recenterPillText}>Fit Route</Text>
    </TouchableOpacity>
  );
}

interface MapCameraLifecycleOptions {
  mapRef: React.RefObject<MapView | null>;
  fitCoords: LatLng[] | undefined;
  isMapReady: boolean;
  setIsMapReady: (ready: boolean) => void;
  setCurrentRegion: (region: Region | null) => void;
  setMapKey: React.Dispatch<React.SetStateAction<number>>;
  autoFitOnCoordinateChange: boolean;
}

function useMapCameraLifecycle(options: Readonly<MapCameraLifecycleOptions>) {
  const {
    mapRef,
    fitCoords,
    isMapReady,
    setIsMapReady,
    setCurrentRegion,
    setMapKey,
    autoFitOnCoordinateChange
  } = options;

  const fitToTrack = React.useCallback(() => {
    if (!fitCoords?.length || !mapRef.current) return;
    try {
      mapRef.current.fitToCoordinates(fitCoords, {
        edgePadding: { top: 16, right: 16, bottom: 16, left: 16 },
        animated: true
      });
    } catch {
      // Swallow occasional race conditions from native side
    }
  }, [fitCoords, mapRef]);

  const onMapReady = React.useCallback(() => {
    setIsMapReady(true);
    fitToTrack();
  }, [fitToTrack, setIsMapReady]);

  const onMapLoaded = React.useCallback(() => {
    setIsMapReady(true);
    fitToTrack();
  }, [fitToTrack, setIsMapReady]);

  React.useEffect(() => {
    if (fitCoords?.length && !isMapReady) {
      const fallbackTimer = setTimeout(() => {
        if (!isMapReady && mapRef.current) {
          setIsMapReady(true);
          fitToTrack();
        }
      }, 1000);

      return () => clearTimeout(fallbackTimer);
    }
    return undefined;
  }, [fitCoords, isMapReady, fitToTrack, mapRef, setIsMapReady]);

  const onLayout = React.useCallback(() => {
    if (isMapReady && autoFitOnCoordinateChange) fitToTrack();
  }, [isMapReady, autoFitOnCoordinateChange, fitToTrack]);

  React.useEffect(() => {
    if (!isMapReady || !autoFitOnCoordinateChange) return;
    const id = setTimeout(() => {
      fitToTrack();
    }, 0);
    return () => clearTimeout(id);
  }, [isMapReady, fitToTrack, autoFitOnCoordinateChange]);

  const fitToTrackRef = React.useRef(fitToTrack);
  React.useEffect(() => {
    fitToTrackRef.current = fitToTrack;
  });

  useFocusEffect(
    React.useCallback(() => {
      setIsMapReady(false);
      setCurrentRegion(null);
      setMapKey(prev => prev + 1);

      const timer = setTimeout(() => {
        fitToTrackRef.current();
      }, 100);

      return () => {
        clearTimeout(timer);
      };
    }, [setIsMapReady, setCurrentRegion, setMapKey])
  );

  return { fitToTrack, onMapReady, onMapLoaded, onLayout };
}

interface ResolvedMiniMapProps {
  coordinates: LatLng[] | undefined;
  fitCoords: LatLng[] | undefined;
  initialRegion:
    | { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }
    | undefined;
  showDirectionArrows: boolean;
  autoFitOnCoordinateChange: boolean;
  canShowFlyover: boolean;
  canShowRecenter: boolean;
  overlayColor: string;
}

function resolveMiniMapProps(
  props: Readonly<MiniMapComponentProps>,
  isMapReady: boolean,
  defaultOverlayColor: string
): ResolvedMiniMapProps {
  const coordinates = props.stream?.coordinates;
  const fitCoords = props.fitCoordinates?.length ? props.fitCoordinates : coordinates;
  const initialRegion = fitCoords?.length
    ? { ...fitCoords[0], latitudeDelta: 0.1, longitudeDelta: 0.1 }
    : undefined;
  const hasGpsTrack = Boolean(coordinates && coordinates.length >= 2);
  const allowFlyover = props.allowFlyover !== false;
  return {
    coordinates,
    fitCoords,
    initialRegion,
    showDirectionArrows: props.showDirectionArrows !== false,
    autoFitOnCoordinateChange: props.autoFitOnCoordinateChange !== false,
    canShowFlyover: Boolean(hasGpsTrack && allowFlyover && isMapReady),
    canShowRecenter: Boolean(props.showRecenterButton && isMapReady && fitCoords?.length),
    overlayColor: props.overlayColor ?? defaultOverlayColor
  };
}

export default function MiniMapComponent(props: Readonly<MiniMapComponentProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = React.useRef<MapView>(null);
  const [isFlyoverOpen, setIsFlyoverOpen] = React.useState(false);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const [currentRegion, setCurrentRegion] = React.useState<Region | null>(null);
  const [mapKey, setMapKey] = React.useState(0);

  const resolved = resolveMiniMapProps(props, isMapReady, theme.info);

  const { fitToTrack, onMapReady, onMapLoaded, onLayout } = useMapCameraLifecycle({
    mapRef,
    fitCoords: resolved.fitCoords,
    isMapReady,
    setIsMapReady,
    setCurrentRegion,
    setMapKey,
    autoFitOnCoordinateChange: resolved.autoFitOnCoordinateChange
  });

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
            initialRegion={resolved.initialRegion}
            userInterfaceStyle="light" // Force light theme regardless of system theme
          >
            <MiniMapLayers
              coordinates={resolved.coordinates}
              overlayCoordinates={props.overlayStream?.coordinates}
              overlaySecondaryCoordinates={props.overlaySecondaryStream?.coordinates}
              highlightCoordinate={props.highlightCoordinate}
              region={currentRegion}
              primaryColor={theme.primary}
              overlayColor={resolved.overlayColor}
              showDirectionArrows={resolved.showDirectionArrows}
            />
          </MapView>

          {resolved.canShowFlyover ? (
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

          {resolved.canShowRecenter ? (
            <MiniMapRecenterButton onPress={fitToTrack} theme={theme} styles={styles} />
          ) : null}
        </>
      )}
    </View>
  );
}
