import { useActivitiesContext } from '@/features/activities/ActivitiesContext';
import { useManualEntry } from '@/features/activities/ManualEntryContext';
import {
  deleteStreamFiles,
  getNoStreamIds
} from '@/features/activities/services/fetchAndStoreStreams';
import {
  Activity,
  compareActivitiesByUtcDesc,
  DetailsScreenProps,
  isNoGpsActivity,
  simpleLogger
} from '@/shared';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useTheme } from '@/theme';
import React, { JSX, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityAnalysisView } from '../components/ActivityAnalysisView';
import { ActivityListItem } from '../components/ActivityListItem';

// This is the default configuration
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false //TMP to remove the warning
});

/**
 * The "+" in the Activities header. A module-level component (not an inline
 * render closure): defining it inside the screen would remount the button on
 * every render. Data flows in as props.
 */
function AddActivityHeaderButton({
  onPress,
  color
}: Readonly<{ onPress: () => void; color: string }>): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel="Add activity"
      accessibilityRole="button"
      style={{ marginRight: 12, padding: 6 }}
    >
      <Ionicons name="add" size={24} color={color} />
    </TouchableOpacity>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 0,
      paddingBottom: 20
    },
    listContainer: {
      flex: 1,
      width: '100%'
    },
    list: {
      flex: 1,
      width: '100%'
    },
    mapContainer: {
      flex: 2
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12
    },
    searchInput: {
      flex: 1,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 8
    },
    clearButton: {
      padding: 8,
      borderRadius: 6,
      backgroundColor: theme.surfaceSunken
    }
  });

/**
 * A screen for displaying a list of activities and a map of the selected activity.
 * @param navigation The navigation object.
 * @param route The route object.
 * @returns A React component.
 */
export function DetailsScreen({ navigation, route }: Readonly<DetailsScreenProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideNoStream, setHideNoStream] = useState<boolean>(false);
  const [noStreamIds, setNoStreamIds] = useState<Set<string>>(new Set());
  const { globalActivities, deleteActivity, refreshActivities, fetchingData } =
    useActivitiesContext();
  const { openManualEntry } = useManualEntry();
  const insets = useSafeAreaInsets();

  // If route.params has activities it's a filtered view from Maps — use them.
  // Otherwise (navigated from Home), use live context data so pull-to-refresh works.
  const allActivities = route.params?.allActivities ?? globalActivities;

  // Reset selected activity if it's no longer in the updated activities list
  React.useEffect(() => {
    if (selectedActivity && !allActivities.some(a => a.id === selectedActivity.id)) {
      setSelectedActivity(null);
    }
  }, [allActivities, selectedActivity]);

  // Debug log to track activities updates
  React.useEffect(() => {
    simpleLogger.log('Activities list updated', {
      activityCount: allActivities.length,
      timestamp: new Date().toISOString()
    });
  }, [allActivities]);

  const onDeleteActivity = (activity: Activity) => {
    deleteActivity(activity);
    try {
      deleteStreamFiles(activity.id);
    } catch (error) {
      // The service already logged the detail; a failed stream cleanup must
      // not blow up the user-facing delete action.
      simpleLogger.error('Failed to delete stream files for deleted activity', error);
    }
  };

  const keyExtractor = (item: Activity) => item.id;

  // Stable element factory for the header: the button itself is hoisted
  // above, so no component is defined during render.
  const renderHeaderRight = React.useCallback(
    () => <AddActivityHeaderButton onPress={openManualEntry} color={theme.primary} />,
    [openManualEntry, theme]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Activities (${allActivities.length})`,
      // RECORD-CHOOSER: when GPS tracking lands, this becomes a Track/Manual
      // chooser instead of opening the manual sheet directly.
      headerRight: renderHeaderRight
    });
  }, [navigation, allActivities, renderHeaderRight]);

  const sortedActivities = [...allActivities].sort(compareActivitiesByUtcDesc);

  React.useEffect(() => {
    const loadNoStreamIds = async () => {
      if (!hideNoStream) return;
      const ids = await getNoStreamIds(allActivities);
      setNoStreamIds(ids);
    };
    loadNoStreamIds().catch(error =>
      simpleLogger.error('Failed to load no-stream activity ids', error)
    );
  }, [hideNoStream, allActivities]);

  const query = searchQuery.trim().toLowerCase();
  const baseActivities =
    query.length === 0
      ? sortedActivities
      : sortedActivities.filter(a => (a.name || '').toLowerCase().includes(query));
  const filteredActivities = hideNoStream
    ? baseActivities.filter(a => !isNoGpsActivity(a.type) && !noStreamIds.has(a.id))
    : baseActivities;

  const handleActivityPress = (activityId: string) => {
    setSelectedActivity(prev => {
      if (prev?.id === activityId) {
        return null;
      }
      return allActivities.find(a => a.id === activityId) || null;
    });
  };

  const renderItem = ({ item }: { item: Activity }) => (
    <ActivityListItem
      activity={item}
      onPress={handleActivityPress}
      selectedActivityId={selectedActivity?.id ?? null}
      deleteActivity={onDeleteActivity}
    />
  );

  const clearSearch = () => {
    setSearchQuery('');
  };

  return (
    <View style={[styles.container, { paddingTop: 0, paddingBottom: insets.bottom }]}>
      <View style={styles.listContainer}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name="map-check-outline"
            size={20}
            color={theme.textMuted}
            style={{ marginRight: 8 }}
          />
          <Switch
            value={hideNoStream}
            onValueChange={setHideNoStream}
            accessibilityLabel="Hide activities without streams"
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            accessibilityLabel="Search activities by name"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={clearSearch}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.list}>
          <FlashList
            data={filteredActivities}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            extraData={selectedActivity}
            onRefresh={refreshActivities}
            refreshing={fetchingData}
          />
        </View>
      </View>
      {selectedActivity ? (
        <View style={styles.mapContainer}>
          <ActivityAnalysisView item={selectedActivity} allActivities={allActivities} />
        </View>
      ) : null}
    </View>
  );
}
