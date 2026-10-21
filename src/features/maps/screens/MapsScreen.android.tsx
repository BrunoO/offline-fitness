import ButtonList from '@/features/home/components/ButtonList';
import {
  activityLocalDate,
  activityToString,
  Activity,
  ActivityWithStream,
  IconButton,
  isNoGpsActivity,
  MapsScreenProps,
  minMaxDateRange,
  simpleLogger,
  toLocalDateString
} from '@/shared';
import DateTimePicker from '@react-native-community/datetimepicker';
import MapView, {
  Heatmap,
  MapType,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region
} from 'react-native-maps';

import { getActivityStreams, useActivitiesDataContext } from '@/features/activities';
import { useTheme } from '@/theme';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocationPermission } from '../hooks/useLocationPermission';

/**
 * Checks if a lat/lng is inside a region.
 * @param latitude The latitude of the point.
 * @param longitude The longitude of the point.
 * @param region The region to check against.
 * @returns True if the point is inside the region, false otherwise.
 */
const isLatLngInsideRegion = (latitude: number, longitude: number, region: Region) => {
  if (isNaN(latitude) || isNaN(longitude)) {
    return false;
  } else
    return (
      latitude >= region.latitude - region.latitudeDelta / 2 &&
      latitude <= region.latitude + region.latitudeDelta / 2 &&
      longitude >= region.longitude - region.longitudeDelta / 2 &&
      longitude <= region.longitude + region.longitudeDelta / 2
    );
};

const MAX_HEATMAP_STREAMS = 1000;
const MAX_COORDS_PER_STREAM = 1000;

function sampleCoordinates<T>(coords: T[], maxPoints: number): T[] {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  return coords.filter((_, i) => i % step === 0);
}

/**
 * The maps screen of the app.
 * @param navigation The navigation object.
 * @returns A React component.
 */
export default function MapsScreen({ navigation }: Readonly<MapsScreenProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { globalActivities: allActivities, myActivitiesDiscovered: activityTypes } =
    useActivitiesDataContext();
  const insets = useSafeAreaInsets();
  const isLocationGranted = useLocationPermission();
  const activityTypesWithDistance = Array.from(activityTypes).filter(a => !isNoGpsActivity(a));
  const activitiesWithDistance = allActivities.filter(a => !isNoGpsActivity(a.type));

  const { minDate, maxDate } = minMaxDateRange(activitiesWithDistance);

  const [startDate, setStartDate] = useState<Date>(minDate);
  const [endDate, setEndDate] = useState<Date>(maxDate);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [selectedActivitys, setSelectedActivitys] = useState<string[]>([]);

  const [loadedStreams, setLoadedStreams] = useState<ActivityWithStream[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState<
    { latitude: number; longitude: number; weight: number }[]
  >([]);
  const [showHeatmap, setShowHeatamp] = useState<boolean>(false);

  const toggleHeatmap = () => {
    setShowHeatamp(prev => {
      if (prev) setHeatmapData([]); // free memory when hiding
      return !prev;
    });
  };

  const [currentRegion, setCurrentRegion] = useState<Region>({
    // default to France
    latitude: 46.14,
    latitudeDelta: 10,
    longitude: 3.3,
    longitudeDelta: 10
  });

  // const [mapType, setMapType] = useState<MapType>(MAP_TYPES.STANDARD);
  // const toggleMapType = () =>
  //   setMapType(
  //     mapType === MAP_TYPES[MAP_TYPES.STANDARD]
  //       ? MAP_TYPES[MAP_TYPES.SATELLITE]
  //       : MAP_TYPES.STANDARD
  //   );

  const regionDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRegionChangeCompleted = (region: Region) => {
    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    regionDebounceRef.current = setTimeout(() => {
      setCurrentRegion(region);
      regionDebounceRef.current = null;
    }, 400);
  };

  const [mapType, setMapType] = useState<MapType>('standard');

  const toggleMapType = () => {
    let newType: MapType = 'standard';
    switch (mapType) {
      case 'standard':
        newType = 'satellite';
        break;
      case 'satellite':
        newType = 'hybrid';
        break;
      case 'hybrid':
        newType = 'terrain';
        break;
      case 'terrain':
        newType = 'standard';
        break;
    }
    setMapType(newType);
  };

  useEffect(() => {
    if (!showHeatmap || loadedStreams.length === 0) return;
    const r = loadedStreams.slice(0, MAX_HEATMAP_STREAMS).flatMap(({ streamSet }) =>
      sampleCoordinates(streamSet.coordinates, MAX_COORDS_PER_STREAM)
        .filter(c => isLatLngInsideRegion(c.latitude, c.longitude, currentRegion))
        .map(c => ({
          latitude: c.latitude,
          longitude: c.longitude,
          weight: 1
        }))
    );
    setHeatmapData(r);
  }, [loadedStreams, showHeatmap, currentRegion]);

  const mapRef = React.useRef<MapView>(null);

  const refitTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (refitTimeoutRef.current) {
        clearTimeout(refitTimeoutRef.current);
        refitTimeoutRef.current = null;
      }
      if (regionDebounceRef.current) {
        clearTimeout(regionDebounceRef.current);
        regionDebounceRef.current = null;
      }
    };
  }, []);

  const onActivityPressed = (item: string) => {
    const wasEmpty = selectedActivitys.length === 0;

    if (selectedActivitys.includes(item)) {
      setSelectedActivitys(selectedActivities => selectedActivities.filter(a => a !== item));
    } else {
      setSelectedActivitys(selectedActivities => [...selectedActivities, item]);

      // Only refit when user first selects an activity type (not on every change)
      if (wasEmpty) {
        // User just selected their first activity type
        if (refitTimeoutRef.current) {
          clearTimeout(refitTimeoutRef.current);
        }
        refitTimeoutRef.current = setTimeout(() => {
          refitMapToVisibleActivities();
          refitTimeoutRef.current = null;
        }, 100); // Small delay to ensure state is updated
      }
    }
  };

  const onMapReady = () => {
    // Only fit to elements if there are visible activities
    if (currentlyFilteredActivities.length > 0) {
      mapRef.current?.fitToElements({
        animated: true,
        edgePadding: {
          top: 100,
          right: 100,
          bottom: 200,
          left: 100
        }
      });
    } else {
      // Fallback: fit to all activities with distance
      const allActivityCoordinates = activitiesWithDistance
        .filter(activity => !isNaN(activity.start_latlng[0]) && !isNaN(activity.start_latlng[1]))
        .map(activity => ({
          latitude: activity.start_latlng[0],
          longitude: activity.start_latlng[1]
        }));

      if (allActivityCoordinates.length > 0) {
        mapRef.current?.fitToCoordinates(allActivityCoordinates, {
          animated: true,
          edgePadding: {
            top: 100,
            right: 100,
            bottom: 200,
            left: 100
          }
        });
      }
    }
  };

  const handleManualRefit = () => {
    refitMapToVisibleActivities();
  };

  /**
   * Sets the date filter to the current year.
   */
  function setFilterToThisYear() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    setStartDate(startOfYear);
    setEndDate(now);
  }

  /**
   * Sets the date filter to the last year.
   */
  function setFilterToLastYear() {
    const now = new Date();
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
    const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
    setStartDate(startOfLastYear);
    setEndDate(endOfLastYear);
  }

  /**
   * Loads the streams for the currently filtered activities.
   */
  const loadStreamsAsync = async () => {
    setIsLoading(true);
    setLoadedStreams([]);
    try {
      const data = await getActivityStreams(currentlyFilteredActivities);
      setLoadedStreams(data);
    } catch (error) {
      simpleLogger.error('Failed to load streams for map visualization:', error);
    }
    setIsLoading(false);
  };

  /**
   * Filters the activities based on the current filter settings.
   * @returns The filtered activities.
   */
  function filterActivities(): Activity[] {
    // Compare athlete-local calendar dates as strings (YYYY-MM-DD sorts lexicographically).
    const startDay = startDate ? toLocalDateString(startDate) : undefined;
    const endDay = endDate ? toLocalDateString(endDate) : undefined;
    return activitiesWithDistance.filter(activity => {
      const activityDay = activityLocalDate(activity);
      return (
        (!startDay || activityDay >= startDay) &&
        (!endDay || activityDay <= endDay) &&
        selectedActivitys.includes(activity.type) &&
        isLatLngInsideRegion(activity.start_latlng[0], activity.start_latlng[1], currentRegion)
      );
    });
  }

  const currentlyFilteredActivities = filterActivities();

  const refitMapToVisibleActivities = () => {
    if (currentlyFilteredActivities.length > 0) {
      const coordinates = currentlyFilteredActivities
        .filter(activity => !isNaN(activity.start_latlng[0]) && !isNaN(activity.start_latlng[1]))
        .map(activity => ({
          latitude: activity.start_latlng[0],
          longitude: activity.start_latlng[1]
        }));

      if (coordinates.length > 0) {
        mapRef.current?.fitToCoordinates(coordinates, {
          animated: true,
          edgePadding: {
            top: 100,
            right: 100,
            bottom: 200,
            left: 100
          }
        });
      }
    }
  };

  // Only refit when user explicitly changes date filters, not on every activity change
  // useEffect(() => {
  //   // Only refit if we have selected activity types and user has changed date filters
  //   if (selectedActivitys.length > 0) {
  //     refitMapToVisibleActivities();
  //   }
  // }, [startDate, endDate, selectedActivitys.length, refitMapToVisibleActivities]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: insets.top,
        paddingBottom: insets.bottom
      }}
    >
      <View style={{ flex: 1, width: '100%' }}>
        {allActivities.length === 0 ? (
          <Text style={{ textAlign: 'center', marginVertical: 20 }}>No activities available</Text>
        ) : (
          <MapView
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            ref={mapRef}
            showsMyLocationButton={isLocationGranted}
            zoomControlEnabled={true}
            showsCompass={true}
            showsUserLocation={isLocationGranted}
            showsScale={true}
            loadingEnabled={false}
            loadingIndicatorColor={'green'}
            onMapReady={onMapReady}
            mapType={mapType}
            onRegionChangeComplete={onRegionChangeCompleted}
            initialRegion={currentRegion}
            userInterfaceStyle="light" // Force light theme regardless of system theme
            //onPress={toggleMapType}
          >
            {currentlyFilteredActivities.map(
              activity =>
                !isNaN(activity.start_latlng[0]) &&
                !isNaN(activity.start_latlng[1]) && (
                  <Marker
                    key={activity.id}
                    coordinate={{
                      latitude: activity.start_latlng[0],
                      longitude: activity.start_latlng[1]
                    }}
                    title={'Start'}
                    description={'Start of ' + activityToString(activity)}
                    pinColor="green"
                  />
                )
            )}

            {!isLoading ? (
              showHeatmap && heatmapData.length > 0 ? (
                <Heatmap
                  points={heatmapData}
                  opacity={0.7}
                  radius={20}
                  gradient={{
                    colors: theme.mapTrack,
                    startPoints: [0.1, 0.5, 1],
                    colorMapSize: 256
                  }}
                />
              ) : (
                loadedStreams.map(({ streamSet }, index) => (
                  <Polyline
                    key={index}
                    coordinates={streamSet.coordinates}
                    strokeWidth={2}
                    strokeColor={`hsl(${(index * 30) % 360}, 100%, 50%)`}
                    fillColor="rgba(255,0,0,0.5)"
                  />
                ))
              )
            ) : null}
          </MapView>
        )}
        <View style={styles.mapButtonsOverlayContainer}>
          <IconButton
            icon="drive-folder-upload"
            onPress={loadStreamsAsync}
            buttonStyle={styles.iconButton}
          />
          <IconButton
            icon="fit-screen"
            onPress={handleManualRefit}
            buttonStyle={styles.iconButton}
          />
          <IconButton icon="layers" onPress={toggleMapType} buttonStyle={styles.iconButton} />
          <IconButton icon="auto-awesome" onPress={toggleHeatmap} buttonStyle={styles.iconButton} />
          <IconButton
            icon="filter-list"
            onPress={() =>
              navigation.navigate('Details', {
                allActivities: currentlyFilteredActivities
              })
            }
            buttonStyle={styles.iconButton}
          />
        </View>
      </View>
      <View style={styles.mapActivitiesFilterOverlayContainer}>
        <ButtonList
          items={activityTypesWithDistance}
          selectedItems={selectedActivitys}
          handleOnPress={onActivityPressed}
          opacity={0.75}
        />
      </View>
      <View style={styles.mapTextOverlayContainer}>
        <Text style={styles.mapTextOverlay}>
          Activities: {currentlyFilteredActivities.length} / loaded streams:{' '}
          {isLoading ? 'loading...' : (loadedStreams?.length ?? 0)}
        </Text>
      </View>
      <View style={[styles.dateFilterOverlayContainer, { bottom: insets.bottom }]}>
        <Button title="Year-1" onPress={setFilterToLastYear} />
        <Button title="Year" onPress={setFilterToThisYear} />
        <Button
          title={`${startDate.toLocaleDateString()}`}
          onPress={() => setShowStartDatePicker(true)}
        />
        <Button
          title={`To: ${endDate.toLocaleDateString()}`}
          onPress={() => setShowEndDatePicker(true)}
        />
      </View>

      {showStartDatePicker ? (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={(event, selectedDate) => {
            const currentDate = selectedDate || startDate;
            setStartDate(currentDate);
            setShowStartDatePicker(false);
          }}
        />
      ) : null}
      {showEndDatePicker ? (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={(event, selectedDate) => {
            const currentDate = selectedDate || endDate;
            setEndDate(currentDate);
            setShowEndDatePicker(false);
          }}
        />
      ) : null}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    dateFilterOverlayContainer: {
      position: 'absolute',
      bottom: 0,
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '80%',
      marginVertical: 5,
      marginRight: 20,
      opacity: 0.75
    },
    mapTextOverlayContainer: {
      position: 'absolute',
      top: '8%',
      left: '3%'
    },
    mapActivitiesFilterOverlayContainer: {
      position: 'absolute',
      top: '1%',
      left: '3%'
    },

    mapTextOverlay: {
      backgroundColor: theme.surface,
      padding: 10,
      borderRadius: 5,
      opacity: 0.75,
      fontWeight: 'bold',
      color: theme.text
    },
    mapButtonsOverlayContainer: {
      position: 'absolute',
      top: '25%',
      alignSelf: 'flex-end',
      paddingRight: '3%',
      flexDirection: 'column'
    },
    iconButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      opacity: 0.5,
      padding: 10,
      borderRadius: 5
    },
    iconLabel: {
      color: theme.textOnSurface,
      marginLeft: 8
    }
  });
